/**
 * @fileoverview D&D rarity-based color palette for Liquid Glass theme.
 * Colors are derived from the D&D 5e item rarity system and mapped
 * to semantic UI states (actions, roles, glass effects).
 *
 * @see specs/000/research.md - Decision 3
 */

import { damageTypeHex } from "./damage-types-hex"

/**
 * Primary color used for main actions (buttons, links, primary interactions).
 * Based on D&D rare (blue) - #3B82F6
 */
export const primaryColor = "#3B82F6"

/**
 * D&D 5e rarity colors mapped to hex values.
 * Used throughout the app for consistent visual hierarchy.
 */
export const rarityColors = {
    /** Common items - neutral/default state */
    common: "#9CA3AF",
    /** Uncommon items - success state (CREATE actions) */
    uncommon: "#10B981",
    /** Rare items - info state (UPDATE actions) */
    rare: primaryColor,
    /** Very Rare items - highlight state (regular users) */
    veryRare: "#8B5CF6",
    /** Legendary items - warning state */
    legendary: "#F59E0B",
    /** Artifact items - danger state (DELETE actions, admins) */
    artifact: "#EF4444",
} as const

/**
 * Action colors mapped from rarity system.
 * Used for audit log chips and status indicators.
 */
export const actionColors = {
    create: rarityColors.uncommon,
    update: rarityColors.rare,
    delete: rarityColors.artifact,
} as const

/**
 * Role colors for user badges and indicators.
 * Admin = artifact (red), User = veryRare (purple).
 */
export const roleColors = {
    admin: rarityColors.artifact,
    user: rarityColors.veryRare,
} as const

/**
 * Liquid Glass effect colors with varying opacity levels.
 * Used for glassmorphism backgrounds and borders.
 */
export const glassColors = {
    /** Light glass overlay (5-10% white) */
    light: "rgba(255, 255, 255, 0.1)",
    /** Medium glass overlay (15% white) */
    medium: "rgba(255, 255, 255, 0.15)",
    /** Dark glass overlay (40% black) */
    dark: "rgba(0, 0, 0, 0.4)",
    /** Subtle border for glass elements */
    border: "rgba(255, 255, 255, 0.1)",
    /** Glow effect for highlights */
    glow: "rgba(255, 255, 255, 0.05)",
} as const

/**
 * Complete color configuration object.
 * Import this for access to all color palettes.
 */
export const colors = {
    primary: primaryColor,
    rarity: rarityColors,
    action: actionColors,
    role: roleColors,
    glass: glassColors,
} as const

/** Type for rarity color keys */
export type RarityColor = keyof typeof rarityColors

/** Type for action color keys */
export type ActionColor = keyof typeof actionColors

/** Type for role color keys */
export type RoleColor = keyof typeof roleColors

/**
 * Central configuration for entity colors across the app.
 * Maps entity types to their designated styles and colors.
 * Reverted to original colors: Users = Blue, Security = Purple, Rules = Emerald.
 * T038: Added Habilidade entity color (Slate/Gray).
 */
