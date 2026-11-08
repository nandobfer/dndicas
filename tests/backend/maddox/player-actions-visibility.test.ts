import { describe, expect, it } from "vitest"
import { Types } from "mongoose"
import { isCombatTurnSummary, isHiddenPlayerAction } from "@/features/maddox/player-actions-visibility"

const me = new Types.ObjectId()
const other = new Types.ObjectId()
const on = { memberId: String(me), hidePlayerActions: true }

describe("DND-36 — regra das declarações ocultas", () => {
    it.each([
        ["declaração de outro jogador", { kind: "declaration", memberId: other, content: "Abro a porta." }, true],
        ["a própria declaração", { kind: "declaration", memberId: me, content: "Abro a porta." }, false],
        ["não fez nada", { kind: "pass", memberId: other, content: "" }, false],
        ["pergunta ao mestre", { kind: "question", memberId: other, content: "Há guardas?" }, false],
        ["narração", { kind: "narration", memberId: null, content: "A porta range." }, false],
        ["ação de combate", { kind: "combat-action", memberId: other, content: "" }, false],
        ["resumo da vez marcado", { kind: "declaration", memberId: other, content: "Ataco.", combatTurn: true }, false],
        ["resumo da vez antigo (sem marca)", { kind: "declaration", memberId: other, content: "Vez de Lyra (rodada do combate)\n- Ataca." }, false],
    ])("%s", (_label, message, hidden) => {
        expect(isHiddenPlayerAction(message, on)).toBe(hidden)
    })

    it("desligado nunca oculta; sem membro (quem não joga) vê a declaração dos outros oculta", () => {
        expect(isHiddenPlayerAction({ kind: "declaration", memberId: other, content: "x" }, { ...on, hidePlayerActions: false })).toBe(false)
        expect(isHiddenPlayerAction({ kind: "declaration", memberId: other, content: "x" }, { memberId: null, hidePlayerActions: true })).toBe(true)
    })

    it("o formato antigo só vale no começo do texto", () => {
        expect(isCombatTurnSummary({ kind: "declaration", content: "Digo: Vez de Lyra (rodada do combate)" })).toBe(false)
    })
})
