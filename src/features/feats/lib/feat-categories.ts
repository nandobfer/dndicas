import { featCategoryColors } from "@/lib/config/colors"

export const FEAT_CATEGORIES = ["Geral", "Origem", "Estilo de Luta", "Dádiva Épica"] as const

export type FeatCategory = (typeof FEAT_CATEGORIES)[number]

export const FEAT_CATEGORY_OPTIONS = FEAT_CATEGORIES.map((c) => ({
    value: c,
    label: c,
    activeColor: featCategoryColors[c].activeColor,
    textColor: featCategoryColors[c].text,
}))
