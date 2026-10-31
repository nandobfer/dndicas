import { describe, expect, it } from "vitest"
import { MADDOX_GAME_STREAM_INITIAL, reduceGameStream, splitGameStreamLines } from "@/features/maddox/hooks/useMaddoxGameStream"
import { visibleLiveGenerations } from "@/features/maddox/game-view"
import type { MaddoxGameStreamLine, MaddoxLiveGenerationDto } from "@/features/maddox/game-types"

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
            { type: "live-end", liveId: "l1", messageId: "n2", error: null },
        ]
        const state = lines.reduce(reduceGameStream, MADDOX_GAME_STREAM_INITIAL)
        expect(state.live).toEqual([])
        expect(state.settled).toEqual([expect.objectContaining({ liveId: "l1", text: "A névoa sobe.", messageId: "n2", tool: false })])
        expect(state.finished).toBe(1)
        expect(visibleLiveGenerations(state, [{ id: "outra" }])).toHaveLength(1)
        expect(visibleLiveGenerations(state, [{ id: "n2" }])).toHaveLength(0)
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
