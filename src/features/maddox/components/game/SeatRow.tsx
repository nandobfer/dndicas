"use client"

import type { ReactNode } from "react"
import { motion } from "framer-motion"
import { Crown, Shield, Skull, Swords } from "lucide-react"
import { cn } from "@/core/utils"
import { GlassTooltipProvider, SimpleGlassTooltip } from "@/components/ui/glass-tooltip"
import { CalcTooltip } from "@/features/character-sheets/components/calc-tooltip"
import { rarityColors } from "@/lib/config/colors"
import { MADDOX_AVATAR_CONTEXT, memberAvatarContext } from "../../constants"
import type { MaddoxGameParticipantDto, MaddoxTacticalSlotDto } from "../../game-types"
import { MADDOX_SEAT_LABELS, type MaddoxSeatStatus } from "../../game-view"
import { MemberAvatar, OpexChip } from "../campaigns/campaign-visuals"
import { XpBar } from "../campaigns/XpBar"
import { CombatantChips, CombatantVitals, PrepSeal, combatantHasChips } from "./combat/CombatantStatus"
import { HpBar } from "./combat/HpBar"
import { COMBAT_COLOR } from "./GameCombatCard"

/** Cor de raridade de cada situação no turno. */
export const SEAT_COLORS: Record<MaddoxSeatStatus, string> = {
    declared: rarityColors.uncommon,
    waiting: rarityColors.legendary,
    offline: rarityColors.common,
    "next-turn": rarityColors.veryRare,
    preparing: rarityColors.common,
    watching: rarityColors.rare,
    rolling: rarityColors.mythic,
    resting: rarityColors.divine,
}

interface Props {
    /** Assento do participante (presença, jogador, CA, XP e ações); ausente nos combatentes do mestre. */
    participant?: MaddoxGameParticipantDto | null
    /** Situação do participante no turno (bolinha do avatar). */
    seat?: MaddoxSeatStatus | null
    /** Linha da ordem de iniciativa (DND-75): iniciativa, quem age, preparação, PV/faixa e condições. */
    slot?: MaddoxTacticalSlotDto | null
    isMe?: boolean
    color: string
    actions?: ReactNode
}

/**
 * DND-75: uma linha do card da mesa. Sem `slot`, o assento de sempre (presença, situação, vitais, XP e ações); com
 * `slot`, a mesma linha ganha os dados do combate tático — e um combatente do mestre aparece só com eles.
 */
