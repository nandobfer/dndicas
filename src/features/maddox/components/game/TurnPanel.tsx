"use client"

import { memberAvatarContext } from "../../constants"
import { useState } from "react"
import { Crown, Dices, Shield, SkipForward, Users } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { IconAction } from "@/components/ui/opex/icon-action"
import { ConfirmDialog } from "@/components/ui/opex/confirm-dialog"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import { rarityColors } from "@/lib/config/colors"
import type { MaddoxGameParticipantDto, MaddoxGameStateDto } from "../../game-types"
import { MADDOX_SEAT_LABELS, seatStatus, type MaddoxSeatStatus } from "../../game-view"
import type { MaddoxGamePresence } from "../../hooks/useMaddoxGame"
import { MemberAvatar, OpexChip } from "../campaigns/campaign-visuals"
import { HpBar } from "./combat/HpBar"
import { GlassTooltipProvider, SimpleGlassTooltip } from "@/components/ui/glass-tooltip"
import { XpBar } from "../campaigns/XpBar"
import { CalcTooltip } from "@/features/character-sheets/components/calc-tooltip"

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
    state: MaddoxGameStateDto
    presence: MaddoxGamePresence
    color: string
    skipping: boolean
    onSkip: (memberId: string) => void
    /** Dono rola o teste pendente no lugar do jogador ausente (Maddox 5). */
    rollingFor?: boolean
    onRollFor?: (checkId: string, characterName: string) => void
}

/** Participantes da mesa: presença, situação no turno e "Pular" (dono) para quem está sendo aguardado. */
export function TurnPanel({ state, presence, color, skipping, onSkip, rollingFor = false, onRollFor }: Props) {
    const [confirming, setConfirming] = useState<MaddoxGameParticipantDto | null>(null)
    const [confirmingRoll, setConfirmingRoll] = useState<{ checkId: string; characterName: string } | null>(null)
    const canRollFor = state.me.isOwner && state.me.ready && state.status === "active" && state.turn.phase === "master" && state.turn.awaitingChecks
    const canSkip = state.me.isOwner && state.me.ready && state.status === "active" && state.turn.phase === "players"

    return (
        <Card className="h-fit">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="h-4 w-4 text-primary" aria-hidden /> Na mesa ({state.participants.length})
                </CardTitle>
            </CardHeader>
            <CardContent>
                <ul className="divide-y divide-white/5" aria-label="Participantes da mesa">
                    {state.participants.map((participant) => {
                        const seat = seatStatus(participant, state, presence)
                        return (
                            <li key={participant.memberId} className="space-y-1.5 py-2.5" data-testid={`seat-${participant.memberId}`}>
                                <div className="flex items-start gap-2.5">
                                    <div className="relative shrink-0">
                                        <MemberAvatar name={participant.characterName ?? participant.name} imageUrl={participant.portraitUrl} color={color} context={memberAvatarContext({ opex: participant.opex, role: participant.role, playerName: participant.name })} className="h-9 w-9" />
                                        {!participant.opex && <SeatStatusDot seat={seat} />}
                                    </div>
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 break-words text-sm font-medium leading-snug text-white" data-testid="seat-character-name">
                                            <span className="min-w-0 break-words">{participant.characterName || (participant.opex ? "Personagem Opex em criação" : "Personagem ainda não criado")}</span>
                                            {participant.opex && <OpexChip />}
                                        </p>
                                        {!participant.opex && (
                                            <p className="flex flex-wrap items-center gap-1 break-words text-xs text-white/60">
                                                {participant.role === "owner" && <Crown className="h-3 w-3 shrink-0" style={{ color: rarityColors.legendary }} aria-label="Dono" />}
                                                <span className="min-w-0 break-words">
                                                    {participant.name}
                                                    {participant.memberId === state.me.memberId ? " · você" : ""}
                                                </span>
                                            </p>
                                        )}
                                        {(participant.hp || participant.armorClass) && (
                                            <div className="flex items-center gap-2" data-testid="seat-vitals">
                                                {participant.hp && <HpBar hp={participant.hp} name={participant.characterName ?? participant.name} testId="seat-hp" className="min-w-0 flex-1" />}
                                                {participant.armorClass && <ArmorClassChip armorClass={participant.armorClass} characterName={participant.characterName ?? participant.name} />}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-0.5">
                                        {canRollFor &&
                                            participant.memberId !== state.me.memberId &&
                                            state.turn.pendingChecks
                                                .filter((check) => check.memberId === participant.memberId)
                                                .map((check) => (
                                                    <Button key={check.checkId} size="sm" variant="ghost" onClick={() => setConfirmingRoll({ checkId: check.checkId, characterName: check.characterName })} aria-label={`Rolar no lugar de ${check.characterName}`} disabled={rollingFor}>
                                                        <Dices aria-hidden /> Rolar no lugar
                                                    </Button>
                                                ))}
                                        {canSkip && participant.eligible && !participant.declared && <IconAction icon={SkipForward} label={`Pular a vez de ${participant.characterName ?? participant.name}`} busy={skipping} onClick={() => setConfirming(participant)} />}
                                    </div>
                                </div>
                                <XpBar xp={participant.xp} color={color} />
                            </li>
                        )
                    })}
                </ul>
                {!presence.available && (
                    <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-xs text-white/60" role="note">
                        Sem tempo real: a mesa considera todos os jogadores do turno e atualiza a cada poucos segundos.
                    </p>
                )}
            </CardContent>
            <ConfirmDialog
                open={confirming !== null}
                onOpenChange={(open) => !open && setConfirming(null)}
                title={`Pular a vez de ${confirming?.characterName ?? confirming?.name ?? "jogador"}?`}
                description='O personagem fica com "não fez nada" neste turno. Só vale para o turno atual.'
                confirmLabel="Pular"
                pending={skipping}
                onConfirm={() => {
                    if (confirming) onSkip(confirming.memberId)
                    setConfirming(null)
                }}
            />
            <ConfirmDialog
                open={confirmingRoll !== null}
                onOpenChange={(open) => !open && setConfirmingRoll(null)}
                title={`Rolar o teste no lugar de ${confirmingRoll?.characterName ?? "jogador"}?`}
                description="O dado é rolado agora, com os modificadores da ficha do personagem, e o resultado vai para o Maddox. Use quando o jogador não puder rolar."
                confirmLabel="Rolar no lugar"
                pending={rollingFor}
                onConfirm={() => {
                    if (confirmingRoll) onRollFor?.(confirmingRoll.checkId, confirmingRoll.characterName)
                    setConfirmingRoll(null)
                }}
            />
        </Card>
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
