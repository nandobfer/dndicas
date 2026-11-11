import { describe, expect, it } from "vitest"
import { rollSlot, type RollSlotInput } from "@/features/maddox/components/game/combat/roll-hold"

const none: ReadonlySet<string> = new Set()
const base: RollSlotInput = { rolls: [null, null], pendingIndex: 0, local: null, replay: null, revealed: none, finished: none }

describe("rollSlot — onde fica o dado do card de combate (DND-48)", () => {
    it("sem rolagem em andamento, o dado fica no passo pendente (ou em nenhum)", () => {
        expect(rollSlot(base)).toEqual({ index: 0, holding: false, revealed: false })
        expect(rollSlot({ ...base, pendingIndex: -1 })).toEqual({ index: -1, holding: false, revealed: false })
    })

    it("a rolagem local segura o passo do clique, mesmo com a mesa já no passo seguinte", () => {
        expect(rollSlot({ ...base, pendingIndex: 1, local: { index: 0, rollId: null } })).toEqual({ index: 0, holding: true, revealed: false })
        expect(rollSlot({ ...base, pendingIndex: -1, local: { index: 1, rollId: "r1" }, revealed: new Set(["r1"]) })).toEqual({ index: 1, holding: true, revealed: true })
    })

    it("a repetição fica no passo que ela resolveu; antes da mesa nova, no pendente", () => {
        const replay = { rollId: "r9" }
        expect(rollSlot({ ...base, replay })).toEqual({ index: 0, holding: true, revealed: false })
        expect(rollSlot({ ...base, rolls: [{ rollId: "r9" }, null], pendingIndex: 1, replay })).toEqual({ index: 0, holding: true, revealed: false })
        expect(rollSlot({ ...base, rolls: [{ rollId: "r9" }, null], pendingIndex: -1, replay, revealed: new Set(["r9"]) })).toEqual({ index: 0, holding: true, revealed: true })
    })

    it("a repetição cujo palco já saiu não segura nada", () => {
        expect(rollSlot({ ...base, rolls: [{ rollId: "r9" }, null], pendingIndex: 1, replay: { rollId: "r9" }, finished: new Set(["r9"]) })).toEqual({ index: 1, holding: false, revealed: false })
    })

    it("a repetição sem passo resolvido nem pendente não aparece", () => {
        expect(rollSlot({ ...base, pendingIndex: -1, replay: { rollId: "r9" } })).toEqual({ index: -1, holding: false, revealed: false })
    })
})
