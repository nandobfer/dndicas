/**
 * Abrir e fechar o popover do retrato no hover (DND-55). Dois sinais de presença separados — o do avatar e o do
 * popover —: o fechamento só é agendado quando os dois estão desligados e qualquer entrada o cancela, então a ordem
 * dos eventos (entrar no popover antes de sair do avatar) não deixa um fechamento pendente.
 */

/** Atraso para abrir: passar o mouse pela lista não pisca popovers. */
export const MADDOX_PORTRAIT_HOVER_OPEN_MS = 200
/** Tolerância para fechar: dá tempo de levar o mouse do avatar ao popover. */
export const MADDOX_PORTRAIT_HOVER_CLOSE_MS = 150

export type PortraitHoverZone = "trigger" | "panel"

export interface PortraitHoverState {
    trigger: boolean
    panel: boolean
    open: boolean
}

/** O que fazer com o timer depois do evento: agendar a abertura, agendar o fechamento, cancelar o pendente ou nada. */
export type PortraitHoverTimer = "open" | "close" | "cancel" | null

export const PORTRAIT_HOVER_IDLE: PortraitHoverState = { trigger: false, panel: false, open: false }

/** Entrada ou saída do ponteiro de uma das zonas. */
export function portraitHoverPointer(state: PortraitHoverState, zone: PortraitHoverZone, inside: boolean): { state: PortraitHoverState; timer: PortraitHoverTimer } {
    const next = { ...state, [zone]: inside }
    if (inside) {
        // O popover só existe aberto; entrar nele (ou voltar ao avatar) cancela o fechamento.
        if (next.open) return { state: next, timer: "cancel" }
        return { state: next, timer: zone === "trigger" ? "open" : "cancel" }
    }
    if (next.trigger || next.panel) return { state: next, timer: null }
    return { state: next, timer: next.open ? "close" : "cancel" }
}

/** O timer agendado venceu: só abre com o ponteiro ainda presente e só fecha com os dois sinais desligados. */
export function portraitHoverElapsed(state: PortraitHoverState, timer: "open" | "close"): PortraitHoverState {
    const present = state.trigger || state.panel
    if (timer === "open") return present ? { ...state, open: true } : state
    return present ? state : { ...state, open: false }
}
