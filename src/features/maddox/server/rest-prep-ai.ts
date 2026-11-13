import { MADDOX_CATALOG_TOOL_NAMES, MADDOX_REST_PREP_CONSUMPTION_ORIGIN, MADDOX_REST_PREP_MAX_STEPS, MADDOX_REST_PREP_TIMEOUT_MS } from "../constants"
import { MADDOX_REST_TYPE_LABELS, type MaddoxRestType } from "../rest-rules"
import type { CatalogReadLog } from "./catalog-reads"
import type { PrepCampaign } from "./combat-prep-ai"

/**
 * Preparação da ficha no fim do descanso (DND-58) — SOMENTE servidor. O Maddox lê no catálogo a descrição de cada recurso
 * gasto (habilidade, talento ou item de origem) e, no descanso curto, a regra dos espaços de magia da classe, e diz o que
 * volta, citando o trecho. Quem confere a fonte é o servidor (`interpretRestPrep`). Testes mockam este módulo inteiro.
 */

export interface RestRecoveryInput {
    campaign: PrepCampaign
    characterName: string
    restType: MaddoxRestType
    /** A ficha no que importa ao descanso: classe/subclasse com as referências, espaços e recursos com a origem. */
    sheetText: string
    reads: CatalogReadLog
    jobId: string
}

const SOURCE_FIELD = '"source":{"ref":"Tipo:id da entidade lida","quote":"trecho exato do texto dela que diz como recupera"}'

export async function reviewRestRecovery(input: RestRecoveryInput): Promise<unknown> {
    const [{ catalogGeneration, withTimeout }, { rigorBlock, parseJsonObject }] = await Promise.all([import("./combat-prep-ai"), import("./interview-prompt")])
    const rest = MADDOX_REST_TYPE_LABELS[input.restType].toLowerCase()
    const instructions = [
        "Você é o Maddox, mestre de D&D, preparando a ficha de um personagem no fim de um descanso. Você NÃO narra: só decide, pela regra do catálogo do DnDicas, o que se recupera.",
        rigorBlock(input.campaign.rigor),
        "## Fonte das regras (obrigatória)",
        `Para cada recurso gasto, leia com ${MADDOX_CATALOG_TOOL_NAMES.get} a entidade de origem indicada (use o ref da lista) e procure o trecho que diz se ele volta num descanso curto ou longo. ${input.restType === "short" ? `Para os espaços de magia gastos, leia a classe e a subclasse e procure se a regra diz que os espaços voltam num descanso curto (ex.: Magia de Pacto).` : ""}`,
        "O servidor confere cada fonte: sem source, com ref que não é a origem (ou a classe/subclasse), com trecho que não está no texto ou que não fala do descanso, o recurso NÃO volta. Nunca invente: se a descrição não diz como recupera, responda \"nenhuma\" com o motivo.",
        "## Formato da resposta",
        "Responda SOMENTE com um objeto JSON:",
        `{"cargas":[{"chargeId":"id da lista","recupera":"todas"|"nenhuma"|n (quantas voltam),${SOURCE_FIELD} (obrigatório quando volta),"motivo":"curto, quando não volta"}],"espacosNoCurto":${input.restType === "short" ? `{"recupera":true|false,${SOURCE_FIELD},"motivo":"…"}|null` : "null"}}`,
    ].join("\n\n")
    const prompt = [`# ${MADDOX_REST_TYPE_LABELS[input.restType]} concluído — ${input.characterName}`, `Decida o que se recupera neste ${rest}.`, input.sheetText].join("\n\n")
    const text = await withTimeout(MADDOX_REST_PREP_TIMEOUT_MS, "a preparação da ficha no descanso", (signal) =>
        catalogGeneration({
            campaign: input.campaign,
            instructions,
            prompt,
            title: `Maddox · descanso · ${input.campaign.name}`,
            origin: MADDOX_REST_PREP_CONSUMPTION_ORIGIN,
            signal,
            reads: input.reads,
            jobId: input.jobId,
            maxSteps: MADDOX_REST_PREP_MAX_STEPS,
            sessionKey: `maddox:${String(input.campaign._id)}:rest-prep`,
        }),
    )
    return parseJsonObject(text)
}