export const entityColors = {
    Habilidade: {
        color: "emerald",
        mention: "bg-emerald-500/10 text-emerald-400 border-emerald-400/20",
        badge: "bg-emerald-400/20 text-emerald-400",
        border: "border-emerald-500/20",
        hoverBorder: "hover:border-emerald-500/40",
        bgAlpha: "bg-emerald-500/10",
        text: "text-emerald-400",
        hex: rarityColors.uncommon,
    },
    Usuário: {
        color: "blue",
        mention: "bg-blue-500/10 text-blue-400 border-blue-400/20",
        badge: "bg-blue-400/20 text-blue-400",
        border: "border-blue-500/20",
        hoverBorder: "hover:border-blue-500/40",
        bgAlpha: "bg-blue-500/10",
        text: "text-blue-400",
        hex: rarityColors.rare,
    },
    Segurança: {
        color: "purple",
        mention: "bg-purple-500/10 text-purple-400 border-purple-400/20",
        badge: "bg-purple-400/20 text-purple-400",
        border: "border-purple-500/20",
        hoverBorder: "hover:border-purple-500/40",
        bgAlpha: "bg-purple-500/10",
        text: "text-purple-400",
        hex: rarityColors.veryRare,
    },
    Regra: {
        color: "slate",
        mention: "bg-slate-500/10 text-slate-400 border-slate-400/20",
        badge: "bg-slate-400/20 text-slate-400",
        border: "border-slate-500/20",
        hoverBorder: "hover:border-slate-500/40",
        bgAlpha: "bg-slate-500/10",
        text: "text-slate-400",
        hex: rarityColors.common, // #9CA3AF
    },
    Talento: {
        color: "amber",
        mention: "bg-amber-500/10 text-amber-400 border-amber-400/20",
        badge: "bg-amber-400/20 text-amber-400",
        border: "border-amber-500/20",
        hoverBorder: "hover:border-amber-500/40",
        bgAlpha: "bg-amber-500/10",
        text: "text-amber-400",
        hex: rarityColors.legendary, // #F59E0B
    },
    Origem: {
        color: "blue",
        mention: "bg-blue-500/10 text-blue-400 border-blue-400/20",
        badge: "bg-blue-400/20 text-blue-400",
        border: "border-blue-500/20",
        hoverBorder: "hover:border-blue-500/40",
        bgAlpha: "bg-blue-500/10",
        text: "text-blue-400",
        hex: rarityColors.rare, // #3B82F6
    },
    Magia: {
        color: "purple",
        mention: "bg-purple-500/10 text-purple-400 border-purple-400/20",
        badge: "bg-purple-400/20 text-purple-400",
        border: "border-purple-500/20",
        hoverBorder: "hover:border-purple-500/40",
        bgAlpha: "bg-purple-500/10",
        text: "text-purple-400",
        hex: rarityColors.veryRare, // #8B5CF6
    },
    Classe: {
        color: "amber",
        mention: "bg-amber-500/10 text-amber-400 border-amber-400/20",
        badge: "bg-amber-400/20 text-amber-400",
        border: "border-amber-500/20",
        hoverBorder: "hover:border-amber-500/40",
        bgAlpha: "bg-amber-500/10",
        text: "text-amber-400",
        hex: rarityColors.legendary, // #F59E0B
    },
    Raça: {
        color: "red",
        mention: "bg-red-500/10 text-red-400 border-red-400/20",
        badge: "bg-red-400/20 text-red-400",
        border: "border-red-500/20",
        hoverBorder: "hover:border-red-500/40",
        bgAlpha: "bg-red-500/10",
        text: "text-red-400",
        hex: rarityColors.artifact, // #EF4444
    },
} as const

/**
 * D&D Attributes colors mapped from rarity system.
 * Used for character sheet, traits, and ability checks UI.
 *
 * strenght: legendary
 * constituition: artifact
 * dexterity: uncommon
 * inteligence: rare
 * wisdom: common
 * charisma: veryRare
 */
export const attributeColors = {
    Força: {
        name: "Força",
        abbreviation: "FOR",
        color: "amber",
        mention: "bg-amber-500/10 text-amber-400 border-amber-400/20",
        badge: "bg-amber-400/20 text-amber-400",
        border: "border-amber-500/20",
        hoverBorder: "hover:border-amber-500/40",
        bgAlpha: "bg-amber-500/10",
        text: "text-amber-400",
        hex: rarityColors.legendary,
    },
    Destreza: {
        name: "Destreza",
        abbreviation: "DES",
        color: "emerald",
        mention: "bg-emerald-500/10 text-emerald-400 border-emerald-400/20",
        badge: "bg-emerald-400/20 text-emerald-400",
        border: "border-emerald-500/20",
        hoverBorder: "hover:border-emerald-500/40",
        bgAlpha: "bg-emerald-500/10",
        text: "text-emerald-400",
        hex: rarityColors.uncommon,
    },
    Constituição: {
        name: "Constituição",
        abbreviation: "CON",
        color: "red",
        mention: "bg-red-500/10 text-red-400 border-red-400/20",
        badge: "bg-red-400/20 text-red-400",
        border: "border-red-500/20",
        hoverBorder: "hover:border-red-500/40",
        bgAlpha: "bg-red-500/10",
        text: "text-red-400",
        hex: rarityColors.artifact,
    },
    Inteligência: {
        name: "Inteligência",
        abbreviation: "INT",
        color: "blue",
        mention: "bg-blue-500/10 text-blue-400 border-blue-400/20",
        badge: "bg-blue-400/20 text-blue-400",
        border: "border-blue-500/20",
        hoverBorder: "hover:border-blue-500/40",
        bgAlpha: "bg-blue-500/10",
        text: "text-blue-400",
        hex: rarityColors.rare,
    },
    Sabedoria: {
        name: "Sabedoria",
        abbreviation: "SAB",
        color: "slate",
        mention: "bg-slate-500/10 text-slate-400 border-slate-400/20",
        badge: "bg-slate-400/20 text-slate-400",
        border: "border-slate-500/20",
        hoverBorder: "hover:border-slate-500/40",
        bgAlpha: "bg-slate-500/10",
        text: "text-slate-400",
        hex: rarityColors.common,
    },
    Carisma: {
        name: "Carisma",
        abbreviation: "CAR",
        color: "purple",
        mention: "bg-purple-500/10 text-purple-400 border-purple-400/20",
        badge: "bg-purple-400/20 text-purple-400",
        border: "border-purple-500/20",
        hoverBorder: "hover:border-purple-500/40",
        bgAlpha: "bg-purple-500/10",
        text: "text-purple-400",
        hex: rarityColors.veryRare,
    },
} as const

