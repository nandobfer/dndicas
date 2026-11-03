"use client"

import type { ReactNode } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/opex/avatar"
import { rarityColors } from "@/lib/config/colors"
import { cn } from "@/lib/utils"
import { MADDOX_CAMPAIGN_STATUS_DEFS, MADDOX_DEFAULT_DENSITY, MADDOX_DENSITY_LEVEL_DEFS, MADDOX_INTERVIEW_STATUS_DEFS, MADDOX_RIGOR_LEVEL_DEFS, type MaddoxCampaignStatus, type MaddoxDensityLevel, type MaddoxInterviewStatus, type MaddoxRigorLevel } from "../../constants"
import { worldNames, type WorldCatalog } from "../../world-catalog"

/** Cor de raridade do nível de rigor (comum → lendário). */
export const rigorColor = (rigor: MaddoxRigorLevel) => rarityColors[MADDOX_RIGOR_LEVEL_DEFS[rigor].rarity]
/** Definição do nível de densidade (DND-22); campanha sem o campo = a padrão. */
export const densityDef = (density: MaddoxDensityLevel | null | undefined) => MADDOX_DENSITY_LEVEL_DEFS[density ?? MADDOX_DEFAULT_DENSITY] ?? MADDOX_DENSITY_LEVEL_DEFS[MADDOX_DEFAULT_DENSITY]
/** Cor de raridade do nível de densidade (comum → lendário). */
export const densityColor = (density: MaddoxDensityLevel | null | undefined) => rarityColors[densityDef(density).rarity]
export const statusColor = (status: MaddoxCampaignStatus) => rarityColors[MADDOX_CAMPAIGN_STATUS_DEFS[status].rarity]

/** Chip com a cor de raridade (borda, fundo translúcido e texto). */
export function RarityChip({ color, children, className }: { color: string; children: ReactNode; className?: string }) {
    return (
        <span
            className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", className)}
            style={{ color, borderColor: `${color}55`, backgroundColor: `${color}1a` }}
        >
            {children}
        </span>
    )
}

export const RigorChip = ({ rigor }: { rigor: MaddoxRigorLevel }) => <RarityChip color={rigorColor(rigor)}>{MADDOX_RIGOR_LEVEL_DEFS[rigor].label}</RarityChip>
export const DensityChip = ({ density }: { density: MaddoxDensityLevel | null | undefined }) => (
    <RarityChip color={densityColor(density)}>
        <span data-testid="maddox-density-chip">Narração {densityDef(density).label.toLowerCase()}</span>
    </RarityChip>
)
export const StatusChip = ({ status }: { status: MaddoxCampaignStatus }) => <RarityChip color={statusColor(status)}>{MADDOX_CAMPAIGN_STATUS_DEFS[status].label}</RarityChip>

const initials = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || "?"

/** Avatar de um membro: retrato do personagem, senão a foto do usuário, senão as iniciais. */
export function MemberAvatar({ name, imageUrl, color, className }: { name: string; imageUrl: string | null; color?: string; className?: string }) {
    return (
        <Avatar className={cn("h-8 w-8 border-2 border-background", className)} style={color ? { borderColor: color } : undefined}>
            {imageUrl && <AvatarImage src={imageUrl} alt={name} className="object-cover" />}
            <AvatarFallback className="bg-white/10 text-[11px] text-white/80">{initials(name)}</AvatarFallback>
        </Avatar>
    )
}

/** Situação da entrevista (cenário ou personagem) na cor de raridade. */
export const InterviewChip = ({ status }: { status: MaddoxInterviewStatus | "proposed" }) => (
    <RarityChip color={rarityColors[MADDOX_INTERVIEW_STATUS_DEFS[status].rarity]}>{MADDOX_INTERVIEW_STATUS_DEFS[status].label}</RarityChip>
)

/** Nível inicial da mesa (graus com ficha), num chip. */
export function StartingLevelChip({ campaign }: { campaign: { startingLevel: number | null } }) {
    if (!campaign.startingLevel) return null
    return (
        <RarityChip color={rarityColors.rare}>
            <span data-testid="starting-level-chip">Nível inicial {campaign.startingLevel}</span>
        </RarityChip>
    )
}

/**
 * Estágio de experiência inicial (graus narrativos). Vem da consolidação do modelo e pode ser longo: aparece inteiro, com
 * quebra de linha, fora dos chips.
 */
export function StartingStageLine({ campaign, className }: { campaign: { startingLevel: number | null; startingStage: string }; className?: string }) {
    const stage = campaign.startingStage.trim()
    if (campaign.startingLevel || !stage) return null
    return (
        <p className={cn("whitespace-normal break-words text-sm text-white/70", className)} data-testid="starting-stage">
            <span className="font-medium" style={{ color: rarityColors.rare }}>
                Estágio inicial:
            </span>{" "}
            {stage}
        </p>
    )
}

/** Povos e classes do mundo (Maddox 8, Fiel ao D&D): só aparece quando o cenário gravou alguma lista. */
export function WorldCatalogLines({ campaign, className }: { campaign: { worldCatalog?: WorldCatalog | null }; className?: string }) {
    const world = campaign.worldCatalog
    if (!world || (!world.races.length && !world.classes.length)) return null
    const rows = [
        { key: "races", label: "Povos deste mundo:", items: world.races },
        { key: "classes", label: "Classes deste mundo:", items: world.classes },
    ].filter((row) => row.items.length)
    return (
        <div className={cn("space-y-1", className)} data-testid="world-catalog">
            {rows.map((row) => (
                <p key={row.key} className="whitespace-normal break-words text-sm text-white/70" data-testid={`world-catalog-${row.key}`}>
                    <span className="font-medium" style={{ color: rarityColors.legendary }}>
                        {row.label}
                    </span>{" "}
                    {worldNames(row.items)}
                </p>
            ))}
        </div>
    )
}
