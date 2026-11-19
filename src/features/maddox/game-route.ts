/** Caminho da mesa da campanha (`/campanhas/[id]/mesa`), com ou sem barra final. */
const MADDOX_GAME_PATH = /^\/campanhas\/[^/]+\/mesa\/?$/

/**
 * Indica se o caminho é a mesa de uma campanha Maddox. O layout do dashboard usa a regra para não
 * mostrar o rodapé do app na mesa (a tela já ocupa a área útil inteira).
 */
export function isMaddoxGamePath(pathname: string | null | undefined): boolean {
    return !!pathname && MADDOX_GAME_PATH.test(pathname)
}
