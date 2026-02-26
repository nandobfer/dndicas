/**
 * @fileoverview D&D rarity-based color palette for Liquid Glass theme.
 * Colors are derived from the D&D 5e item rarity system and mapped
 * to semantic UI states (actions, roles, glass effects).
 *
 * @see specs/000/research.md - Decision 3
 */

/**
 * Primary color used for main actions (buttons, links, primary interactions).
 * Based on D&D rare (blue) - #3B82F6
 */
export const primaryColor = '#3B82F6';

/**
 * D&D 5e rarity colors mapped to hex values.
 * Used throughout the app for consistent visual hierarchy.
 */
export const rarityColors = {
  /** Common items - neutral/default state */
  common: '#9CA3AF',
  /** Uncommon items - success state (CREATE actions) */
  uncommon: '#10B981',
  /** Rare items - info state (UPDATE actions) */
  rare: primaryColor,
  /** Very Rare items - highlight state (regular users) */
  veryRare: '#8B5CF6',
  /** Legendary items - warning state */
  legendary: '#F59E0B',
  /** Artifact items - danger state (DELETE actions, admins) */
  artifact: '#EF4444',
} as const;

/**
 * Action colors mapped from rarity system.
 * Used for audit log chips and status indicators.
 */
export const actionColors = {
  create: rarityColors.uncommon,
  update: rarityColors.rare,
  delete: rarityColors.artifact,
} as const;

/**
 * Role colors for user badges and indicators.
 * Admin = artifact (red), User = veryRare (purple).
 */
export const roleColors = {
  admin: rarityColors.artifact,
  user: rarityColors.veryRare,
} as const;

/**
 * Liquid Glass effect colors with varying opacity levels.
 * Used for glassmorphism backgrounds and borders.
 */
export const glassColors = {
  /** Light glass overlay (5-10% white) */
  light: 'rgba(255, 255, 255, 0.1)',
  /** Medium glass overlay (15% white) */
  medium: 'rgba(255, 255, 255, 0.15)',
  /** Dark glass overlay (40% black) */
  dark: 'rgba(0, 0, 0, 0.4)',
  /** Subtle border for glass elements */
  border: 'rgba(255, 255, 255, 0.1)',
  /** Glow effect for highlights */
  glow: 'rgba(255, 255, 255, 0.05)',
} as const;

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
} as const;

/** Type for rarity color keys */
export type RarityColor = keyof typeof rarityColors;

/** Type for action color keys */
export type ActionColor = keyof typeof actionColors;

/** Type for role color keys */
export type RoleColor = keyof typeof roleColors;

/**
 * Central configuration for entity colors across the app.
 * Maps entity types to their designated styles and colors.
 * Reverted to original colors: Users = Blue, Security = Purple, Rules = Emerald.
 * T038: Added Habilidade entity color (Slate/Gray).
 */