export type EntityType = keyof typeof entityColors
export type AttributeType = keyof typeof attributeColors

/**
 * D&D Spell Schools colors mapped from rarity system.
 * Used for spell catalog UI - school chips and filtering.
 *
 * @see specs/004-spells-catalog/research.md - School-to-color mapping
 *
 * Mapping:
 * - Abjuração (protection) → rare (blue)
 * - Adivinhação (divination) → legendary (gold)
 * - Conjuração (summoning) → uncommon (green)
 * - Encantamento (enchantment) → veryRare (purple)
 * - Evocação (evocation) → artifact (red)
 * - Ilusão (illusion) → common (gray)
 * - Necromancia (necromancy) → veryRare (purple)
 * - Transmutação (transmutation) → uncommon (green)
 */
export const spellSchoolColors = {
    Abjuração: "rare" as RarityColor,
    Adivinhação: "legendary" as RarityColor,
    Conjuração: "uncommon" as RarityColor,
    Encantamento: "veryRare" as RarityColor,
    Evocação: "artifact" as RarityColor,
    Ilusão: "common" as RarityColor,
    Necromancia: "veryRare" as RarityColor,
    Transmutação: "uncommon" as RarityColor,
} as const

/**
 * D&D Spell Component colors and configurations.
 * Used for spell catalog UI - component chips.
 *
 * Mapping:
 * - Concentração → red (artifact)
 * - Somático → emerald (uncommon)
 * - Verboso → blue (rare)
 * - Material → amber (legendary)
 */
export const spellComponentConfig = {
    Concentração: {
        name: "Concentração",
        color: "red",
        badge: "bg-red-400/20 text-red-400",
        border: "border-red-400/20",
        text: "text-red-400",
        hex: rarityColors.artifact,
    },
    Somático: {
        name: "Somático",
        color: "emerald",
        badge: "bg-emerald-400/20 text-emerald-400",
        border: "border-emerald-400/20",
        text: "text-emerald-400",
        hex: rarityColors.uncommon,
    },
    Verbal: {
        name: "Verbal",
        color: "blue",
        badge: "bg-blue-400/20 text-blue-400",
        border: "border-blue-400/20",
        text: "text-blue-400",
        hex: rarityColors.rare,
    },
    Material: {
        name: "Material",
        color: "amber",
        badge: "bg-amber-400/20 text-amber-400",
        border: "border-amber-400/20",
        text: "text-amber-400",
        hex: rarityColors.legendary,
    },
} as const

/**
 * D&D Dice Types colors mapped from rarity system.
 */
export const diceColors = {
    d20: {
        rarity: "common" as RarityColor,
        text: "text-gray-400",
        bg: "bg-gray-400/20",
        border: "border-gray-400/20",
    },
    d4: {
        rarity: "uncommon" as RarityColor,
        text: "text-emerald-400",
        bg: "bg-emerald-400/20",
        border: "border-emerald-400/20",
    },
    d6: {
        rarity: "rare" as RarityColor,
        text: "text-blue-400",
        bg: "bg-blue-400/20",
        border: "border-blue-400/20",
    },
    d8: {
        rarity: "veryRare" as RarityColor,
        text: "text-purple-400",
        bg: "bg-purple-400/20",
        border: "border-purple-400/20",
    },
    d10: {
        rarity: "legendary" as RarityColor,
        text: "text-amber-400",
        bg: "bg-amber-400/20",
        border: "border-amber-400/20",
    },
    d12: {
        rarity: "artifact" as RarityColor,
        text: "text-red-400",
        bg: "bg-red-400/20",
        border: "border-red-400/20",
    },
} as const

export type SpellSchool = keyof typeof spellSchoolColors
export type SpellComponent = keyof typeof spellComponentConfig
export type DiceType = keyof typeof diceColors
export type DamageType = keyof typeof damageTypeColors

/**
 * Helper to find damage color by a key (e.g., "veneno", "fire")
 */
export function getDamageColorByKey(key: string) {
    if (!key) return null

    // Função interna para remover acentos e normalizar
    const normalize = (str: string) =>
        str
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim()
            .replace(/[\[\]]/g, "")

    const normalizedKey = normalize(key)

    const damageType = Object.values(damageTypeColors).find((dt) => dt.keys.some((k) => normalize(k) === normalizedKey))

    return damageType ? { text: damageType.text, bgAlpha: damageType.bgAlpha } : null
}

