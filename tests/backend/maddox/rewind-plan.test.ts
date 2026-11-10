import { describe, expect, it } from "vitest"
import { readTags, rewindTags, tagsOf, turnOfTags, writtenAtOfTags } from "@/features/engramind/campaign-memory-format"
import {
    availableRewindTurns,
    discardedRange,
    excerptOf,
    firstWrittenAt,
    gotoDialogText,
    planMemoryRewind,
    resumeDialogText,
    revisionAsOf,
    rewindBannerText,
    rewindNoticeText,
    undoTarget,
    type MemoryRevisionLike,
} from "@/features/maddox/rewind-plan"

/** Regras puras da volta a um turno (DND-44). */

const rev = (version: number, reason: string, text: string, tags: string[], status = "active"): MemoryRevisionLike => ({ version, reason, status, text, title: "O Mapa", category: "MISSAO", tags })
const current = (from: MemoryRevisionLike, status = from.status) => ({ version: from.version, status, text: from.text, title: from.title, category: from.category, tags: from.tags })

describe("tags do turno", () => {
    it("rewindTags leva turno e instante; leitura devolve os dois e o Diário não os mostra", () => {
        expect(rewindTags(4, 1234)).toEqual(["turno:4", "gravado:1234"])
        expect(rewindTags(null, 99)).toEqual(["gravado:99"])
        expect(turnOfTags(["x", "turno:7"])).toBe(7)
        expect(turnOfTags(["x"])).toBeNull()
        expect(writtenAtOfTags(["gravado:55"])).toBe(55)
        expect(writtenAtOfTags(["turno:3"])).toBeNull()
        const tags = tagsOf({ kind: "missao", tags: ["pista", "gravado:1"], status: "ativa", turnNumber: 3, writtenAt: 500 })
        expect(tags).toEqual(["pista", "status:ativa", "turno:3", "gravado:500"])
        expect(readTags(tags, "missao")).toEqual({ tags: ["pista"], status: "ativa", turnNumber: 3 })
    })
})

describe("turnos disponíveis e trecho", () => {
    const snapshots = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((turnNumber) => ({ turnNumber, excerpt: `Narração ${turnNumber}` }))

    it("só turnos com retrato, menores que a origem e diferentes do atual, do mais recente ao mais antigo", () => {
        expect(availableRewindTurns(snapshots, { originTurn: 10, atTurn: 10 }).map((item) => item.turnNumber)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1])
        expect(availableRewindTurns(snapshots, { originTurn: 10, atTurn: 5 }).map((item) => item.turnNumber)).toEqual([9, 8, 7, 6, 4, 3, 2, 1])
        expect(availableRewindTurns([{ turnNumber: 1, excerpt: "" }], { originTurn: 1, atTurn: 1 })).toEqual([])
        // Turnos antigos, sem retrato, não aparecem.
        expect(availableRewindTurns(snapshots.filter((item) => item.turnNumber > 6), { originTurn: 10, atTurn: 10 }).map((item) => item.turnNumber)).toEqual([9, 8, 7])
    })

    it('"Desfazer turno" vai ao turno anterior com retrato; sem nenhum, não há alvo', () => {
        const available = availableRewindTurns(snapshots, { originTurn: 10, atTurn: 5 })
        expect(undoTarget(available, 5)).toBe(4)
        expect(undoTarget(availableRewindTurns(snapshots.filter((item) => item.turnNumber !== 4), { originTurn: 10, atTurn: 5 }), 5)).toBe(3)
        expect(undoTarget([], 1)).toBeNull()
    })

    it("trecho descartado e textos da faixa, da linha e dos modais", () => {
        expect(discardedRange(5, 10)).toEqual({ from: 6, to: 10 })
        expect(rewindBannerText({ atTurn: 5, originTurn: 10 })).toBe("A mesa voltou ao turno 5. Os turnos 6 a 10 serão perdidos quando o Maddox narrar de novo.")
        expect(rewindNoticeText({ event: "goto", turnNumber: 5 })).toBe("O dono voltou a mesa para o turno 5")
        expect(rewindNoticeText({ event: "resume", turnNumber: 10 })).toBe("O dono retomou o turno 10")
        expect(gotoDialogText(7, 10, false)).toEqual({
            title: "Voltar ao turno 7?",
            description: "A mesa volta ao estado do turno 7: o que aconteceu nos turnos 8 a 10 sai da mesa e do Diário. Você ainda pode voltar ao turno atual até o Maddox narrar de novo.",
            confirmLabel: "Voltar ao turno 7",
        })
        expect(gotoDialogText(7, 10, true).description).toMatch(/ As declarações feitas depois da volta serão perdidas\.$/)
        expect(resumeDialogText(10, false)).toEqual({ title: "Voltar ao turno atual (10)?", description: "Tudo o que aconteceu até o turno 10 volta para a mesa e o Diário.", confirmLabel: "Voltar ao turno 10" })
        expect(resumeDialogText(10, true).description).toBe("Tudo o que aconteceu até o turno 10 volta para a mesa e o Diário. As declarações feitas depois da volta serão perdidas.")
    })

    it("trecho da narração: primeiras palavras sem marcação", () => {
        expect(excerptOf("O **dragão** acorda e {{Monstro:Dragão Vermelho}} ruge", 5)).toBe("O dragão acorda e Dragão…")
        expect(excerptOf("Curto.")).toBe("Curto.")
    })
})

