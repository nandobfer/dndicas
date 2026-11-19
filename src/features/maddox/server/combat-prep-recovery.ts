import { Types } from "mongoose"
import { loggerFor } from "@/lib/logger"
import { MADDOX_COMBAT_PREP_RECOVERY_THROTTLE_MS } from "../constants"
import { MaddoxCombatPrepModel } from "../models"

/**
 * DND-75: a fila das preparações da mesa de combate só existe na memória do processo. Depois de um deploy ou reinício,
 * as preparações `pending`/`running` ficavam presas ("Preparando…" para sempre) até alguém sair da mesa e disparar o
 * `check`. Esta retomada roda ao subir o servidor, na rotina `maddox-combat-prep-recovery` (a cada minuto) e na leitura
 * da mesa (no máximo a cada `MADDOX_COMBAT_PREP_RECOVERY_THROTTLE_MS` por campanha).
 */

const log = loggerFor({ module: "maddox", feature: "combat-prep-recovery" })

/** Status que a retomada olha: na fila, em andamento e com pergunta ao jogador (o prazo vive num timer do processo). */
const RECOVERABLE = ["pending", "running", "awaiting-player"] as const

const lastRecovery = ((globalThis as unknown as { __maddoxCombatPrepRecovery?: Map<string, number> }).__maddoxCombatPrepRecovery ??= new Map<string, number>())

/** Retoma as preparações de todas as campanhas com alguma em aberto. A falha de uma campanha não para as outras. */
export async function recoverCombatPreps(): Promise<number> {
    const { scheduleCombatPreps } = await import("./combat-prep")
    const campaignIds = await MaddoxCombatPrepModel.distinct("campaignId", { status: { $in: [...RECOVERABLE] } })
    let queued = 0
    for (const campaignId of campaignIds) {
        try {
            queued += await scheduleCombatPreps(new Types.ObjectId(String(campaignId)))
            lastRecovery.set(String(campaignId), Date.now())
        } catch (error) {
            log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaignId) }, "[maddox] falha ao retomar as preparações da campanha")
        }
    }
    if (queued) log.info({ queued, campaigns: campaignIds.length }, "[maddox] preparações de combate retomadas")
    return queued
}

/** Leitura da mesa: retoma as preparações da campanha, no máximo uma vez por intervalo. Nunca lança. */
export async function recoverCampaignCombatPreps(campaignId: Types.ObjectId, now: number = Date.now()): Promise<void> {
    const key = String(campaignId)
    const last = lastRecovery.get(key)
    if (last !== undefined && now - last < MADDOX_COMBAT_PREP_RECOVERY_THROTTLE_MS) return
    lastRecovery.set(key, now)
    try {
        // Sem preparação em aberto (o caso comum), nem carrega o módulo da preparação.
        if (!(await MaddoxCombatPrepModel.exists({ campaignId, status: { $in: [...RECOVERABLE] } }))) return
        const { scheduleCombatPreps } = await import("./combat-prep")
        await scheduleCombatPreps(campaignId)
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: key }, "[maddox] falha ao retomar a preparação do combate na leitura da mesa")
    }
}

/** Testes: esquece o intervalo das leituras. */
export function resetCombatPrepRecoveryThrottle(): void {
    lastRecovery.clear()
}

/** Rotina `maddox-combat-prep-recovery`: vigia (job além do teto vira falha) e retomada. Devolve o resumo para Crons. */
export async function runCombatPrepRecovery(): Promise<string> {
    const { expireOverdueCombatPreps } = await import("./combat-prep")
    const expired = await expireOverdueCombatPreps()
    const queued = await recoverCombatPreps()
    return `${queued} preparação(ões) retomada(s) · ${expired} encerrada(s) por tempo`
}