/**
 * D&D Damage Types colors.
 * Refined based on BG3/Modern D&D visual cues.
 *
 * Mapping logic:
 * - Physical (Pancada, Corte, Perfuração) → common (gray/iron)
 * - Fire (Fogo) → artifact (bright orange/red)
 * - Cold (Frio) → rare (light blue/ice)
 * - Lightning (Elétrico) → legendary (bright yellow/gold)
 * - Poison (Veneno) → uncommon (toxic green)
 * - Acid (Ácido) → uncommon (yellow-green/lime)
 * - Psychic (Psíquico) → veryRare (magenta/pink-purple)
 * - Necrotic (Necrótico) → veryRare (dark purple/decay)
 * - Radiant (Radiante) → legendary (white-gold/radiant)
 * - Thunder (Trovão) → rare (deep blue/storm)
 * - Force (Força) → rare (cyan/arcane pure)
 */
/**
 * Damage type colors based on Baldur's Gate 3 color codes.
 * Includes common naming keys for each type to facilitate text matching.
 */
export const damageTypeColors = {
    acid: {
        hex: damageTypeHex.acid,
        keys: ["ácido", "acid", "corrosivo"],
        color: "lime",
        bgAlpha: `bg-[${damageTypeHex.acid}]/10`,
        text: `text-[${damageTypeHex.acid}]`,
    },
    cold: {
        hex: damageTypeHex.cold,
        keys: ["frio", "cold", "gelo", "glacial", "gélido"],
        color: "cyan",
        bgAlpha: `bg-[${damageTypeHex.cold}]/10`,
        text: `text-[${damageTypeHex.cold}]`,
    },
    fire: {
        hex: damageTypeHex.fire,
        keys: ["fogo", "fire", "ígneo", "chamas"],
        color: "orange",
        bgAlpha: `bg-[${damageTypeHex.fire}]/10`,
        text: `text-[${damageTypeHex.fire}]`,
    },
    force: {
        hex: damageTypeHex.force,
        keys: ["força", "force", "arcano", "puro"],
        color: "red",
        bgAlpha: `bg-[${damageTypeHex.force}]/10`,
        text: `text-[${damageTypeHex.force}]`,
    },
    healing: {
        hex: damageTypeHex.healing,
        keys: ["cura", "healing", "vitalidade", "regeneração"],
        color: "teal",
        bgAlpha: `bg-[${damageTypeHex.healing}]/10`,
        text: `text-[${damageTypeHex.healing}]`,
    },
    lightning: {
        hex: damageTypeHex.lightning,
        keys: ["elétrico", "lightning", "choque", "relâmpago", "raio"],
        color: "blue",
        bgAlpha: `bg-[${damageTypeHex.lightning}]/10`,
        text: `text-[${damageTypeHex.lightning}]`,
    },
    necrotic: {
        hex: damageTypeHex.necrotic,
        keys: ["necrótico", "necrotic", "decomposição", "morte"],
        color: "emerald",
        bgAlpha: `bg-[${damageTypeHex.necrotic}]/10`,
        text: `text-[${damageTypeHex.necrotic}]`,
    },
    poison: {
        hex: damageTypeHex.poison,
        keys: ["veneno", "poison", "tóxico", "peçonha"],
        color: "green",
        bgAlpha: `bg-[${damageTypeHex.poison}]/10`,
        text: `text-[${damageTypeHex.poison}]`,
    },
    radiant: {
        hex: damageTypeHex.radiant,
        keys: ["radiante", "radiant", "sagrado", "luz"],
        color: "amber",
        bgAlpha: `bg-[${damageTypeHex.radiant}]/10`,
        text: `text-[${damageTypeHex.radiant}]`,
    },
    thunder: {
        hex: damageTypeHex.thunder,
        keys: ["trovão", "thunder", "som", "sônico"],
        color: "purple",
        bgAlpha: `bg-[${damageTypeHex.thunder}]/10`,
        text: `text-[${damageTypeHex.thunder}]`,
    },
    psychic: {
        hex: damageTypeHex.psychic,
        keys: ["psíquico", "psychic", "mental", "mente"],
        color: "pink",
        bgAlpha: `bg-[${damageTypeHex.psychic}]/10`,
        text: `text-[${damageTypeHex.psychic}]`,
    },
    physical: {
        hex: damageTypeHex.physical,
        keys: ["físico", "physical", "pancada", "corte", "perfuração", "concussão"],
        color: "slate",
        bgAlpha: `bg-[${damageTypeHex.physical}]/10`,
        text: `text-[${damageTypeHex.physical}]`,
    },
} as const

