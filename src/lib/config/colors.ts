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
export const entityColors = {
    Habilidade: {
        name: "Habilidade",
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
        name: "Usuário",
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
        name: "Segurança",
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
        name: "Regra",
        color: "slate",
        mention: "bg-slate-500/10 text-slate-400 border-slate-400/20",
        badge: "bg-slate-400/20 text-slate-400",
        border: "border-slate-500/20",
        hoverBorder: "hover:border-slate-500/40",
        bgAlpha: "bg-slate-500/10",
        text: "text-slate-400",
        hex: rarityColors.common, // #9CA3AF
    },
} as const

export type EntityType = keyof typeof entityColors;
