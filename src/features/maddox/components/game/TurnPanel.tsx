"use client"

import { MADDOX_MASTER_REVIEWING_MESSAGE } from "../../constants"
import { useState } from "react"
import { Dices, SkipForward, Swords, Users } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { IconAction } from "@/components/ui/opex/icon-action"
import { ConfirmDialog } from "@/components/ui/opex/confirm-dialog"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import type { MaddoxGameParticipantDto, MaddoxGameStateDto } from "../../game-types"
import { seatStatus, tableSeatsView } from "../../game-view"
import type { MaddoxGamePresence } from "../../hooks/useMaddoxGame"
import { COMBAT_COLOR } from "./GameCombatCard"
import { SeatRow } from "./SeatRow"

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

/**
 * Card único de personagens da mesa: participantes com presença, situação no turno e "Pular" (dono) para quem está
 * sendo aguardado. No combate tático (DND-75) o mesmo card vira a ordem de iniciativa, com os combatentes do mestre.
 */
export function TurnPanel({ state, presence, color, skipping, onSkip, rollingFor = false, onRollFor }: Props) {
    const [confirming, setConfirming] = useState<MaddoxGameParticipantDto | null>(null)
    const [confirmingRoll, setConfirmingRoll] = useState<{ checkId: string; characterName: string } | null>(null)
    const canRollFor = state.me.isOwner && state.me.ready && state.status === "active" && state.turn.phase === "master" && state.turn.awaitingChecks
    const canSkip = state.me.isOwner && state.me.ready && state.status === "active" && state.turn.phase === "players"

    const view = tableSeatsView(state)
    const actionsFor = (participant: MaddoxGameParticipantDto) => {
        const rolls = canRollFor && participant.memberId !== state.me.memberId ? state.turn.pendingChecks.filter((check) => check.memberId === participant.memberId) : []
        const skippable = canSkip && participant.eligible && !participant.declared
        if (rolls.length === 0 && !skippable) return null
        return (
            <>
                {rolls.map((check) => (
                    <Button key={check.checkId} size="sm" variant="ghost" onClick={() => setConfirmingRoll({ checkId: check.checkId, characterName: check.characterName })} aria-label={`Rolar no lugar de ${check.characterName}`} disabled={rollingFor || Boolean(state.turn.masterReviewing)} title={state.turn.masterReviewing ? MADDOX_MASTER_REVIEWING_MESSAGE : undefined}>
                        <Dices aria-hidden /> Rolar no lugar
                    </Button>
                ))}
                {skippable && <IconAction icon={SkipForward} label={`Pular a vez de ${participant.characterName ?? participant.name}`} busy={skipping} onClick={() => setConfirming(participant)} />}
            </>
        )
    }
    const seatRow = (participant: MaddoxGameParticipantDto) => <SeatRow key={participant.memberId} participant={participant} seat={seatStatus(participant, state, presence)} isMe={participant.memberId === state.me.memberId} color={color} actions={actionsFor(participant)} />

    return (
        <Card className="h-fit" data-testid="table-card" data-mode={view.mode} style={view.mode === "combat" ? { borderColor: `${COMBAT_COLOR}40` } : undefined}>
            <CardHeader>
                {view.mode === "combat" ? (
                    <>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Swords className="h-4 w-4" style={{ color: COMBAT_COLOR }} aria-hidden /> {view.label}
                        </CardTitle>
                        <p className="truncate text-xs text-white/60" data-testid="table-combat-title">
                            {view.title}
                        </p>
                    </>
                ) : (
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Users className="h-4 w-4 text-primary" aria-hidden /> Na mesa ({state.participants.length})
                    </CardTitle>
                )}
            </CardHeader>
            <CardContent>
                {view.mode === "combat" ? (
                    <>
                        <ol className="space-y-1.5" aria-label="Ordem de iniciativa" data-testid="table-combat-order">
                            {view.order.map(({ slot, participant }) =>
                                participant ? (
                                    <SeatRow key={slot.actorKey} participant={participant} slot={slot} seat={seatStatus(participant, state, presence)} isMe={participant.memberId === state.me.memberId} color={color} actions={actionsFor(participant)} />
                                ) : (
                                    <SeatRow key={slot.actorKey} slot={slot} color={color} />
                                ),
                            )}
                        </ol>
                        {view.outside.length > 0 && (
                            <div className="mt-4">
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50">Fora do combate</h3>
                                <ul className="divide-y divide-white/5" aria-label="Fora do combate">
                                    {view.outside.map(seatRow)}
                                </ul>
                            </div>
                        )}
                    </>
                ) : (
                    <ul className="divide-y divide-white/5" aria-label="Participantes da mesa">
                        {view.seats.map(seatRow)}
                    </ul>
                )}
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
