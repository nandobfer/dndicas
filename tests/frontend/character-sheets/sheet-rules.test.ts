/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest"
import { appendMentionsToHtml, extractMentionsFromHtml, buildMentionHtml as buildFromMentionSync } from "@/features/character-sheets/utils/mention-sync"
import { getLevelOneHpMax as levelOneFromHook } from "@/features/character-sheets/hooks/use-sheet-mention-sync"
import { buildWeaponAttackAutofill as weaponFromAutofill } from "@/features/character-sheets/utils/attack-autofill"
import { buildBoundResourceCharge as chargeFromResources } from "@/features/character-sheets/utils/resource-charges"
import {
    appendMentionParagraphs,
    averageHpGain,
    buildBoundResourceCharge,
    buildMentionHtml,
    buildWeaponAttackAutofill,
    collectTraitMentionsUpTo,
    getLevelOneHpMax,
    mapSpellSlotsForLevel,
    parseMentionsFromHtml,
    rolledHpGain,
} from "@/features/character-sheets/utils/sheet-rules"

/**
 * Regras puras da ficha (`sheet-rules.ts`, sem DOM e sem "use client") usadas pelo servidor ao montar a ficha da
 * entrevista: o resultado tem de ser o mesmo do preenchimento automático da ficha no navegador.
 */

const HTML = [
    '<p><span data-type="mention" data-id="a1" data-entity-type="Habilidade" data-label="Sopro &amp; Fôlego" class="mention">Sopro &amp; Fôlego</span></p>',
    '<p>Texto <span class="mention" data-entity-type="Talento" data-id="f2" data-type="mention">Defesa</span> e mais.</p>',
    '<p><span data-type="mention" data-id="" data-entity-type="Item">Sem id</span></p>',
].join("")

describe("sheet-rules (servidor) x ficha (navegador)", () => {
    it("lê as menções do HTML do catálogo igual ao parser de DOM da ficha", () => {
        expect(parseMentionsFromHtml(HTML)).toEqual(extractMentionsFromHtml(HTML))
        expect(parseMentionsFromHtml(HTML)).toEqual([
            { id: "a1", entityType: "Habilidade", label: "Sopro & Fôlego" },
            { id: "f2", entityType: "Talento", label: "Defesa" },
        ])
        expect(parseMentionsFromHtml("<p>sem menção</p>")).toEqual([])
    })

    it("as funções re-exportadas pelos módulos da ficha são as mesmas (um único lugar para a regra)", () => {
        expect(buildFromMentionSync).toBe(buildMentionHtml)
        expect(levelOneFromHook).toBe(getLevelOneHpMax)
        expect(weaponFromAutofill).toBe(buildWeaponAttackAutofill)
        expect(chargeFromResources).toBe(buildBoundResourceCharge)
    })

    it("monta a menção no formato da criação assistida e da ficha", () => {
        const html = buildMentionHtml({ id: "x1", entityType: "Origem", label: "Soldado" })
        expect(html).toBe('<span data-type="mention" data-id="x1" data-entity-type="Origem" data-label="Soldado" class="mention">Soldado</span>')
        expect(extractMentionsFromHtml(`<p>${html}</p>`)).toEqual([{ id: "x1", entityType: "Origem", label: "Soldado" }])
    })

    it("PV: nível 1 pelo máximo do dado; ganhos pela média do assistente (⌈lados/2⌉ + CON) ou pelo dado rolado, mínimo 1", () => {
        expect(getLevelOneHpMax("d10", 2)).toBe(12)
        expect(averageHpGain("d10", 2)).toBe(7)
        expect(averageHpGain("d8", 0)).toBe(4)
        expect(averageHpGain("d6", -5)).toBe(1)
        expect(rolledHpGain(7, 2)).toBe(9)
        expect(rolledHpGain(1, -3)).toBe(1)
    })

    it("traços até o nível: só as menções de habilidade, sem repetir", () => {
        const traits = [
            { level: 1, description: '<span data-type="mention" data-id="t1" data-entity-type="Habilidade">Um</span>' },
            { level: 3, description: '<span data-type="mention" data-id="t3" data-entity-type="Habilidade">Três</span>' },
            { level: 1, description: '<span data-type="mention" data-id="t1" data-entity-type="Habilidade">Um</span> <span data-type="mention" data-id="r" data-entity-type="Regra">Regra</span>' },
        ]
        expect(collectTraitMentionsUpTo(traits, 2).map((mention) => mention.id)).toEqual(["t1"])
        expect(collectTraitMentionsUpTo(traits, 3).map((mention) => mention.id)).toEqual(["t1", "t3"])
    })

    it("espaços de magia do nível pela tabela de progressão", () => {
        const source = { progressionTable: { spellSlots: { 3: { cantrips: 3, preparedSpells: 6, slots: { 1: 4, 2: 2 } } } } } as never
        expect(mapSpellSlotsForLevel(3, source)).toEqual({ "1": { total: 4, used: 0 }, "2": { total: 2, used: 0 } })
        expect(mapSpellSlotsForLevel(1, source)).toEqual({})
    })
})

describe("appendMentionParagraphs (servidor) x appendMentionsToHtml (navegador)", () => {
    const erudito = { id: "t1", entityType: "Habilidade", label: "Erudito" }
    const surto = { id: "t2", entityType: "Habilidade", label: "Surto & Ação" }

    it("acrescenta uma menção por parágrafo e não repete o que o campo já cita", () => {
        const base = `<p>Notas.</p><p>${buildMentionHtml(erudito)}</p>`
        expect(appendMentionParagraphs(base, [erudito, surto, surto])).toBe(`${base}<p>${buildMentionHtml(surto)}</p>`)
        expect(appendMentionParagraphs(base, [erudito])).toBe(base)
        expect(appendMentionParagraphs("<p></p>", [erudito])).toBe(`<p>${buildMentionHtml(erudito)}</p>`)
        expect(appendMentionParagraphs(null, [])).toBe("")
    })

    it("o navegador lê o mesmo resultado (mesmas menções, uma por parágrafo)", () => {
        const base = `<p>Notas.</p><p>${buildMentionHtml(erudito)}</p>`
        const server = appendMentionParagraphs(base, [erudito, surto])
        const browser = appendMentionsToHtml(base, [erudito, surto])
        expect(extractMentionsFromHtml(server)).toEqual(extractMentionsFromHtml(browser))
        const paragraphs = (html: string) => new DOMParser().parseFromString(html, "text/html").body.querySelectorAll("p").length
        expect(paragraphs(server)).toBe(paragraphs(browser))
        // Depois da subida, o sync do navegador não acha nada novo para acrescentar.
        expect(extractMentionsFromHtml(appendMentionsToHtml(server, [erudito, surto]))).toEqual(extractMentionsFromHtml(server))
    })
})
