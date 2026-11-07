/**
 * Combate tático (DND-25): espera a mesa assentar — a fila de gerações vazia E sem prazo da sequência agendado (dado dos
 * inimigos na tela, pausa entre blocos de NPC). Use com `combatTiming` encurtado no teste.
 */
export async function settleCampaign(campaignId: string, timeoutMs = 8_000): Promise<void> {
    const [{ waitForCampaignIdle, isCampaignBusy }, { hasSequenceTimer }] = await Promise.all([import("@/features/maddox/server/game-live"), import("@/features/maddox/server/tactical-combat")])
    const deadline = Date.now() + timeoutMs
    for (;;) {
        await waitForCampaignIdle(campaignId)
        if (!hasSequenceTimer(campaignId) && !isCampaignBusy(campaignId)) return
        if (Date.now() > deadline) throw new Error("A mesa não assentou no prazo")
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
}

/** Encurta o dado dos inimigos e a pausa entre blocos (os testes não esperam os segundos reais). */
export async function shortenCombatTiming(): Promise<void> {
    const { combatTiming } = await import("@/features/maddox/server/tactical-combat")
    combatTiming.enemyRevealMs = 20
    combatTiming.npcBlockPauseMs = 20
}
