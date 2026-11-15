/**
 * Limites de posição das janelas glass (`GlassWindow`) no desktop.
 *
 * - X vai da borda esquerda (0) até `largura da tela − largura da janela`: a janela alcança as duas bordas
 *   sem sair da tela.
 * - Y é travado no fim do header fixo (`[data-app-header]`): a janela só se move na horizontal e nunca fica
 *   atrás do header.
 */

export const HEADER_FALLBACK_HEIGHT = 64

/** Camada das janelas e da barra de minimizadas: acima do header (z-40) e dos FABs (z-[45]), abaixo dos overlays (z-50+). */
export const WINDOWS_LAYER_Z = 48

export type WindowPosition = { x: number, y: number }

export type WindowDragBounds = { left: number, right: number, top: number, bottom: number }

/** Fim do header fixo em px; sem header (ou fora do navegador) usa 64. */
export function getHeaderBottom(doc: Document | undefined = typeof document === "undefined" ? undefined : document): number {
    const header = doc?.querySelector("[data-app-header]")
    if (!header) return HEADER_FALLBACK_HEIGHT

    const bottom = header.getBoundingClientRect().bottom
    return Number.isFinite(bottom) && bottom > 0 ? bottom : HEADER_FALLBACK_HEIGHT
}

export function getWindowDragBounds({ viewportWidth, windowWidth, headerBottom }: {
    viewportWidth: number
    windowWidth: number
    headerBottom: number
}): WindowDragBounds {
    return {
        left: 0,
        right: Math.max(0, viewportWidth - Math.max(0, windowWidth)),
        top: headerBottom,
        bottom: headerBottom,
    }
}

export function clampWindowPosition(position: WindowPosition, bounds: WindowDragBounds): WindowPosition {
    const x = Number.isFinite(position.x) ? position.x : bounds.left
    return {
        x: Math.min(Math.max(x, bounds.left), bounds.right),
        y: bounds.top,
    }
}

/** Altura máxima da janela para caber entre o header e a parte de baixo da tela. */
export function getMaxWindowHeight(headerBottom: number): string {
    return `calc(100dvh - ${headerBottom}px)`
}
