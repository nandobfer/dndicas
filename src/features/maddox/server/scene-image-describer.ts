import { z } from "zod"
import type { Types } from "mongoose"
import { loggerFor } from "@/lib/logger"
import {
    MADDOX_SCENE_IMAGE_CONSUMPTION_ORIGIN,
    MADDOX_SCENE_IMAGE_DESCRIBE_TIMEOUT_MS,
    MADDOX_SCENE_IMAGE_LAST_TURN_TEXT_MAX,
    MADDOX_SCENE_IMAGE_PREVIOUS_TURN_TEXT_MAX,
} from "../constants"
import { normalizeCatalogName } from "../catalog-markup"
import { MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxNpcModel, type IMaddoxCampaign, type IMaddoxCampaignMessage } from "../models"
import { parseJsonObject } from "./interview-prompt"
import { appearanceBlock, loadCharacterAppearances } from "./scene-image-appearance"

/**
 * Descrição da cena atual para o pedido manual de imagem (Maddox 10): uma geração curta e efêmera do narrador (sem
 * stream nem ferramentas, teto de 30 s) devolve a descrição visual, a legenda e quem aparece. Roda na fila da campanha
 * (não disputa a sessão do OpenCode com uma narração). Falha ou teto: a última narração vira a descrição, com todos os
 * personagens ativos. Nunca lança.
 *
 * DND-33: a geração recebe a aparência registrada de cada personagem (`scene-image-appearance.ts`) e o ÚLTIMO TURNO em
 * destaque (declarações, testes e todos os trechos de narração do turno, com o último marcado como o momento a
 * retratar); a narração do turno anterior entra só como contexto.
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

export interface SceneTurnContext {
    turnNumber: number
    /** O que aconteceu no turno antes do último trecho, em ordem (declarações, testes, ações e narrações anteriores). */
    events: { label: string; text: string }[]
    /** Último trecho de narração: o momento a retratar. */
    lastNarration: string
    /** Narração do turno anterior (só contexto). */
    previousNarration: string
}

const flat = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim()
const cut = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value)

type TurnMessage = Pick<IMaddoxCampaignMessage, "_id" | "kind" | "characterName" | "content" | "check" | "combatAction">

/** Linha do último turno de uma mensagem (`null` = não entra). */
export function turnEventOf(message: TurnMessage): { label: string; text: string } | null {
    const who = message.characterName ?? "jogador"
    if (message.kind === "declaration") return flat(message.content) ? { label: `Declaração de ${who}`, text: flat(message.content) } : null
    if (message.kind === "narration") return flat(message.content) ? { label: "Narração do Maddox", text: flat(message.content) } : null
    // Teste cancelado (o jogador saiu) não aconteceu; pendente ainda não tem resultado.
    if (message.kind === "check" && message.check && message.check.status !== "cancelled") {
        const check = message.check
        const total = check.roll?.total
        const result = check.status === "rolled" && typeof total === "number" ? `total ${total}: ${total >= check.dc ? "sucesso" : "falha"}` : "sem resultado ainda"
        return { label: `Teste de ${who}`, text: `${flat(check.reason)} (CD ${check.dc}) — ${result}` }
    }
    // Ação do combate tático: o texto fica em `combatAction.summary` (o `content` é vazio); cancelada não aconteceu.
    if (message.kind === "combat-action" && message.combatAction && message.combatAction.status !== "cancelled") {
        const action = message.combatAction
        const fallback = [flat(action.actorName), flat(action.label)].filter(Boolean).join(": ")
        const text = flat(action.summary) || (fallback ? `${fallback}${action.status === "pending" ? " (sem resultado ainda)" : ""}` : "")
        return text ? { label: "Ação de combate", text } : null
    }
    return null
}

/** Último turno (até a narração escolhida) e a narração do turno anterior, para a descrição do pedido manual. */
export async function lastTurnContext(campaignId: Types.ObjectId, narration: { _id: Types.ObjectId; turnNumber: number; content: string }): Promise<SceneTurnContext> {
    const base: SceneTurnContext = { turnNumber: narration.turnNumber, events: [], lastNarration: narration.content.trim(), previousNarration: "" }
    try {
        const [messages, previous] = await Promise.all([
            MaddoxCampaignMessageModel.find({
                campaignId,
                turnNumber: narration.turnNumber,
                _id: { $lt: narration._id },
                error: null,
                kind: { $in: ["declaration", "narration", "check", "combat-action"] },
            })
                .sort({ _id: 1 })
                .select("_id kind characterName content check combatAction")
                .lean<TurnMessage[]>(),
            MaddoxCampaignMessageModel.findOne({ campaignId, kind: "narration", error: null, turnNumber: { $lt: narration.turnNumber } })
                .sort({ _id: -1 })
                .select("content")
                .lean<{ content: string }>(),
        ])
        // Do fim para o começo: o mais próximo do momento retratado fica, o que passa do teto sai.
        const events: { label: string; text: string }[] = []
        let size = base.lastNarration.length
        for (const message of [...messages].reverse()) {
            const event = turnEventOf(message)
            if (!event) continue
            size += event.label.length + event.text.length
            if (size > MADDOX_SCENE_IMAGE_LAST_TURN_TEXT_MAX) break
            events.unshift(event)
        }
        return { ...base, events, previousNarration: cut(flat(previous?.content), MADDOX_SCENE_IMAGE_PREVIOUS_TURN_TEXT_MAX) }
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaignId) }, "[maddox] último turno indisponível para a descrição da cena; só a última narração")
        return base
    }
}