export function SeatRow({ participant = null, seat = null, slot = null, isMe = false, color, actions }: Props) {
    const name = participant ? (participant.characterName ?? participant.name) : (slot?.name ?? "")
    const avatar = participant ? (
        <div className="relative shrink-0">
            <MemberAvatar name={name} imageUrl={participant.portraitUrl} color={color} context={memberAvatarContext({ opex: participant.opex, role: participant.role, playerName: participant.name })} className="h-9 w-9" />
            {!participant.opex && seat && <SeatStatusDot seat={seat} />}
        </div>
    ) : slot?.kind === "character" ? (
        <MemberAvatar name={slot.name} imageUrl={slot.portraitUrl} color={slot.active ? color : rarityColors.rare} context={slot.opex ? MADDOX_AVATAR_CONTEXT.opex : MADDOX_AVATAR_CONTEXT.character} className="h-9 w-9 shrink-0" />
    ) : slot ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: `${slot.side === "aliado" ? rarityColors.uncommon : COMBAT_COLOR}66` }}>
            {slot.defeated ? <Skull className="h-4 w-4 text-white/60" aria-hidden /> : <Swords className="h-4 w-4" style={{ color: slot.side === "aliado" ? rarityColors.uncommon : COMBAT_COLOR }} aria-hidden />}
        </span>
    ) : null
    const out = Boolean(slot && (slot.defeated || slot.dead))
    const characterName = participant ? participant.characterName || (participant.opex ? "Personagem Opex em criação" : "Personagem ainda não criado") : name
    const hp = slot ? null : participant?.hp
    const vitals = slot ? <CombatantVitals slot={slot} hp={participant?.hp} name={name} className="min-w-0 flex-1" /> : hp ? <HpBar hp={hp} name={name} className="min-w-0 flex-1" /> : null
    const armorClass = participant?.armorClass

    const chips = slot ? <CombatantChips slot={slot} /> : null
    const hasChips = Boolean(slot?.prep || (slot && combatantHasChips(slot)))

    // DND-75: o cabeçalho (iniciativa, avatar, nome, ações) fica numa linha só; selo, PV e XP ocupam a largura do card.
    const body = (
        <>
            <div className="flex items-center gap-2.5" data-testid="seat-header">
                {slot && (
                    <span className="w-6 shrink-0 text-center text-sm font-black text-white" data-testid="initiative-value">
                        {slot.initiative ?? "…"}
                    </span>
                )}
                {avatar}
                <div className="min-w-0 flex-1 space-y-0.5">
                    <p className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-0.5 break-words text-sm font-medium leading-snug text-white", out && "line-through")} data-testid="seat-character-name">
                        <span className="min-w-0 break-words">{characterName}</span>
                        {(participant?.opex ?? slot?.opex) && <OpexChip />}
                    </p>
                    {participant && !participant.opex && (
                        <p className="flex flex-wrap items-center gap-1 break-words text-xs text-white/60">
                            {participant.role === "owner" && <Crown className="h-3 w-3 shrink-0" style={{ color: rarityColors.legendary }} aria-label="Dono" />}
                            <span className="min-w-0 break-words">
                                {participant.name}
                                {isMe ? " · você" : ""}
                            </span>
                        </p>
                    )}
                </div>
                {actions && <div className="flex shrink-0 items-center gap-0.5">{actions}</div>}
            </div>
            {hasChips && (
                <div className="flex flex-wrap items-center gap-1" data-testid="seat-chips">
                    {slot?.prep && <PrepSeal prep={slot.prep} />}
                    {chips}
                </div>
            )}
            {(vitals || armorClass) && (
                <div className="flex items-center gap-2" data-testid="seat-vitals">
                    {vitals}
                    {armorClass && <ArmorClassChip armorClass={armorClass} characterName={name} />}
                </div>
            )}
            {participant && <XpBar xp={participant.xp} color={color} />}
        </>
    )

    const testId = participant ? `seat-${participant.memberId}` : `combatant-${slot?.actorKey}`
    if (!slot) {
        return (
            <li className="space-y-1.5 py-2.5" data-testid={testId}>
                {body}
            </li>
        )
    }
    return (
        <motion.li
            layout
            className={cn("space-y-1.5 rounded-lg border px-2.5 py-2", out && "opacity-50")}
            style={{ borderColor: slot.active ? color : "rgba(255,255,255,0.08)", background: slot.active ? `${color}1a` : "rgba(255,255,255,0.02)", boxShadow: slot.active ? `0 0 0 1px ${color}55, 0 0 18px ${color}33` : undefined }}
            data-testid={testId}
            data-combat-slot={slot.actorKey}
            data-active={slot.active}
            data-kind={slot.kind}
        >
            {body}
        </motion.li>
    )
}

/** DND-66: CA do personagem (DND-63: só o valor, no estilo do antigo rótulo "CA") com a conta por parcela no tooltip — cada bônus nomeado pelo nome. */
function ArmorClassChip({ armorClass, characterName }: { armorClass: NonNullable<MaddoxGameParticipantDto["armorClass"]>; characterName: string }) {
    const description = armorClass.parts.map((part) => `${part.label} ${part.value}`).join(", ")
    return (
        <CalcTooltip formula={armorClass.formula} parts={armorClass.parts} result={String(armorClass.value)}>
            <span
                tabIndex={0}
                role="img"
                aria-label={`CA de ${characterName}: ${armorClass.value}${description ? ` (${description})` : ""}`}
                data-testid="seat-armor-class"
                className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/[0.06] px-1.5 py-0.5 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
                <Shield className="h-3.5 w-3.5 text-white/70" aria-hidden />
                <span className="text-[10px] font-semibold uppercase tabular-nums tracking-wider text-white/60">{armorClass.value}</span>
            </span>
        </CalcTooltip>
    )
}

/** DND-63: situação do jogador no turno como bolinha no canto superior direito do avatar, com o rótulo no tooltip. */
function SeatStatusDot({ seat }: { seat: MaddoxSeatStatus }) {
    const label = MADDOX_SEAT_LABELS[seat]
    return (
        <GlassTooltipProvider>
            <SimpleGlassTooltip content={label}>
                <span
                    tabIndex={0}
                    role="img"
                    aria-label={label}
                    data-testid="seat-status"
                    data-status={seat}
                    className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    style={{ backgroundColor: SEAT_COLORS[seat] }}
                />
            </SimpleGlassTooltip>
        </GlassTooltipProvider>
    )
}
