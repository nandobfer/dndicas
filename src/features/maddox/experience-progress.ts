import { experienceValue, xpForLevel, xpToNextLevel } from "@/features/character-sheets/utils/sheet-rules"
import type { MaddoxXpProgressDto } from "./campaign-types"

/**
 * Progresso de XP do personagem (DND-63, modo Experiência): limiar do nível atual, do próximo e a fração entre eles.
 * XP abaixo do limiar do nível (nível inicial alto com XP 0) fica em 0%; XP já no próximo limiar (subida pendente)
 * fica em 100% com `missing` 0. No nível 20 não há próximo limiar: barra cheia.
 */
export function experienceProgress(xp: unknown, level: unknown): MaddoxXpProgressDto {
    const value = experienceValue(xp)
    const parsedLevel = typeof level === "number" && Number.isFinite(level) ? Math.trunc(level) : 1
    const safeLevel = Math.min(20, Math.max(1, parsedLevel))
    const floor = xpForLevel(safeLevel)
    const step = xpToNextLevel(value, safeLevel)
    if (!step) return { level: safeLevel, value, floor, next: null, missing: null, percent: 100 }
    const span = step.next - floor
    const raw = span > 0 ? ((value - floor) / span) * 100 : 100
    const percent = Math.min(100, Math.max(0, Math.round(raw)))
    return { level: safeLevel, value, floor, next: step.next, missing: step.missing, percent: step.missing === 0 ? 100 : percent }
}

const formatXp = (value: number) => value.toLocaleString("pt-BR")

/** Rótulos da barra: `text` curto visível e `detail` para `aria-label`/`title`. */
export function xpProgressLabel(progress: MaddoxXpProgressDto): { text: string; detail: string } {
    const xp = `${formatXp(progress.value)} XP`
    if (progress.next === null || progress.missing === null) return { text: `${xp} · Nível máximo`, detail: `${xp} · Nível máximo` }
    if (progress.missing === 0) return { text: xp, detail: `${xp} · nível ${progress.level + 1} alcançado` }
    return { text: `${formatXp(progress.value)} / ${formatXp(progress.next)} XP`, detail: `${xp} · faltam ${formatXp(progress.missing)} para o nível ${progress.level + 1}` }
}
