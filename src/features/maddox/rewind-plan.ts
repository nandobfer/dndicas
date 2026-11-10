import { turnOfTags, writtenAtOfTags } from "@/features/engramind/campaign-memory-format"

/**
 * Regras puras da volta a um turno (DND-44) — sem banco nem rede: turnos disponíveis, alvo do "Desfazer turno", trecho
 * descartado, a revisão de uma memória que vale num turno e os textos da tela.
 */

/** Palavras da narração mostradas em cada item de "Voltar ao turno…". */
export const MADDOX_REWIND_EXCERPT_WORDS = 16

export interface RewindTurnOption {
    turnNumber: number
    excerpt: string
}

/** Primeiras palavras de um texto (sem marcação), com reticências quando cortado. */
export function excerptOf(text: string, words = MADDOX_REWIND_EXCERPT_WORDS): string {
    const all = text
        .replace(/\{\{[^:}]+:([^}]+)\}\}/g, "$1")
        .replace(/[*_`#>[\]]/g, "")
        .split(/\s+/)
        .filter(Boolean)
    return all.length > words ? `${all.slice(0, words).join(" ")}…` : all.join(" ")
}

/**
 * Turnos para onde a mesa pode ir: com retrato, 1 ≤ X < turno de origem (o atual, sem volta pendente) e diferente do turno
 * em que a mesa está. Do mais recente para o mais antigo.
 */
export function availableRewindTurns(snapshots: readonly RewindTurnOption[], position: { originTurn: number; atTurn: number }): RewindTurnOption[] {
    return snapshots
        .filter((item) => item.turnNumber >= 1 && item.turnNumber < position.originTurn && item.turnNumber !== position.atTurn)
        .sort((a, b) => b.turnNumber - a.turnNumber)
}

/**
 * Alvo de "Desfazer turno": o turno anterior ao que a mesa está (no combate tático, a vez anterior com retrato — os
 * turnos só dos adversários não abrem a vez dos jogadores e não têm retrato). `null` = não há para onde voltar.
 */
export function undoTarget(available: readonly RewindTurnOption[], atTurn: number): number | null {
    const below = available.filter((item) => item.turnNumber < atTurn).map((item) => item.turnNumber)
    return below.length ? Math.max(...below) : null
}

/** Turnos que a volta tira da mesa (X+1 a N). */
export function discardedRange(atTurn: number, originTurn: number): { from: number; to: number } {
    return { from: atTurn + 1, to: originTurn }
}

// ── Memórias ─────────────────────────────────────────────────────────────────

/** Revisão do histórico de uma memória (contrato do Engramind, `MemoryRevision`). */
export interface MemoryRevisionLike {
    version: number
    reason: string
    status: string
    text: string
    title: string | null
    category: string
    tags: readonly string[]
    created_at?: string
}

/** Estado atual de uma memória (o que importa para compará-la com uma revisão). */
export interface MemoryStateLike {
    version: number
    status: string
    text: string
    title: string | null
    category: string
    tags?: readonly string[] | null
}

/**
 * Revisões que gravam conteúdo pelo jogo (criação, atualização e a revisão do Redator). As operações da volta (`revert`,
 * `archive`, `restore`) e as de organização (`move`, `pin`, `unpin`) não contam: elas não dizem em que turno o
 * conteúdo foi escrito.
 */
const CONTENT_REASONS = new Set(["create", "update", "redact"])

/** Instante da gravação da revisão (tag `gravado:`); gravações anteriores à DND-44 contam como de sempre (−∞). */
export const revisionWrittenAt = (revision: Pick<MemoryRevisionLike, "tags">) => writtenAtOfTags(revision.tags) ?? Number.NEGATIVE_INFINITY

/** A memória foi gravada com turno alguma vez (as antigas, sem `turno:` nem `gravado:`, nunca são afetadas). */
export const hasTurnInfo = (revisions: readonly MemoryRevisionLike[]) => revisions.some((revision) => turnOfTags(revision.tags) !== null || writtenAtOfTags(revision.tags) !== null)

/**
 * Revisão de conteúdo que valia no instante `asOf` (a mais nova gravada até ele); `null` = a memória ainda não existia.
 * `keepAfter`: as gravações posteriores a ele também valem (ações feitas na posição atual da volta pendente).
 */
export function revisionAsOf(revisions: readonly MemoryRevisionLike[], asOf: number, keepAfter: number | null = null): MemoryRevisionLike | null {
    const content = revisions.filter((revision) => CONTENT_REASONS.has(revision.reason))
    const valid = content.filter((revision) => revisionWrittenAt(revision) <= asOf || (keepAfter !== null && revisionWrittenAt(revision) > keepAfter))
    return valid.sort((a, b) => b.version - a.version)[0] ?? null
}

/** Instante da primeira gravação de conteúdo (criação). */
export function firstWrittenAt(revisions: readonly MemoryRevisionLike[]): number {
    const content = revisions.filter((revision) => CONTENT_REASONS.has(revision.reason)).sort((a, b) => a.version - b.version)
    return content[0] ? revisionWrittenAt(content[0]) : Number.NEGATIVE_INFINITY
}

const sameTags = (a: readonly string[] | null | undefined, b: readonly string[] | null | undefined) => JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort())

/** O conteúdo atual é o da revisão (texto, título, categoria e tags). */
export const sameContent = (current: MemoryStateLike, revision: MemoryRevisionLike) =>
    current.text === revision.text && (current.title ?? "") === (revision.title ?? "") && current.category === revision.category && sameTags(current.tags, revision.tags)

export type MemoryRewindAction =
    | { kind: "keep" }
    | { kind: "delete" }
    | { kind: "apply"; revertTo: number | null; status: "archive" | "restore" | null }

/**
 * O que fazer com uma memória para ela ficar como estava em `asOf`:
 * - sem revisão até `asOf`: criada depois → arquivada; criada depois de `deleteAfter` (ações feitas depois da volta, que
 *   se perdem ao trocar de turno) → excluída;
 * - com revisão: volta ao conteúdo dela (`revert`) e à situação dela (`archive`/`restore`).
 * Idempotente: o que já está como deveria fica como está.
 */
export interface MemoryRewindTarget {
    /** Instante do retrato de destino (`Infinity` = o estado mais novo). */
    asOf: number
    /** Gravações depois disto também valem (posição atual da volta pendente, no reparo depois de uma falha). */
    keepAfter?: number | null
    /** Memória nascida depois disto e sem revisão válida é excluída em vez de arquivada. */
    deleteAfter: number | null
}

export function planMemoryRewind(current: MemoryStateLike, revisions: readonly MemoryRevisionLike[], target: MemoryRewindTarget): MemoryRewindAction {
    if (!hasTurnInfo(revisions)) return { kind: "keep" }
    const desired = revisionAsOf(revisions, target.asOf, target.keepAfter ?? null)
    if (!desired) {
        if (target.deleteAfter !== null && firstWrittenAt(revisions) > target.deleteAfter) return { kind: "delete" }
        return current.status === "archived" ? { kind: "keep" } : { kind: "apply", revertTo: null, status: "archive" }
    }
    const revertTo = sameContent(current, desired) ? null : desired.version
    const wantArchived = desired.status === "archived"
    const isArchived = current.status === "archived"
    const status = wantArchived && !isArchived ? "archive" : !wantArchived && isArchived ? "restore" : null
    return revertTo === null && status === null ? { kind: "keep" } : { kind: "apply", revertTo, status }
}

// ── Textos ───────────────────────────────────────────────────────────────────

export const rewindNoticeText = (notice: { event: "goto" | "resume"; turnNumber: number }) =>
    notice.event === "goto" ? `O dono voltou a mesa para o turno ${notice.turnNumber}` : `O dono retomou o turno ${notice.turnNumber}`

export const rewindBannerText = (rewind: { atTurn: number; originTurn: number }) => {
    const { from, to } = discardedRange(rewind.atTurn, rewind.originTurn)
    return `A mesa voltou ao turno ${rewind.atTurn}. Os turnos ${from} a ${to} serão perdidos quando o Maddox narrar de novo.`
}

export const REWIND_NEW_ACTIONS_WARNING = "As declarações feitas depois da volta serão perdidas."

/** Modal de "Voltar ao turno X" (também o de "Desfazer turno"): `origin` = turno de origem N. */
export function gotoDialogText(target: number, origin: number, hasNewActions: boolean) {
    const { from, to } = discardedRange(target, origin)
    const description = `A mesa volta ao estado do turno ${target}: o que aconteceu nos turnos ${from} a ${to} sai da mesa e do Diário. Você ainda pode voltar ao turno atual até o Maddox narrar de novo.`
    return { title: `Voltar ao turno ${target}?`, description: hasNewActions ? `${description} ${REWIND_NEW_ACTIONS_WARNING}` : description, confirmLabel: `Voltar ao turno ${target}` }
}

/** Modal de "Voltar ao turno atual (N)". */
export function resumeDialogText(origin: number, hasNewActions: boolean) {
    const description = `Tudo o que aconteceu até o turno ${origin} volta para a mesa e o Diário.`
    return { title: `Voltar ao turno atual (${origin})?`, description: hasNewActions ? `${description} ${REWIND_NEW_ACTIONS_WARNING}` : description, confirmLabel: `Voltar ao turno ${origin}` }
}
