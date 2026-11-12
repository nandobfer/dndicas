import type { MaddoxRestCharacterDto, MaddoxRestDto, MaddoxRestWaitDto } from "./game-types"
import { MADDOX_REST_TYPE_LABELS } from "./rest-rules"

/**
 * Textos e regras de tela do descanso conduzido pelo Maddox (DND-58) — módulo PURO (sem DOM).
 */

export const restTitle = (type: MaddoxRestDto["type"]) => MADDOX_REST_TYPE_LABELS[type]

/** Texto próprio de cada tipo de descanso, abaixo do título do balão. */
export const restIntroText = (type: MaddoxRestDto["type"]) =>
    type === "long"
        ? "Oito horas de sono e vigília leve: os PV voltam ao máximo, metade dos dados de vida e os espaços de magia se recuperam, e a exaustão diminui."
        : "Uma hora de pausa para recuperar o fôlego: quem quiser rola dados de vida, e os recursos que voltam no descanso curto se recuperam."

export const restStatusLabel = (status: MaddoxRestDto["status"]) => (status === "interrupted" ? "Interrompido" : status === "closed" ? "Concluído" : "Em andamento")

/** Situação de um personagem no balão. */
export function restCharacterStatusText(entry: Pick<MaddoxRestCharacterDto, "prep" | "hitDice" | "exchange" | "doneReason" | "done" | "answeredBy">): string {
    if (entry.doneReason === "offline") return "Offline: concluiu sem rolar e sem trocar"
    if (entry.doneReason === "left") return "Saiu da campanha"
    if (entry.doneReason === "dead") return "Morreu"
    if (entry.done) return "Concluiu"
    if (entry.prep.status === "failed") return "Preparação da ficha falhou"
    if (entry.prep.status !== "ready") return "Preparando a ficha…"
    if (entry.hitDice.status === "open") return "Rolando dados de vida"
    if (entry.exchange.status === "processing") return "O Maddox está avaliando as trocas…"
    if (entry.exchange.status === "open") return entry.answeredBy === "owner" ? "Aguardando o dono da campanha" : "Pensando nas trocas"
    return "Concluindo…"
}

const PART_LABELS: Record<MaddoxRestWaitDto["parts"][number], string> = { prep: "ficha", "hit-dice": "dados de vida", exchange: "trocas" }

/** Faixa do turno com o descanso aberto: quem falta e o quê. `null` = nada a esperar. */
export function restBannerText(waiting: readonly MaddoxRestWaitDto[] | undefined): string | null {
    if (!waiting?.length) return null
    return `Descanso — aguardando ${waiting.map((item) => `${item.characterName} (${item.parts.map((part) => PART_LABELS[part]).join(", ") || "concluindo"})`).join(", ")}`
}
