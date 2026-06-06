/**
 * Utilitários de cálculo e cor para barras de HP.
 * Compartilhado entre gm-npcs-tab.tsx e gm-scene-controller.tsx.
 */

/**
 * Calcula o percentual de HP entre 0 e 100, clampeado.
 */
export function hpPercent(current: number, max: number): number {
    if (max <= 0) return 0
    return Math.max(0, Math.min(100, (current / max) * 100))
}

function interpolateColor(
    from: [number, number, number],
    to: [number, number, number],
    amount: number,
): string {
    const clamped = Math.max(0, Math.min(1, amount))
    const [r1, g1, b1] = from
    const [r2, g2, b2] = to
    const r = Math.round(r1 + (r2 - r1) * clamped)
    const g = Math.round(g1 + (g2 - g1) * clamped)
    const b = Math.round(b1 + (b2 - b1) * clamped)
    return `rgb(${r}, ${g}, ${b})`
}

/**
 * Retorna a cor da barra de HP em função do percentual atual/máximo.
 * 0% → vermelho escuro, 50% → amarelo, 100% → verde.
 */
export function getHpBarColor(current: number, max: number): string {
    const percent = hpPercent(current, max) / 100
    const red: [number, number, number] = [88, 0, 0]
    const yellow: [number, number, number] = [234, 179, 8]
    const green: [number, number, number] = [52, 211, 153]

    if (percent <= 0.5) {
        return interpolateColor(red, yellow, percent / 0.5)
    }

    return interpolateColor(yellow, green, (percent - 0.5) / 0.5)
}
