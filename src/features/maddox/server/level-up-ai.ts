import { MADDOX_JEV_MODEL, MADDOX_LEVEL_MILESTONE_CONSUMPTION_ORIGIN, MADDOX_LEVEL_MILESTONE_TIMEOUT_MS, MADDOX_SPELL_SWAP_CONSUMPTION_ORIGIN, MADDOX_SPELL_SWAP_TIMEOUT_MS, type MaddoxRigorLevel } from "../constants"

/**
 * Chamadas de IA da progressão de nível (DND-56) — SOMENTE servidor; os testes mockam este módulo inteiro (nunca há rede).
 *
 * - decisão "marco atingido?" pelo JEV (chave `level-milestone`) ou por uma geração curta do narrador;
 * - decisão do Maddox sobre a troca de magia ao subir de nível, pelo texto do traço de conjuração do catálogo.
 */

export interface MilestoneAiInput {
    campaignId: string
    campaignName: string
    rigor: MaddoxRigorLevel
    /** Fatos montados pelo servidor (cenário, grupo, gatilho e o que aconteceu desde a última subida). */
    facts: Record<string, string>
}

async function withTimeout<T>(ms: number, label: string, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | null = null
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            controller.abort()
            reject(new Error(`${label} passou de ${Math.round(ms / 1000)} s`))
        }, ms)
    })
    try {
        return await Promise.race([run(controller.signal), timeout])
    } finally {
        if (timer) clearTimeout(timer)
    }
}

const MILESTONE_QUESTION =
    "Pelo balanceamento do D&D e pelo ritmo da história, o grupo atingiu agora um marco para subir de nível? Considere se é uma aventura oficial (que tem marcos próprios) ou um mundo próprio, quantos personagens jogam (grupos pequenos sobem mais cedo; com 3 jogadores, o primeiro combate pode valer o nível 2), o nível atual, o acontecimento que disparou a pergunta e o que já aconteceu desde a última subida."

/** JEV: probabilidade de o marco ter sido atingido (`null` = resposta sem o formato). */
export async function askMilestoneJev(input: MilestoneAiInput): Promise<number | null> {
    const { askJevSystemOne } = await import("@/lib/ai/jev")
    const response = await withTimeout(MADDOX_LEVEL_MILESTONE_TIMEOUT_MS, "o JEV do marco de nível", (signal) =>
        askJevSystemOne({
            model: MADDOX_JEV_MODEL,
            tracking: { feature: "maddox", subject: input.campaignId },
            signal,
            state: input.facts,
            questions: {
                marco: {
                    type: "noul",
                    instructions: MILESTONE_QUESTION,
                    criteria: {
                        true: "O acontecimento fecha uma etapa relevante da história e o grupo já fez o bastante, para o tamanho e o nível dele, para subir.",
                        false: "Ainda falta história ou desafio para o nível atual, ou o acontecimento foi pequeno demais.",
                    },
                },
            },
        }),
    )
    const answer = response.answers?.marco
    return answer?.type === "noul" ? answer.noul : null
}

/** Geração curta do narrador: `{ atingido, motivo }` (JSON validado por quem chama). */
export async function askMilestoneNarrator(input: MilestoneAiInput): Promise<unknown> {
    const [{ loadNarrator }, { generateAiText }, { parseJsonObject, rigorBlock }] = await Promise.all([import("./narrator"), import("@/lib/ai/stream"), import("./interview-prompt")])
    const { model } = await loadNarrator(input.rigor)
    const instructions = [
        "Você é Maddox, o mestre da campanha. Decida se o grupo atingiu um marco de subida de nível (modo Marco, regras do D&D 2024).",
        rigorBlock(input.rigor),
        MILESTONE_QUESTION,
        'Responda SOMENTE com um objeto JSON: {"atingido": true|false, "motivo": "uma ou duas frases em português do Brasil, que os jogadores podem ler"}.',
    ].join("\n\n")
    const prompt = Object.entries(input.facts)
        .map(([key, value]) => `## ${key}\n${value || "(nada)"}`)
        .join("\n\n")
    const { text } = await withTimeout(MADDOX_LEVEL_MILESTONE_TIMEOUT_MS, "a decisão do marco de nível", (signal) =>
        generateAiText({
            provider: model.provider,
            model: model.model,
            agent: model.agent,
            variant: model.variant,
            instructions,
            prompt,
            title: `Maddox · marco de nível · ${input.campaignName}`,
            consumption: { origin: MADDOX_LEVEL_MILESTONE_CONSUMPTION_ORIGIN, subject: input.campaignId },
            signal,
        }),
    )
    return parseJsonObject(text)
}

export interface SpellSwapAiInput {
    className: string
    rigor: MaddoxRigorLevel
    traits: { id: string; label: string; text: string }[]
}

/** Decisão do Maddox: a classe permite trocar 1 magia conhecida ao subir de nível? `{ permite, ref, trecho }`. */
export async function askSpellSwap(input: SpellSwapAiInput): Promise<unknown> {
    const [{ loadNarrator }, { generateAiText }, { parseJsonObject }] = await Promise.all([import("./narrator"), import("@/lib/ai/stream"), import("./interview-prompt")])
    const { model } = await loadNarrator(input.rigor)
    const instructions = [
        "Você é Maddox, o mestre. Pelos traços de conjuração abaixo (catálogo do DnDicas, a fonte de verdade), decida se esta classe permite trocar UMA magia conhecida por outra da lista quando o personagem sobe de nível.",
        "Só diga que permite quando o texto do traço disser isso (por exemplo, ao ganhar um nível, substituir uma magia). Troca só após descanso longo não vale aqui.",
        'Responda SOMENTE com um objeto JSON: {"permite": true|false, "ref": "id do traço que sustenta", "trecho": "trecho copiado literalmente do texto do traço"}.',
    ].join("\n\n")
    const prompt = [`Classe: ${input.className}`, ...input.traits.map((trait) => `## ${trait.label} (id ${trait.id})\n${trait.text}`)].join("\n\n")
    const { text } = await withTimeout(MADDOX_SPELL_SWAP_TIMEOUT_MS, "a decisão da troca de magia", (signal) =>
        generateAiText({
            provider: model.provider,
            model: model.model,
            agent: model.agent,
            variant: model.variant,
            instructions,
            prompt,
            title: `Maddox · troca de magia · ${input.className}`,
            consumption: { origin: MADDOX_SPELL_SWAP_CONSUMPTION_ORIGIN, subject: input.className },
            signal,
        }),
    )
    return parseJsonObject(text)
}
