import { render } from "@testing-library/react"
import { vi } from "vitest"
import { TurnPanel } from "@/features/maddox/components/game/TurnPanel"
import type { MaddoxGameParticipantDto, MaddoxGameStateDto, MaddoxTacticalCombatDto } from "@/features/maddox/game-types"

/** Assento da mesa para os testes do card "Na mesa" (DND-75). */
export const tableSeat = (over: Partial<MaddoxGameParticipantDto> = {}): MaddoxGameParticipantDto => ({ memberId: "m1", userId: "u1", name: "Marina", characterName: "Kael", portraitUrl: null, role: "player", ready: true, eligible: true, declared: false, xp: null, ...over })

/** Estado mínimo da mesa para renderizar o `TurnPanel`, com ou sem combate tático. */
export function tableState({ combat = null, title = "Cripta", participants = [], me = {}, turn = {} }: { combat?: MaddoxTacticalCombatDto | null; title?: string; participants?: MaddoxGameParticipantDto[]; me?: Record<string, unknown>; turn?: Record<string, unknown> } = {}): MaddoxGameStateDto {
    return {
        campaignId: "c1",
        status: "active",
        turn: { number: 2, phase: "players", startedAt: null, generating: false, failed: false, awaitingChecks: false, pendingChecks: [], opexActor: null, ...turn },
        participants,
        me: { memberId: "m1", isOwner: false, ready: true, eligible: true, declared: false, sheet: null, ...me },
        combat: combat ? { id: "cb1", title, location: "", startedTurn: 1, masterTurns: 0, combatants: [], mode: "tactical", tactical: combat } : null,
    } as unknown as MaddoxGameStateDto
}

/** Renderiza o card único da mesa em combate tático (substitui o antigo `InitiativeTracker`). */
export function renderCombatTable(combat: MaddoxTacticalCombatDto, options: Omit<Parameters<typeof tableState>[0] & object, "combat"> = {}) {
    return render(<TurnPanel state={tableState({ ...options, combat })} presence={{ available: false, online: new Set() }} color="#3B82F6" skipping={false} onSkip={vi.fn()} />)
}
