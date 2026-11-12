"use client"

import { memberAvatarContext } from "../../constants"
import { useState } from "react"
import { Crown, Dices, SkipForward, Users } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { ConfirmDialog } from "@/components/ui/opex/confirm-dialog"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import { rarityColors } from "@/lib/config/colors"
import type { MaddoxGameParticipantDto, MaddoxGameStateDto } from "../../game-types"
import { MADDOX_SEAT_LABELS, seatStatus, type MaddoxSeatStatus } from "../../game-view"
import type { MaddoxGamePresence } from "../../hooks/useMaddoxGame"
import { MemberAvatar, OpexChip, RarityChip } from "../campaigns/campaign-visuals"

/** Cor de raridade de cada situação no turno. */
export const SEAT_COLORS: Record<MaddoxSeatStatus, string> = {
    declared: rarityColors.uncommon,
    waiting: rarityColors.legendary,
    offline: rarityColors.common,
    "next-turn": rarityColors.veryRare,
    preparing: rarityColors.common,
    watching: rarityColors.rare,
    rolling: rarityColors.mythic,
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
                        const online = presence.online.has(participant.userId)
                        return (
                            <li key={participant.memberId} className="flex flex-wrap items-center gap-2.5 py-2.5" data-testid={`seat-${participant.memberId}`}>
                                <div className="relative">
                                    <MemberAvatar name={participant.characterName ?? participant.name} imageUrl={participant.portraitUrl} color={color} context={memberAvatarContext({ opex: participant.opex, role: participant.role, playerName: participant.name })} className="h-9 w-9" />
                                    {presence.available && !participant.opex && (
                                        <span
                                            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background"
                                            style={{ backgroundColor: online ? rarityColors.uncommon : rarityColors.common }}
                                            aria-label={online ? "Online" : "Offline"}
                                            role="img"
                                        />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="flex items-center gap-1.5 truncate text-sm font-medium text-white">
                                        {participant.characterName || (participant.opex ? "Personagem Opex em criação" : "Personagem ainda não criado")}
                                        {participant.opex && <OpexChip />}
                                    </p>
                                    <p className="flex items-center gap-1 truncate text-xs text-white/60">
                                        {participant.role === "owner" && <Crown className="h-3 w-3" style={{ color: rarityColors.legendary }} aria-label="Dono" />}
                                        {participant.name}
                                        {participant.memberId === state.me.memberId ? " · você" : ""}
                                    </p>
                                </div>
                                {!participant.opex && <RarityChip color={SEAT_COLORS[seat]}>{MADDOX_SEAT_LABELS[seat]}</RarityChip>}
                                {canRollFor &&
                                    participant.memberId !== state.me.memberId &&
                                    state.turn.pendingChecks
                                        .filter((check) => check.memberId === participant.memberId)
                                        .map((check) => (
                                            <Button key={check.checkId} size="sm" variant="ghost" onClick={() => setConfirmingRoll({ checkId: check.checkId, characterName: check.characterName })} aria-label={`Rolar no lugar de ${check.characterName}`} disabled={rollingFor}>
                                                <Dices aria-hidden /> Rolar no lugar
                                            </Button>
                                        ))}
                                {canSkip && participant.eligible && !participant.declared && (
                                    <Button size="sm" variant="ghost" onClick={() => setConfirming(participant)} aria-label={`Pular ${participant.characterName ?? participant.name}`} disabled={skipping}>
                                        <SkipForward aria-hidden /> Pular
                                    </Button>
                                )}
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