export const entityConfig = {
    Habilidade: {
        name: "Habilidade",
        color: "emerald",
        mention: "bg-emerald-500/10 text-emerald-400 border-emerald-400/20",
        badge: "bg-emerald-400/20 text-emerald-400",
        border: "border-emerald-500/20",
        hoverBorder: "hover:border-emerald-500/40",
        bgAlpha: "bg-emerald-500/10",
        text: "text-emerald-400",
        hex: rarityColors.uncommon
    },
    Usuário: {
        name: "Usuário",
        color: "blue",
        mention: "bg-blue-500/10 text-blue-400 border-blue-400/20",
        badge: "bg-blue-400/20 text-blue-400",
        border: "border-blue-500/20",
        hoverBorder: "hover:border-blue-500/40",
        bgAlpha: "bg-blue-500/10",
        text: "text-blue-400",
        hex: rarityColors.rare
    },
    Segurança: {
        name: "Segurança",
        color: "purple",
        mention: "bg-purple-500/10 text-purple-400 border-purple-400/20",
        badge: "bg-purple-400/20 text-purple-400",
        border: "border-purple-500/20",
        hoverBorder: "hover:border-purple-500/40",
        bgAlpha: "bg-purple-500/10",
        text: "text-purple-400",
        hex: rarityColors.veryRare
    },
    Regra: {
        name: "Regra",
        color: "slate",
        mention: "bg-slate-500/10 text-slate-400 border-slate-400/20",
        badge: "bg-slate-400/20 text-slate-400",
        border: "border-slate-500/20",
        hoverBorder: "hover:border-slate-500/40",
        bgAlpha: "bg-slate-500/10",
        text: "text-slate-400",
        hex: rarityColors.common // #9CA3AF
    },
    Talento: {
        name: "Talento",
        color: "amber",
        mention: "bg-amber-500/10 text-amber-400 border-amber-400/20",
        badge: "bg-amber-400/20 text-amber-400",
        border: "border-amber-500/20",
        hoverBorder: "hover:border-amber-500/40",
        bgAlpha: "bg-amber-500/10",
        text: "text-amber-400",
        hex: rarityColors.legendary // #F59E0B
    },
    Magia: {
        name: "Magia",
        color: "purple",
        mention: "bg-purple-500/10 text-purple-400 border-purple-400/20",
        badge: "bg-purple-400/20 text-purple-400",
        border: "border-purple-500/20",
        hoverBorder: "hover:border-purple-500/40",
        bgAlpha: "bg-purple-500/10",
        text: "text-purple-400",
        hex: rarityColors.veryRare // #8B5CF6
    }
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

export type EntityType = keyof typeof entityConfig
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
    Verboso: {
        name: "Verboso",
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
    d4: {
        rarity: "common" as RarityColor,
        text: "text-gray-400",
        bg: "bg-gray-400/20",
        border: "border-gray-400/20",
    },
    d6: {
        rarity: "uncommon" as RarityColor,
        text: "text-emerald-400",
        bg: "bg-emerald-400/20",
        border: "border-emerald-400/20",
    },
    d8: {
        rarity: "rare" as RarityColor,
        text: "text-blue-400",
        bg: "bg-blue-400/20",
        border: "border-blue-400/20",
    },
    d10: {
        rarity: "veryRare" as RarityColor,
        text: "text-purple-400",
        bg: "bg-purple-400/20",
        border: "border-purple-400/20",
    },
    d12: {
        rarity: "legendary" as RarityColor,
        text: "text-amber-400",
        bg: "bg-amber-400/20",
        border: "border-amber-400/20",
    },
    d20: {
        rarity: "artifact" as RarityColor,
        text: "text-red-400",
        bg: "bg-red-400/20",
        border: "border-red-400/20",
    },
} as const

export type SpellSchool = keyof typeof spellSchoolColors
export type SpellComponent = keyof typeof spellComponentConfig
export type DiceType = keyof typeof diceColors

/**
 * Feedback configuration for status, types and priority.
 */
export const feedbackStatusConfig = {
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
    cancelado: {
        label: "Cancelado",
        color: "artifact",
        badge: "bg-red-400/20 text-red-400",
        hex: rarityColors.artifact,
    },
} as const;

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
} as const;

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
} as const;

export type FeedbackStatus = keyof typeof feedbackStatusConfig;
export type FeedbackType = keyof typeof feedbackTypeConfig;
export type FeedbackPriority = keyof typeof feedbackPriorityConfig;

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
 * Maps a spell circle (0-9) or feat level (1-20) to a D&D rarity color key.
 * Extracted from GlassLevelChip for shared use.
 *
 * @see src/components/ui/glass-level-chip.tsx
 */
export function getLevelRarityVariant(level: number, type: "level" | "circle" = "level"): RarityColor {
    if (type === "circle") {
        // Spell circles (0–9) — full spectrum progression
        // Truque (0) is uncommon (green) — special cantrip tier
        if (level === 0) return "uncommon"  // Truque → green
        if (level <= 2)  return "common"    // 1-2   → gray
        if (level <= 4)  return "uncommon"  // 3-4   → green
        if (level <= 6)  return "rare"      // 5-6   → blue
        if (level === 7) return "veryRare"  // 7     → purple
        if (level === 8) return "legendary" // 8     → amber
        if (level === 9) return "artifact"  // 9     → red
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