describe("revisão que vale num turno", () => {
    const created = rev(1, "create", "Achar o mapa.", ["status:ativa", "turno:2", "gravado:1000"])
    const updated = rev(2, "update", "O mapa foi achado.", ["status:concluida", "turno:5", "gravado:2000"])
    const reverted = rev(3, "revert", "Achar o mapa.", ["status:ativa", "turno:2", "gravado:1000"])

    it("a mais nova gravada até o instante; as operações da volta não contam", () => {
        expect(revisionAsOf([updated, created], 1500)?.version).toBe(1)
        expect(revisionAsOf([reverted, updated, created], 2500)?.version).toBe(2)
        expect(revisionAsOf([updated, created], 500)).toBeNull()
        // Gravações depois de `keepAfter` (posição atual) também valem.
        expect(revisionAsOf([updated, created], 1500, 1800)?.version).toBe(2)
        expect(firstWrittenAt([updated, created])).toBe(1000)
    })

    it("atualizada depois: volta ao conteúdo do turno (revert) e repetir não muda nada", () => {
        expect(planMemoryRewind(current(updated), [updated, created], { asOf: 1500, deleteAfter: 3000 })).toEqual({ kind: "apply", revertTo: 1, status: null })
        expect(planMemoryRewind(current(reverted), [reverted, updated, created], { asOf: 1500, deleteAfter: 3000 })).toEqual({ kind: "keep" })
    })

    it("criada depois: arquivada; nascida depois da volta: excluída; reativada ao ir para frente", () => {
        expect(planMemoryRewind(current(created), [created], { asOf: 500, deleteAfter: 3000 })).toEqual({ kind: "apply", revertTo: null, status: "archive" })
        expect(planMemoryRewind(current(created, "archived"), [created], { asOf: 500, deleteAfter: 3000 })).toEqual({ kind: "keep" })
        expect(planMemoryRewind(current(created), [created], { asOf: 500, deleteAfter: 800 })).toEqual({ kind: "delete" })
        expect(planMemoryRewind(current(created, "archived"), [rev(2, "archive", created.text, [...created.tags], "archived"), created], { asOf: 1500, deleteAfter: 3000 })).toEqual({ kind: "apply", revertTo: null, status: "restore" })
    })

    it("memória antiga, sem turno: nunca é afetada", () => {
        const legacy = rev(1, "create", "Antiga.", ["pista"])
        expect(planMemoryRewind(current(legacy), [legacy], { asOf: 0, deleteAfter: 0 })).toEqual({ kind: "keep" })
    })
})
