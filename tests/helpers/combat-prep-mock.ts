import { vi } from "vitest"
import { recordCatalogRead, type CatalogReadLog } from "@/features/maddox/server/catalog-reads"

/**
 * DND-49: simula a leitura de uma entidade do catálogo por ferramenta nesta execução (a fonte das alterações de regra
 * só passa com a entidade lida e o trecho no texto dela).
 */
export function readCatalog(input: { reads?: CatalogReadLog }, type: string, id: string, entity: Record<string, unknown>): void {
    if (input.reads) recordCatalogRead(input.reads, type, id, entity)
}

/**
 * DND-41: IA da preparação da mesa de combate nos testes (nunca há rede). Por padrão, a revisão não muda nada e o
 * pedido de ajuste é recusado; cada teste troca as respostas em `combatPrepAi`. Use com
 * `vi.mock("@/features/maddox/server/combat-prep-ai", async () => (await import("../../helpers/combat-prep-mock")).combatPrepAiModule)`
 * e `waitForCombatPreps()` (server/combat-prep) antes de conferir a ordem de iniciativa.
 */
export const combatPrepAi = {
    /** Checagem de quem está a 0 PV ao abrir o combate (DND-49): por padrão, segue caído. */
    downed: vi.fn(async (input: { characterName: string; currentState: string; recent: string }): Promise<unknown> => {
        void input
        return { decisao: "manter", motivo: "Segue caído." }
    }),
    review: vi.fn(async (input: { characterName: string; sheetText: string; optionsText: string; sneakAttack: string | null; reads?: CatalogReadLog; jobId?: string }): Promise<unknown> => {
        void input
        return { sheetChanges: [], modify: [], remove: [], add: [] }
    }),
    adjust: vi.fn(async (input: { request: string; optionText: string; reads?: CatalogReadLog; jobId?: string }): Promise<unknown> => {
        void input
        return { decision: "refuse", reason: "Sem motivo para mudar." }
    }),
    screen: vi.fn(async (input: { request: string }): Promise<boolean | null> => {
        void input
        return null
    }),
    sneak: vi.fn(async (input: { targetName: string; allies: string[]; situation: string }): Promise<{ ok: boolean; reason: string }> => {
        void input
        return { ok: true, reason: "" }
    }),
    reset() {
        this.review.mockReset()
        this.review.mockImplementation(async () => ({ sheetChanges: [], modify: [], remove: [], add: [] }))
        this.adjust.mockReset()
        this.adjust.mockImplementation(async () => ({ decision: "refuse", reason: "Sem motivo para mudar." }))
        this.screen.mockReset()
        this.screen.mockImplementation(async () => null)
        this.sneak.mockReset()
        this.sneak.mockImplementation(async () => ({ ok: true, reason: "" }))
        this.downed.mockReset()
        this.downed.mockImplementation(async () => ({ decisao: "manter", motivo: "Segue caído." }))
    },
}

export const combatPrepAiModule = {
    withTimeout: async <T>(_ms: number, _label: string, run: (signal: AbortSignal) => Promise<T>) => run(new AbortController().signal),
    reviewCombatSheet: (input: Parameters<typeof combatPrepAi.review>[0]) => combatPrepAi.review(input),
    reviewAdjustment: (input: Parameters<typeof combatPrepAi.adjust>[0]) => combatPrepAi.adjust(input),
    screenAdjustment: (input: Parameters<typeof combatPrepAi.screen>[0]) => combatPrepAi.screen(input),
    checkSneakAttackCondition: (input: Parameters<typeof combatPrepAi.sneak>[0]) => combatPrepAi.sneak(input),
    reviewDownedCharacter: (input: Parameters<typeof combatPrepAi.downed>[0]) => combatPrepAi.downed(input),
}
