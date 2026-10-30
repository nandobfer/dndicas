"use client"

import type { ReactNode } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/opex/avatar"
import { rarityColors } from "@/lib/config/colors"
import { cn } from "@/lib/utils"
import { MADDOX_CAMPAIGN_STATUS_DEFS, MADDOX_RIGOR_LEVEL_DEFS, type MaddoxCampaignStatus, type MaddoxRigorLevel } from "../../constants"

/** Cor de raridade do nível de rigor (comum → lendário). */
export const rigorColor = (rigor: MaddoxRigorLevel) => rarityColors[MADDOX_RIGOR_LEVEL_DEFS[rigor].rarity]
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
