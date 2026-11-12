import type { MaddoxRigorLevel } from "../constants"
import { MADDOX_SHEET_RESTORE_CONSUMPTION_ORIGIN, MADDOX_SHEET_RESTORE_TIMEOUT_MS } from "../constants"
import { SHEET_RESTORE_COLLECTIONS, SHEET_RESTORE_FIELDS } from "../sheet-restore-schemas"

/**
 * Chamada de IA do ajuste da ficha no reinício da campanha (DND-50) — SOMENTE servidor. Usa o modelo do narrador no grau
 * da campanha; o contrato JSON fica fixo aqui. Testes mockam este módulo inteiro (nunca há rede).
 */

export interface SheetRestoreReviewInput {
    campaign: { _id: unknown; name: string; rigor: MaddoxRigorLevel }
    characterName: string
    /** Ficha atual (campos e registros com `id`), em JSON. */
    currentText: string
    /** Ficha do fim da entrevista calculada pelo servidor (campos e registros com `ref`), em JSON. */
    referenceText: string
    /** Resultado da entrevista do personagem (perfil e escolhas), em texto. */
    interviewText: string
}

const INSTRUCTIONS = [
    "Você é o Maddox, mestre de D&D. A campanha foi reiniciada: a história jogada foi apagada e cada personagem volta ao estado do fim da entrevista de criação.",
    "Compare a FICHA ATUAL com a FICHA DE REFERÊNCIA (a que a entrevista gerou, calculada pelo servidor) e diga o que precisa voltar para a ficha ficar como no fim da entrevista: PV, dados de vida, espaços de magia e cargas usados, moedas, itens ganhos ou perdidos na história, ataques, traços, talentos, magias e anotações.",
    "Mantenha o que já está igual à referência e o que não mudou por causa da história jogada. Na dúvida, não altere.",
    "O reinício apaga a história, não as escolhas da entrevista: NUNCA remova magias, truques, talentos ou características que o jogador escolheu na entrevista (veja o resultado da entrevista), mesmo que faltem na referência, nem apague o atributo de conjuração.",
    "## Formato da resposta",
    'Responda SOMENTE com um objeto JSON {"changes":[…]} (lista vazia quando nada precisa mudar). Cada alteração tem "reason" (motivo curto) e um destes formatos:',
    `  - {"type":"field","field":"${SHEET_RESTORE_FIELDS.join("|")}"} — o campo volta ao valor da referência;`,
    `  - {"type":"remove","collection":"${SHEET_RESTORE_COLLECTIONS.join("|")}","id":"id do registro da ficha atual"} — o registro sai;`,
    `  - {"type":"restore","collection":"${SHEET_RESTORE_COLLECTIONS.join("|")}","ref":"ref do registro da referência"} — o registro da referência volta.`,
    "Para um registro que mudou (quantidade, cargas), remova o atual e restaure o da referência. Os valores vêm sempre da referência: não escreva números nem textos novos.",
].join("\n")

/** Pede ao Maddox a lista de alterações. Devolve o objeto JSON da resposta (validado por quem chama). */
export async function reviewSheetRestore(input: SheetRestoreReviewInput, signal?: AbortSignal): Promise<unknown> {
    const [{ loadNarrator }, { generateAiText }, { parseJsonObject }, { withTimeout }] = await Promise.all([import("./narrator"), import("@/lib/ai/stream"), import("./interview-prompt"), import("./combat-prep-ai")])
    const { model } = await loadNarrator(input.campaign.rigor)
    const prompt = [`# Personagem: ${input.characterName}`, "## Resultado da entrevista", input.interviewText, "## FICHA ATUAL", input.currentText, "## FICHA DE REFERÊNCIA (fim da entrevista)", input.referenceText].join("\n\n")
    const text = await withTimeout(MADDOX_SHEET_RESTORE_TIMEOUT_MS, "o ajuste da ficha", async (timeoutSignal) => {
        const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
        const { text } = await generateAiText({
            provider: model.provider,
            model: model.model,
            agent: model.agent,
            variant: model.variant,
            instructions: INSTRUCTIONS,
            prompt,
            title: `Maddox · fichas no reinício · ${input.campaign.name}`,
            consumption: { origin: MADDOX_SHEET_RESTORE_CONSUMPTION_ORIGIN, subject: String(input.campaign._id) },
            signal: combined,
        })
        return text
    })
    return parseJsonObject(text)
}
