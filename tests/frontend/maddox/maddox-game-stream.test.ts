import { describe, expect, it } from "vitest"
import { MADDOX_GAME_STREAM_INITIAL, reduceGameStream, splitGameStreamLines } from "@/features/maddox/hooks/useMaddoxGameStream"
import { isNewerMessageId, visibleLiveGenerations } from "@/features/maddox/game-view"
import type { MaddoxGameStreamLine, MaddoxLiveGenerationDto } from "@/features/maddox/game-types"

const hex = (n: number) => n.toString(16).padStart(24, "0")
const live = (over: Partial<MaddoxLiveGenerationDto> = {}): MaddoxLiveGenerationDto => ({ liveId: "l1", kind: "narration", turnNumber: 2, replyToId: null, text: "", tool: false, startedAt: "2026-10-31T10:00:00.000Z", ...over })

describe("stream da mesa (cliente)", () => {
    it("junta as linhas NDJSON e guarda o resto incompleto", () => {
        const { lines, rest } = splitGameStreamLines('{"type":"ping"}\n{"type":"delta","liveId":"l1","text":"A"}\n{"type":"de')
        expect(lines.map((line) => line.type)).toEqual(["ping", "delta"])
        expect(rest).toBe('{"type":"de')
    })

    it("acompanha a geração: início, texto, ferramenta e fim (vai para `settled` com a mensagem gravada)", () => {
        const lines: MaddoxGameStreamLine[] = [
            { type: "snapshot", live: [] },
            { type: "live-start", live: live() },
            { type: "delta", liveId: "l1", text: "A névoa " },
            { type: "tool", liveId: "l1", running: true },
            { type: "delta", liveId: "l1", text: "sobe." },
            { type: "tool", liveId: "l1", running: false },
            { type: "live-end", liveId: "l1", messageId: hex(2), error: null },
        ]
        const state = lines.reduce(reduceGameStream, MADDOX_GAME_STREAM_INITIAL)
        expect(state.live).toEqual([])
        expect(state.settled).toEqual([expect.objectContaining({ liveId: "l1", text: "A névoa sobe.", messageId: hex(2), tool: false })])
        expect(state.finished).toBe(1)
        expect(visibleLiveGenerations(state, [])).toHaveLength(1)
        expect(visibleLiveGenerations(state, [{ id: hex(1) }])).toHaveLength(1)
        expect(visibleLiveGenerations(state, [{ id: hex(1) }, { id: hex(2) }])).toHaveLength(0)
    })

    it("fim com erro não fica na tela; o snapshot de uma reconexão substitui o que estava ao vivo", () => {
        let state = reduceGameStream(MADDOX_GAME_STREAM_INITIAL, { type: "live-start", live: live() })
        state = reduceGameStream(state, { type: "live-end", liveId: "l1", messageId: null, error: "falhou" })
        expect(state.settled).toEqual([])
        expect(state.finished).toBe(1)
        state = reduceGameStream(state, { type: "snapshot", live: [live({ liveId: "l2", text: "Já em andamento" })] })
        expect(state.live).toEqual([expect.objectContaining({ liveId: "l2", text: "Já em andamento" })])
    })
})

describe("gerações terminadas depois de voltar a um turno (DND-46)", () => {
    const settledAt = (n: number) => ({ ...live({ liveId: `l${n}` }), messageId: hex(n) })

    it("a geração cuja mensagem saiu da mesa (mais antiga que a mais recente carregada) não volta à tela", () => {
        const stream = { live: [], settled: [settledAt(5), settledAt(6)] }
        // Aviso da volta (id 9) é mais novo que tudo o que ela descartou ou apagou.
        expect(visibleLiveGenerations(stream, [{ id: hex(3) }, { id: hex(9) }])).toEqual([])
    })

    it("a geração ainda não gravada, mais nova que tudo o que foi carregado, continua na tela", () => {
        const stream = { live: [], settled: [settledAt(5), settledAt(12)] }
        expect(visibleLiveGenerations(stream, [{ id: hex(9) }]).map((item) => item.liveId)).toEqual(["l12"])
    })

    it("guarda no máximo as 20 gerações terminadas mais recentes", () => {
        let state = MADDOX_GAME_STREAM_INITIAL
        for (let n = 1; n <= 25; n += 1) {
            state = reduceGameStream(state, { type: "live-start", live: live({ liveId: `l${n}` }) })
            state = reduceGameStream(state, { type: "live-end", liveId: `l${n}`, messageId: hex(n), error: null })
        }
        expect(state.settled).toHaveLength(20)
        expect(state.settled[0].messageId).toBe(hex(6))
    })

    it("compara ids pelo tempo (hex de mesmo tamanho) e pelo tamanho", () => {
        expect(isNewerMessageId(hex(10), hex(9))).toBe(true)
        expect(isNewerMessageId(hex(9), hex(10))).toBe(false)
        expect(isNewerMessageId(hex(9), hex(9))).toBe(false)
        expect(isNewerMessageId("aa", "f")).toBe(true)
    })
})

describe("rolagens dos testes no stream (Maddox 5)", () => {
    it("check-rolled guarda a rolagem por mensagem (sem duplicar) para todos repetirem a animação", () => {
        const roll = (total: number) => ({ rollId: `r${total}`, terms: [{ dice: "d20" as const, quantity: 1, results: [total - 5] }], mode: "normal" as const, diceTotal: total - 5, modifier: 5, total, createdAt: "2026-10-31T10:00:00.000Z" })
        let state = reduceGameStream(MADDOX_GAME_STREAM_INITIAL, { type: "check-rolled", messageId: "k1", roll: roll(17) })
        state = reduceGameStream(state, { type: "check-rolled", messageId: "k2", roll: roll(9) })
        state = reduceGameStream(state, { type: "check-rolled", messageId: "k1", roll: roll(18) })
        expect(state.rolled).toEqual([
            { messageId: "k2", roll: expect.objectContaining({ total: 9 }) },
            { messageId: "k1", roll: expect.objectContaining({ total: 18 }) },
        ])
        // Não mexe nas gerações ao vivo.
        expect(state.live).toEqual([])
        expect(state.finished).toBe(0)
    })
})
