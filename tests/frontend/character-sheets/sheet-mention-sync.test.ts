import { describe, expect, it } from "vitest"
import { getLevelOneHpMax } from "@/features/character-sheets/hooks/use-sheet-mention-sync"

describe("getLevelOneHpMax", () => {
    it("uses the full class hit die plus Constitution modifier", () => {
        expect(getLevelOneHpMax("d10", 2)).toBe(12)
    })

    it("never returns less than 1 hit point", () => {
        expect(getLevelOneHpMax("d6", -10)).toBe(1)
    })
})
