import { z } from "zod"
import type { Types } from "mongoose"
import { loggerFor } from "@/lib/logger"
import { MADDOX_SCENE_IMAGE_DESCRIBE_TIMEOUT_MS, MADDOX_SCENE_IMAGE_CONSUMPTION_ORIGIN } from "../constants"
import { normalizeCatalogName } from "../catalog-markup"
import { MaddoxCampaignModel, MaddoxCharacterModel, MaddoxNpcModel, type IMaddoxCampaign } from "../models"
import { parseJsonObject } from "./interview-prompt"

/**
 * Descrição da cena atual para o pedido manual de imagem (Maddox 10): uma geração curta e efêmera do narrador (sem
 * stream nem ferramentas, teto de 30 s) devolve a descrição visual, a legenda e quem aparece. Roda na fila da campanha
 * (não disputa a sessão do OpenCode com uma narração). Falha ou teto: a última narração vira a descrição, com todos os
 * personagens ativos. Nunca lança.
 */

const log = loggerFor({ module: "maddox", feature: "scene-image-describer" })

export interface DescribedScene {
    description: string
    caption: string
    characters: string[]
    npcs: string[]
    catalog: { type: string; id: string }[]
}

const answerSchema = z.object({
    descricaoVisual: z.string().trim().min(1),
    legenda: z.string().optional().default(""),
    personagens: z.array(z.string()).optional().default([]),
    npcs: z.array(z.string()).optional().default([]),
})

const keyOf = (value: string) => normalizeCatalogName(value)

/** Só os nomes que existem na campanha (desconhecidos saem, com aviso no log). */
export function pickKnownNames(wanted: readonly string[], known: readonly string[]): { names: string[]; unknown: string[] } {
    const byKey = new Map(known.map((name) => [keyOf(name), name]))
    const names: string[] = []
    const unknown: string[] = []
    for (const name of wanted) {
        const found = byKey.get(keyOf(name))
        if (found && !names.includes(found)) names.push(found)
        else if (!found) unknown.push(name)
    }
    return { names, unknown }
}

export async function describeCurrentScene(campaignId: Types.ObjectId, lastNarration: string): Promise<DescribedScene> {
    const [campaign, characters, npcs] = await Promise.all([
        MaddoxCampaignModel.findById(campaignId).select("name rigor setting state").lean<Pick<IMaddoxCampaign, "name" | "rigor" | "setting" | "state">>(),
        MaddoxCharacterModel.find({ campaignId, status: "active", "interview.status": "done" }).select("name").lean<{ name: string }[]>(),
        MaddoxNpcModel.find({ campaignId, visibility: "players" }).select("name").lean<{ name: string }[]>(),
    ])
    const characterNames = characters.map((item) => item.name)
    const npcNames = npcs.map((item) => item.name)
    const fallback: DescribedScene = { description: lastNarration.trim().slice(0, 3000), caption: "", characters: characterNames, npcs: [], catalog: [] }
    try {
        const [{ loadNarrator }, { generateAiText }] = await Promise.all([import("./narrator"), import("@/lib/ai/stream")])
        const { model } = await loadNarrator(campaign?.rigor)
        const instructions = [
            "Você é Maddox, o mestre da campanha. O dono da mesa pediu uma ILUSTRAÇÃO da cena atual. Descreva visualmente, para um gerador de imagens, o que está acontecendo AGORA: lugar, luz, clima, quem aparece, posições e ação. Não revele segredos do mestre: só o que os jogadores veem.",
            `## Campanha "${campaign?.name ?? ""}"\n${campaign?.setting?.trim().slice(0, 3000) || "(sem cenário registrado)"}`,
            `## Estado atual\n- Cena: ${campaign?.state?.scene || "(não registrada)"}\n- Local: ${campaign?.state?.location || "(não registrado)"}\n- Situação: ${campaign?.state?.situation || "(não registrada)"}`,
            `## Personagens dos jogadores\n${characterNames.join(", ") || "(nenhum)"}`,
            `## NPCs conhecidos\n${npcNames.join(", ") || "(nenhum)"}`,
            'Responda SOMENTE com um objeto JSON: {"descricaoVisual": "a cena em detalhe, em português", "legenda": "uma frase curta para os jogadores", "personagens": ["nomes exatos da lista que aparecem"], "npcs": ["nomes exatos da lista que aparecem"]}.',
        ].join("\n\n")
        const controller = new AbortController()
        let timer: ReturnType<typeof setTimeout> | null = null
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
                controller.abort()
                reject(new Error(`descrição passou de ${MADDOX_SCENE_IMAGE_DESCRIBE_TIMEOUT_MS} ms`))
            }, MADDOX_SCENE_IMAGE_DESCRIBE_TIMEOUT_MS)
        })
        let text: string
        try {
            const result = await Promise.race([
                generateAiText({
                    provider: model.provider,
                    model: model.model,
                    agent: model.agent,
                    variant: model.variant,
                    instructions,
                    prompt: `Última narração:\n${lastNarration.trim().slice(0, 8000)}`,
                    title: `Maddox · imagem da cena · ${campaign?.name ?? ""}`,
                    consumption: { origin: MADDOX_SCENE_IMAGE_CONSUMPTION_ORIGIN, subject: String(campaignId) },
                    signal: controller.signal,
                }),
                timeout,
            ])
            text = result.text
        } finally {
            if (timer) clearTimeout(timer)
        }
        const answer = answerSchema.parse(parseJsonObject(text))
        const pickedCharacters = pickKnownNames(answer.personagens, characterNames)
        const pickedNpcs = pickKnownNames(answer.npcs, npcNames)
        const unknown = [...pickedCharacters.unknown, ...pickedNpcs.unknown]
        if (unknown.length) log.warn({ campaignId: String(campaignId), unknown }, "[maddox] a descrição da cena citou nomes fora da campanha; ignorados")
        return { description: answer.descricaoVisual, caption: answer.legenda.trim(), characters: pickedCharacters.names, npcs: pickedNpcs.names, catalog: [] }
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaignId) }, "[maddox] descrição da cena indisponível; usando a última narração")
        return fallback
    }
}