/**
 * Feedback configuration for status, types and priority.
 */
export const feedbackStatusConfig = {
    cancelado: {
        label: "Cancelado",
        color: "artifact",
        badge: "bg-red-400/20 text-red-400",
        hex: rarityColors.artifact,
    },
    pendente: {
        label: "Pendente",
        color: "legendary",
        badge: "bg-amber-400/20 text-amber-400",
        hex: rarityColors.legendary,
    },
    concluido: {
        label: "Concluído",
        color: "uncommon",
        badge: "bg-emerald-400/20 text-emerald-400",
        hex: rarityColors.uncommon,
    },
} as const

export const feedbackTypeConfig = {
    bug: {
        label: "Bug",
        color: "artifact",
        badge: "bg-red-400/20 text-red-400",
        hex: rarityColors.artifact,
    },
    melhoria: {
        label: "Melhoria",
        color: "rare",
        badge: "bg-blue-400/20 text-blue-400",
        hex: rarityColors.rare,
    },
} as const

export const feedbackPriorityConfig = {
    baixa: {
        label: "Baixa",
        color: "uncommon",
        badge: "bg-emerald-400/20 text-emerald-400",
        hex: rarityColors.uncommon,
    },
    media: {
        label: "Média",
        color: "legendary",
        badge: "bg-amber-400/20 text-amber-400",
        hex: rarityColors.legendary,
    },
    alta: {
        label: "Alta",
        color: "artifact",
        badge: "bg-red-400/20 text-red-400",
        hex: rarityColors.artifact,
    },
} as const

export type FeedbackStatus = keyof typeof feedbackStatusConfig
export type FeedbackType = keyof typeof feedbackTypeConfig
export type FeedbackPriority = keyof typeof feedbackPriorityConfig

/**
 * Maps rarity color names to Tailwind CSS bg/text class pairs.
 * Used for applying rarity-based colors to UI components.
 */
export const rarityToTailwind: Record<RarityColor, { bg: string; text: string; border: string }> = {
    common: { bg: "bg-gray-400/20", text: "text-gray-300", border: "border-gray-400/20" },
    uncommon: { bg: "bg-emerald-400/20", text: "text-emerald-400", border: "border-emerald-400/20" },
    rare: { bg: "bg-blue-400/20", text: "text-blue-400", border: "border-blue-400/20" },
    veryRare: { bg: "bg-purple-400/20", text: "text-purple-400", border: "border-purple-400/20" },
    legendary: { bg: "bg-amber-400/20", text: "text-amber-400", border: "border-amber-400/20" },
    artifact: { bg: "bg-red-400/20", text: "text-red-400", border: "border-red-400/20" },
} as const

/**
 * D&D Size categories colors.
 */
export const sizeColors = {
    Pequeno: {
        color: "emerald",
        bgAlpha: "bg-emerald-500/10",
        text: "text-emerald-400",
        hex: rarityColors.uncommon,
    },
    Médio: {
        color: "blue",
        bgAlpha: "bg-blue-500/10",
        text: "text-blue-400",
        hex: rarityColors.rare,
    },
    Grande: {
        color: "amber",
        bgAlpha: "bg-amber-500/10",
        text: "text-amber-400",
        hex: rarityColors.legendary,
    },
} as const

/**
 * Maps a spell circle (0-9) or feat level (1-20) to a D&D rarity color key.
 * Extracted from GlassLevelChip for shared use.
 *
 * @see src/components/ui/glass-level-chip.tsx
 */
export function getLevelRarityVariant(level: number, type: "level" | "circle" = "level"): RarityColor {
    if (type === "circle") {
        // Spell circles (0–9) — full spectrum progression
        // Truque (0) is common (gray) — special cantrip tier
        if (level === 0) return "common" // Truque → gray
        if (level <= 2) return "uncommon" // 1-2   → green
        if (level <= 4) return "rare" // 3-4   → blue
        if (level <= 6) return "veryRare" // 5-6   → purple
        if (level <= 8) return "legendary" // 7-8   → amber
        if (level === 9) return "artifact" // 9     → red
        return "common"
    } else {
        if (level >= 1 && level <= 3) return "common"
        if (level >= 4 && level <= 8) return "uncommon"
        if (level >= 9 && level <= 13) return "rare"
        if (level >= 14 && level <= 17) return "veryRare"
        if (level >= 18 && level <= 19) return "legendary"
        if (level === 20) return "artifact"
        return "common"
    }
}

