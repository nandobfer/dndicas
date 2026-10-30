export interface ColorConfig {
    label: string
    /** Classe do chip/badge para consumidores que exibem o token como identificação. */
    chipClassName: string
    /** Classe do botão/aba quando a cor está ativa. */
    tabActiveClassName: string
    /** Equivalente em hex para gráficos, e-mails e estilos inline. */
    hex: string
}

/**
 * Paleta compartilhada por cargos e perfis que persistem uma identidade visual.
 * O banco guarda somente o token; cada consumidor resolve sua apresentação aqui.
 */
export const COLOR_PALETTE = {
    vermelho: { label: "Vermelho", chipClassName: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", tabActiveClassName: "bg-red-600 text-white shadow-sm", hex: "#dc2626" },
    laranja: { label: "Laranja", chipClassName: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", tabActiveClassName: "bg-orange-600 text-white shadow-sm", hex: "#ea580c" },
    ambar: { label: "Âmbar", chipClassName: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-500", tabActiveClassName: "bg-amber-600 text-white shadow-sm", hex: "#d97706" },
    amarelo: { label: "Amarelo", chipClassName: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500", tabActiveClassName: "bg-yellow-500 text-white shadow-sm", hex: "#eab308" },
    lima: { label: "Lima", chipClassName: "bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-400", tabActiveClassName: "bg-lime-600 text-white shadow-sm", hex: "#65a30d" },
    verde: { label: "Verde", chipClassName: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", tabActiveClassName: "bg-green-600 text-white shadow-sm", hex: "#16a34a" },
    esmeralda: { label: "Esmeralda", chipClassName: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", tabActiveClassName: "bg-emerald-600 text-white shadow-sm", hex: "#059669" },
    turquesa: { label: "Turquesa", chipClassName: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400", tabActiveClassName: "bg-teal-600 text-white shadow-sm", hex: "#0d9488" },
    ciano: { label: "Ciano", chipClassName: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400", tabActiveClassName: "bg-cyan-600 text-white shadow-sm", hex: "#0891b2" },
    celeste: { label: "Celeste", chipClassName: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400", tabActiveClassName: "bg-sky-600 text-white shadow-sm", hex: "#0284c7" },
    azul: { label: "Azul", chipClassName: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", tabActiveClassName: "bg-blue-600 text-white shadow-sm", hex: "#2563eb" },
    indigo: { label: "Índigo", chipClassName: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400", tabActiveClassName: "bg-indigo-600 text-white shadow-sm", hex: "#4f46e5" },
    violeta: { label: "Violeta", chipClassName: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400", tabActiveClassName: "bg-violet-600 text-white shadow-sm", hex: "#7c3aed" },
    roxo: { label: "Roxo", chipClassName: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400", tabActiveClassName: "bg-purple-600 text-white shadow-sm", hex: "#9333ea" },
    magenta: { label: "Magenta", chipClassName: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400", tabActiveClassName: "bg-fuchsia-600 text-white shadow-sm", hex: "#c026d3" },
    rosa: { label: "Rosa", chipClassName: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400", tabActiveClassName: "bg-pink-600 text-white shadow-sm", hex: "#db2777" },
    rubi: { label: "Rubi", chipClassName: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400", tabActiveClassName: "bg-rose-600 text-white shadow-sm", hex: "#e11d48" },
    cinza: { label: "Cinza", chipClassName: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", tabActiveClassName: "bg-slate-600 text-white shadow-sm", hex: "#475569" },
} as const satisfies Record<string, ColorConfig>

export type ColorToken = keyof typeof COLOR_PALETTE
export const COLOR_TOKENS = Object.keys(COLOR_PALETTE) as ColorToken[]
export const DEFAULT_COLOR_TOKEN: ColorToken = "cinza"

export function isColorToken(value: unknown): value is ColorToken {
    return typeof value === "string" && COLOR_TOKENS.includes(value as ColorToken)
}

export function getColor(token: string | undefined | null): ColorConfig {
    if (!token) return COLOR_PALETTE[DEFAULT_COLOR_TOKEN]
    return COLOR_PALETTE[token as ColorToken] ?? COLOR_PALETTE[DEFAULT_COLOR_TOKEN]
}
