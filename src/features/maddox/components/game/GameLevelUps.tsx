"use client"

import { useState, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { LevelUpBanner, useAutoOpenLevelUp } from "@/features/character-sheets/components/level-up/level-up-banner"
import { LevelUpWizard } from "@/features/character-sheets/components/level-up/level-up-wizard"
import { MADDOX_LEVEL_UP_TEXT } from "../../constants"
import type { MaddoxLevelUpStepDto } from "../../game-types"
import { refreshGame } from "../../hooks/useMaddoxGame"
import { useRetryOpexLevelUp } from "../../hooks/useMaddoxLevelUps"

/**
 * Subida de nível na mesa (DND-56): o wizard abre sozinho para o jogador (uma vez por subida) e o aviso "Subir de nível"
 * fica no cabeçalho até ele concluir. Não bloqueia turno nenhum. O dono vê também as subidas de Personagens Opex que
 * falharam, para concluir no wizard da ficha do Opex ou pedir ao Opex que decida de novo ("Tentar de novo").
 */
export function useGameLevelUps(
    campaignId: string,
    steps: readonly MaddoxLevelUpStepDto[] | undefined,
): { banner: ReactNode; dialog: ReactNode; open: (step: MaddoxLevelUpStepDto) => void; retry: (step: MaddoxLevelUpStepDto) => void; retryingId: string | null } {
    const queryClient = useQueryClient()
    const retryMutation = useRetryOpexLevelUp(campaignId)
    const [opened, setOpened] = useState<MaddoxLevelUpStepDto | null>(null)
    const list = steps ?? []
    const mine = list.find((step) => step.mine && step.kind === "human") ?? null
    useAutoOpenLevelUp(mine?.id ?? null, () => setOpened(mine), "mesa")
    const banner = list.length ? (
        <div className="space-y-1">
            {list.map((step) => (
                <LevelUpBanner
                    key={step.id}
                    toLevel={step.toLevel}
                    text={step.kind === "opex" ? MADDOX_LEVEL_UP_TEXT.bannerOwnerFailed(step.characterName, step.toLevel) : MADDOX_LEVEL_UP_TEXT.bannerPending(step.characterName, step.toLevel)}
                    onOpen={() => setOpened(step)}
                />
            ))}
        </div>
    ) : null
    const dialog = opened?.sheetId ? (
        <LevelUpWizard
            sheetId={opened.sheetId}
            open
            characterName={opened.characterName}
            onOpenChange={(next) => !next && setOpened(null)}
            onDone={() => refreshGame(queryClient)}
        />
    ) : null
    const retryingId = retryMutation.isPending ? (retryMutation.variables ?? null) : null
    return { banner, dialog, open: setOpened, retry: (step) => retryMutation.mutate(step.id), retryingId }
}