/** Bloco do último turno (o momento a retratar marcado) e do anterior (só contexto). */
export function lastTurnBlock(turn: SceneTurnContext): string {
    const lines = [`## ÚLTIMO TURNO (turno ${turn.turnNumber}) — retrate ESTE momento`]
    for (const event of turn.events) lines.push(`- ${event.label}: ${event.text}`)
    lines.push(`- MOMENTO A RETRATAR (último trecho da narração): ${cut(turn.lastNarration.trim(), MADDOX_SCENE_IMAGE_LAST_TURN_TEXT_MAX)}`)
    const parts = [lines.join("\n")]
    if (turn.previousNarration) parts.push(`## Antes disso (só contexto, NÃO retrate)\n${turn.previousNarration}`)
    return parts.join("\n\n")
}

export async function describeCurrentScene(campaignId: Types.ObjectId, turn: SceneTurnContext): Promise<DescribedScene> {
    const lastNarration = turn.lastNarration
    const [campaign, appearances, npcs] = await Promise.all([
        MaddoxCampaignModel.findById(campaignId).select("name rigor setting state").lean<Pick<IMaddoxCampaign, "name" | "rigor" | "setting" | "state">>(),
        loadCharacterAppearances(campaignId, "all").catch((error: unknown) => {
            log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaignId) }, "[maddox] aparência dos personagens indisponível para a descrição da cena")
            return []
        }),
        MaddoxNpcModel.find({ campaignId, visibility: "players" }).select("name publicDescription").lean<{ name: string; publicDescription?: string }[]>(),
    ])
    const characterNames = appearances.map((item) => item.name)
    const npcNames = npcs.map((item) => item.name)
    const fallback: DescribedScene = { description: lastNarration.trim().slice(0, 3000), caption: "", characters: characterNames, npcs: [], catalog: [] }
    try {
        const [{ loadNarrator }, { generateAiText }] = await Promise.all([import("./narrator"), import("@/lib/ai/stream")])
        const { model } = await loadNarrator(campaign?.rigor)
        const instructions = [
            "Você é Maddox, o mestre da campanha. O dono da mesa pediu uma ILUSTRAÇÃO da cena atual. Descreva visualmente, para um gerador de imagens, o que está acontecendo AGORA: lugar, luz, clima, quem aparece, posições e ação. Não revele segredos do mestre: só o que os jogadores veem.",
            "- Retrate o desfecho do ÚLTIMO TURNO: o \"momento a retratar\" (último trecho da narração), com as ações declaradas nesse turno. O turno anterior é só contexto.",
            "- Ao citar a aparência de um personagem, copie o que está em \"Aparência dos personagens\". Não atribua cor de cabelo, olhos ou pele, nem marcas ou roupas, que não estejam registradas; o que não está registrado, não descreva.",
            `## Campanha "${campaign?.name ?? ""}"\n${campaign?.setting?.trim().slice(0, 3000) || "(sem cenário registrado)"}`,
            `## Estado atual\n- Cena: ${campaign?.state?.scene || "(não registrada)"}\n- Local: ${campaign?.state?.location || "(não registrado)"}\n- Situação: ${campaign?.state?.situation || "(não registrada)"}`,
            `## Personagens dos jogadores\n${characterNames.join(", ") || "(nenhum)"}`,
            ...(appearances.length ? [`## Aparência dos personagens (fatos registrados, não altere)\n${appearanceBlock(appearances)}`] : []),
            `## NPCs conhecidos\n${npcs.map((npc) => (flat(npc.publicDescription) ? `- ${npc.name}: ${cut(flat(npc.publicDescription), 240)}` : `- ${npc.name}`)).join("\n") || "(nenhum)"}`,
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
                    prompt: lastTurnBlock(turn),
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
