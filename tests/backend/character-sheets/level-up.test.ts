import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose, { Types } from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

/**
 * DND-56: subida de nível pelo servidor. As opções do próximo nível vêm do catálogo (traços, subclasse, talento ou
 * melhoria, magias pela tabela de progressão) e a aplicação valida as escolhas com a mesma regra para o wizard e para o
 * Personagem Opex. O PV máximo sobe; o atual fica como está (como o wizard sempre fez).
 */

const recordAudit = vi.fn(async () => undefined)
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(async () => undefined), recordAudit, AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR" } }))
vi.mock("@/core/database/db", () => ({ default: vi.fn(async () => undefined) }))
const sheetPusher = vi.hoisted(() => ({ publishSheetPatched: vi.fn(async () => undefined), publishCollectionChanged: vi.fn(async () => undefined) }))
vi.mock("@/features/character-sheets/realtime/character-sheet-pusher-service", () => ({ CharacterSheetPusherService: { getInstance: () => sheetPusher } }))

const { buildLevelUpOptions } = await import("@/features/character-sheets/level-up/level-up-options")
const { applyLevelUp } = await import("@/features/character-sheets/level-up/level-up-apply")
const { LevelUpError } = await import("@/features/character-sheets/level-up/level-up-context")
const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
const { CharacterSpell } = await import("@/features/character-sheets/models/character-spell")
const { CharacterAttack } = await import("@/features/character-sheets/models/character-attack")

let mongo: MongoMemoryServer

const mention = (id: Types.ObjectId | string, label: string, type = "Habilidade") => `<p><span data-type="mention" data-id="${String(id)}" data-entity-type="${type}" data-label="${label}" class="mention">${label}</span></p>`

interface Fixture {
    wizardId: Types.ObjectId
    fighterId: Types.ObjectId
    subclassId: Types.ObjectId
    traits: Record<string, Types.ObjectId>
    spells: Record<string, Types.ObjectId>
    asiFeat: Types.ObjectId
    toughFeat: Types.ObjectId
}

async function fixture(): Promise<Fixture> {
    const traits = { arcana: new Types.ObjectId(), sabio: new Types.ObjectId(), sub: new Types.ObjectId(), asi: new Types.ObjectId(), conj: new Types.ObjectId(), escola: new Types.ObjectId(), surto: new Types.ObjectId(), estilo: new Types.ObjectId() }
    await mongoose.connection.collection("traits").insertMany([
        { _id: traits.arcana, name: "Recuperação Arcana", description: "Recupera espaços.", status: "active", charges: { mode: "fixed", value: "1" } },
        { _id: traits.sabio, name: "Erudito", description: "Perícia.", status: "active" },
        { _id: traits.sub, name: "Subclasse de Mago", description: "Escolha.", status: "active" },
        { _id: traits.asi, name: "Aumento no Valor de Atributo", description: "Talento.", status: "active" },
        { _id: traits.conj, name: "Conjuração", description: "Sempre que você ganhar um nível de Mago, pode substituir uma magia preparada por outra da lista.", status: "active" },
        { _id: traits.escola, name: "Evocação Esculpida", description: "Proteja aliados.", status: "active" },
        { _id: traits.surto, name: "Surto de Ação", description: "Ação extra.", status: "active", charges: { mode: "fixed", value: "1" } },
        { _id: traits.estilo, name: "Estilo de Luta", description: "Talento de Estilo de Luta.", status: "active" },
    ])
    const spells = {
        luz: new Types.ObjectId(),
        raio: new Types.ObjectId(),
        maos: new Types.ObjectId(),
        chama: new Types.ObjectId(),
        escudo: new Types.ObjectId(),
        misseis: new Types.ObjectId(),
        sono: new Types.ObjectId(),
        armadura: new Types.ObjectId(),
        detectar: new Types.ObjectId(),
        bola: new Types.ObjectId(),
        cura: new Types.ObjectId(),
    }
    const spellDoc = (id: Types.ObjectId, name: string, circle: number, extra: Record<string, unknown> = {}) => ({ _id: id, name, circle, description: `${name}.`, school: "Evocação", component: ["V", "S"], castingTime: "Ação", status: "active", ...extra })
    await mongoose.connection.collection("spells").insertMany([
        spellDoc(spells.luz, "Luz", 0),
        spellDoc(spells.raio, "Raio de Fogo", 0, { baseDice: { quantidade: 1, tipo: "d10" } }),
        spellDoc(spells.maos, "Mãos Mágicas", 0),
        spellDoc(spells.chama, "Chama Sagrada", 0),
        spellDoc(spells.escudo, "Escudo Arcano", 1),
        spellDoc(spells.misseis, "Mísseis Mágicos", 1),
        spellDoc(spells.sono, "Sono", 1),
        spellDoc(spells.armadura, "Armadura Arcana", 1),
        spellDoc(spells.detectar, "Detectar Magia", 1),
        spellDoc(spells.bola, "Bola de Fogo", 3),
        spellDoc(spells.cura, "Curar Ferimentos", 1),
    ])
    const list = (["luz", "raio", "maos", "escudo", "misseis", "sono", "armadura", "detectar", "bola"] as const).map((key) => ({ id: String(spells[key]), name: key, circle: key === "bola" ? 3 : ["luz", "raio", "maos"].includes(key) ? 0 : 1 }))
    const row = (cantrips: number, prepared: number, slots: Record<number, number>) => ({ cantrips, preparedSpells: prepared, slots })
    const wizardId = new Types.ObjectId()
    const subclassId = new Types.ObjectId()
    await mongoose.connection.collection("characterclasses").insertOne({
        _id: wizardId,
        name: "Mago",
        hitDice: "d6",
        status: "active",
        savingThrows: [],
        armorProficiencies: [],
        weaponProficiencies: [],
        spellcasting: true,
        spellcastingAttribute: "Inteligência",
        spells: list,
        traits: [
            { level: 1, description: mention(traits.conj, "Conjuração") },
            { level: 1, description: mention(traits.arcana, "Recuperação Arcana") },
            { level: 2, description: mention(traits.sabio, "Erudito") },
            { level: 3, description: mention(traits.sub, "Subclasse de Mago") },
            { level: 4, description: mention(traits.asi, "Aumento no Valor de Atributo") },
        ],
        subclasses: [{ _id: subclassId, name: "Evocador", traits: [{ level: 3, description: mention(traits.escola, "Evocação Esculpida") }] }],
        progressionTable: { spellSlots: { 1: row(3, 4, { 1: 2 }), 2: row(3, 5, { 1: 3 }), 3: row(3, 6, { 1: 4, 2: 2 }), 4: row(4, 7, { 1: 4, 2: 3 }) } },
    })
    const fighterId = new Types.ObjectId()
    await mongoose.connection.collection("characterclasses").insertOne({
        _id: fighterId,
        name: "Guerreiro",
        hitDice: "d10",
        status: "active",
        savingThrows: [],
        armorProficiencies: [],
        weaponProficiencies: [],
        spellcasting: false,
        traits: [
            { level: 1, description: mention(traits.estilo, "Estilo de Luta") },
            { level: 2, description: mention(traits.surto, "Surto de Ação") },
        ],
        subclasses: [],
    })
    const asiFeat = new Types.ObjectId()
    const toughFeat = new Types.ObjectId()
    await mongoose.connection.collection("feats").insertMany([
        { _id: asiFeat, name: "Aumento no Valor de Atributo", level: 4, category: "Geral", attributeBonuses: [], status: "active", description: "+2" },
        { _id: toughFeat, name: "Atlético", level: 4, category: "Geral", attributeBonuses: [{ attribute: "Força", value: 1 }, { attribute: "Destreza", value: 1 }], status: "active", description: "+1" },
        { _id: new Types.ObjectId(), name: "Dádiva do Destino", level: 19, category: "Dádiva Épica", attributeBonuses: [], status: "active", description: "Épica" },
    ])
    return { wizardId, fighterId, subclassId, traits, spells, asiFeat, toughFeat }
}

async function wizardSheet(f: Fixture, level: number, known: (keyof Fixture["spells"])[], extra: Record<string, unknown> = {}) {
    const _id = new Types.ObjectId()
    await CharacterSheet.collection.insertOne({
        _id,
        slug: `mago-${String(_id)}`,
        userId: "dono",
        name: "Vaelyra",
        level,
        experience: 0,
        class: mention(f.wizardId, "Mago", "Classe"),
        classRef: f.wizardId,
        subclassRef: null,
        hpMax: 8,
        hpCurrent: 5,
        hitDiceTotal: "d6",
        strength: 8,
        dexterity: 14,
        constitution: 14,
        intelligence: 17,
        wisdom: 12,
        charisma: 10,
        classFeatures: mention(f.traits.conj, "Conjuração") + mention(f.traits.arcana, "Recuperação Arcana"),
        speciesTraits: "",
        featuresNotes: "",
        spellcastingAttribute: "intelligence",
        spellSlots: { "1": { total: 2, used: 1 } },
        resourceCharges: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        ...extra,
    })
    for (const key of known) await CharacterSpell.create({ sheetId: _id, catalogSpellId: f.spells[key], name: `<p>${key}</p>`, circle: ["luz", "raio", "maos"].includes(key) ? 0 : 1, prepared: true })
    return String(_id)
}

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "level_up" })
})
afterAll(async () => {
    await mongoose.disconnect()
    await mongo.stop()
})
beforeEach(async () => {
    await mongoose.connection.db!.dropDatabase()
    recordAudit.mockClear()
    sheetPusher.publishSheetPatched.mockClear()
})

describe("opções do próximo nível", () => {
    it("Mago 1→2: traço do nível, uma magia nova pela tabela (até o 1º círculo) e os espaços novos", async () => {
        const f = await fixture()
        const id = await wizardSheet(f, 1, ["luz", "raio", "maos", "escudo", "misseis", "sono", "armadura"])
        const options = await buildLevelUpOptions(id)
        expect(options).toMatchObject({ currentLevel: 1, targetLevel: 2, hitDie: "d6", hpAverage: 5, constitutionModifier: 2, subclass: { required: false }, feat: null })
        expect(options.traits.map((trait) => trait.label)).toEqual(["Erudito"])
        expect(options.spells).toMatchObject({ cantrips: 0, spells: 1, maxCircle: 1, swap: { allowed: false } })
        expect(options.spells!.spellOptions.map((spell) => spell.name)).toEqual(["detectar"])
        expect(options.spellSlots).toEqual({ before: { "1": 2 }, after: { "1": 3 } })
    })

    it("nível 3 exige a subclasse e mostra os traços de cada uma", async () => {
        const f = await fixture()
        const id = await wizardSheet(f, 2, [], { hpMax: 14 })
        const options = await buildLevelUpOptions(id)
        expect(options.subclass).toMatchObject({ required: true, options: [{ id: String(f.subclassId), name: "Evocador" }] })
        expect(options.subclassTraits[String(f.subclassId)]?.map((trait) => trait.label)).toEqual(["Evocação Esculpida"])
    })

    it("nível 4 do catálogo dá talento ou melhoria (sem o número fixo do wizard antigo)", async () => {
        const f = await fixture()
        const id = await wizardSheet(f, 3, [], { subclassRef: f.subclassId })
        const options = await buildLevelUpOptions(id)
        expect(options.feat).toMatchObject({ kind: "general", cap: 20 })
        expect(options.feat!.options.map((feat) => feat.name)).toEqual(["Atlético", "Aumento no Valor de Atributo"])
    })

    it("classe sem conjuração pula a etapa de magias; o estilo de luta não reaparece", async () => {
        const f = await fixture()
        const id = await wizardSheet(f, 1, [], { classRef: f.fighterId, class: mention(f.fighterId, "Guerreiro", "Classe"), spellSlots: {}, classFeatures: mention(f.traits.estilo, "Estilo de Luta") })
        const options = await buildLevelUpOptions(id)
        expect(options.spells).toBeNull()
        expect(options.feat).toBeNull()
        expect(options.traits.map((trait) => trait.label)).toEqual(["Surto de Ação"])
        expect(options.resources).toEqual([{ name: "Surto de Ação", before: null, after: 1 }])
    })

    it("a troca de magia só aparece com a decisão do Maddox (traço de conjuração)", async () => {
        const f = await fixture()
        const id = await wizardSheet(f, 1, ["luz", "raio", "maos", "escudo"])
        const resolveSpellSwap = vi.fn(async () => ({ allowed: true, source: "Conjuração: “pode substituir uma magia”" }))
        const options = await buildLevelUpOptions(id, { resolveSpellSwap })
        expect(resolveSpellSwap).toHaveBeenCalledWith(expect.objectContaining({ className: "Mago", traits: [expect.objectContaining({ label: "Conjuração", text: expect.stringContaining("substituir uma magia") })] }))
        expect(options.spells!.swap).toEqual({ allowed: true, source: "Conjuração: “pode substituir uma magia”" })
    })
})

describe("aplicar a subida", () => {
    it("PV pela média, magia nova e traço: grava tudo, mantém o PV atual e audita", async () => {
        const f = await fixture()
        const id = await wizardSheet(f, 1, ["luz", "raio", "maos", "escudo", "misseis", "sono", "armadura"])
        const { gains } = await applyLevelUp(id, { targetLevel: 2, hp: { method: "average" }, spells: [String(f.spells.detectar)] }, { userId: "dono", by: "player" })
        expect(gains).toMatchObject({ fromLevel: 1, toLevel: 2, hp: { method: "average", gain: 5, hpMax: 13 }, traits: ["Erudito"], spells: ["Detectar Magia"] })
        const sheet = await CharacterSheet.findById(id).lean()
        expect(sheet).toMatchObject({ level: 2, hpMax: 13, hpCurrent: 5 })
        expect(sheet!.spellSlots).toEqual({ "1": { total: 3, used: 1 } })
        expect(sheet!.classFeatures).toContain("Erudito")
        expect(await CharacterSpell.countDocuments({ sheetId: id, catalogSpellId: f.spells.detectar })).toBe(1)
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "FichaPersonagem", entidadeId: id, acao: "ATUALIZAR" }))
        expect(sheetPusher.publishSheetPatched).toHaveBeenCalled()
    })

    it("traços entram um por parágrafo, sem repetir o que a ficha já cita (sem DOM, no servidor)", async () => {
        const f = await fixture()
        const known = ["luz", "raio", "maos", "escudo", "misseis", "sono", "armadura"] as const
        const notes = `<p>Anotações do jogador.</p>${mention(f.traits.conj, "Conjuração")}`
        const fresh = await wizardSheet(f, 1, [...known], { classFeatures: notes })
        await applyLevelUp(fresh, { targetLevel: 2, hp: { method: "average" }, spells: [String(f.spells.detectar)] }, { userId: "dono", by: "player" })
        expect((await CharacterSheet.findById(fresh).lean())!.classFeatures).toBe(`${notes}${mention(f.traits.sabio, "Erudito")}`)

        const already = await wizardSheet(f, 1, [...known], { classFeatures: `${notes}${mention(f.traits.sabio, "Erudito")}` })
        await applyLevelUp(already, { targetLevel: 2, hp: { method: "average" }, spells: [String(f.spells.detectar)] }, { userId: "dono", by: "player" })
        const html = (await CharacterSheet.findById(already).lean())!.classFeatures as string
        expect(html.split(`data-id="${String(f.traits.sabio)}"`)).toHaveLength(2)
    })

    it("recusa quantidade errada, magia fora da lista e nível que não é o próximo", async () => {
        const f = await fixture()
        const id = await wizardSheet(f, 1, ["luz", "raio", "maos", "escudo", "misseis", "sono", "armadura"])
        await expect(applyLevelUp(id, { targetLevel: 2, hp: { method: "average" }, spells: [] }, { userId: "dono", by: "player" })).rejects.toThrow("Escolha 1 magia(s) nova(s).")
        await expect(applyLevelUp(id, { targetLevel: 2, hp: { method: "average" }, spells: [String(f.spells.cura)] }, { userId: "dono", by: "player" })).rejects.toThrow("não está na lista da classe")
        await expect(applyLevelUp(id, { targetLevel: 3, hp: { method: "average" }, spells: [String(f.spells.detectar)] }, { userId: "dono", by: "player" })).rejects.toMatchObject({ status: 409 })
        expect((await CharacterSheet.findById(id).lean())!.level).toBe(1)
    })

    it("exige a subclasse no nível dela e grava a menção e a referência", async () => {
        const f = await fixture()
        const id = await wizardSheet(f, 2, [], { hpMax: 14 })
        await expect(applyLevelUp(id, { targetLevel: 3, hp: { method: "average" }, cantrips: [], spells: [] }, { userId: "dono", by: "player" })).rejects.toThrow("Escolha uma subclasse para confirmar o nível 3.")
        const cantrips = [String(f.spells.luz), String(f.spells.raio), String(f.spells.maos)]
        const spells = [String(f.spells.escudo), String(f.spells.misseis), String(f.spells.sono), String(f.spells.armadura), String(f.spells.detectar)]
        // A tabela pede 6 magias, mas a lista da classe só tem 5 até o 2º círculo: o limite é o que existe.
        const { gains } = await applyLevelUp(id, { targetLevel: 3, hp: { method: "average" }, subclassId: String(f.subclassId), cantrips, spells }, { userId: "dono", by: "player" })
        expect(gains).toMatchObject({ subclass: "Evocador", traits: ["Subclasse de Mago", "Evocação Esculpida"] })
        const sheet = await CharacterSheet.findById(id).lean()
        expect(String(sheet!.subclassRef)).toBe(String(f.subclassId))
        expect(sheet!.subclass).toContain(`subclass:${String(f.wizardId)}:${String(f.subclassId)}`)
    })

    it("melhoria de atributo: +2 aplicado; acima do teto é recusado; CON maior sobe o PV dos níveis", async () => {
        const f = await fixture()
        const id = await wizardSheet(f, 3, [], { subclassRef: f.subclassId, hpMax: 20, intelligence: 19, constitution: 15 })
        const base = { targetLevel: 4, hp: { method: "average" as const }, cantrips: [String(f.spells.luz), String(f.spells.raio), String(f.spells.maos), String(f.spells.chama)].slice(0, 4) }
        await expect(applyLevelUp(id, { ...base, feat: { id: String(f.asiFeat), attributes: { intelligence: 2 } } }, { userId: "dono", by: "player" })).rejects.toThrow()
        const options = await buildLevelUpOptions(id)
        const cantrips = options.spells!.cantripOptions.slice(0, options.spells!.cantrips).map((spell) => spell.id)
        const spells = options.spells!.spellOptions.slice(0, options.spells!.spells).map((spell) => spell.id)
        await expect(applyLevelUp(id, { targetLevel: 4, hp: { method: "average" }, cantrips, spells, feat: { id: String(f.asiFeat), attributes: { intelligence: 2 } } }, { userId: "dono", by: "player" })).rejects.toThrow("passaria do máximo (20)")
        const { gains } = await applyLevelUp(id, { targetLevel: 4, hp: { method: "average" }, cantrips, spells, feat: { id: String(f.asiFeat), attributes: { intelligence: 1, constitution: 1 } } }, { userId: "dono", by: "player" })
        expect(gains.feat).toEqual({ name: "Aumento no Valor de Atributo", attributes: { intelligence: 1, constitution: 1 } })
        const sheet = await CharacterSheet.findById(id).lean()
        // Média do d6 (3) + CON (+2) = 5; CON 15→16 sobe o modificador de 2 para 3: +1 por nível (4).
        expect(sheet).toMatchObject({ level: 4, intelligence: 20, constitution: 16, hpMax: 20 + 5 + 4 })
        expect(sheet!.featuresNotes).toContain("Aumento no Valor de Atributo")
    })

    it("truque de dano novo ganha o ataque automático", async () => {
        const f = await fixture()
        const id = await wizardSheet(f, 3, ["luz", "maos"], { subclassRef: f.subclassId })
        const options = await buildLevelUpOptions(id)
        const cantrips = [String(f.spells.raio), ...options.spells!.cantripOptions.filter((spell) => spell.id !== String(f.spells.raio)).slice(0, options.spells!.cantrips - 1).map((spell) => spell.id)]
        const spells = options.spells!.spellOptions.slice(0, options.spells!.spells).map((spell) => spell.id)
        await applyLevelUp(id, { targetLevel: 4, hp: { method: "average" }, cantrips, spells, feat: { id: String(f.toughFeat), attributes: { dexterity: 1 } } }, { userId: "dono", by: "player" })
        expect(await CharacterAttack.countDocuments({ sheetId: id, notes: `auto:spell:${String(f.spells.raio)}` })).toBe(1)
    })

    it("rolagem: o jogador manda o dado (1 a lados); o Opex rola no servidor", async () => {
        const f = await fixture()
        const id = await wizardSheet(f, 1, ["luz", "raio", "maos", "escudo", "misseis", "sono", "armadura"])
        const spells = [String(f.spells.detectar)]
        await expect(applyLevelUp(id, { targetLevel: 2, hp: { method: "roll" }, spells }, { userId: "dono", by: "player" })).rejects.toThrow("entre 1 e 6")
        await expect(applyLevelUp(id, { targetLevel: 2, hp: { method: "roll", die: 7 }, spells }, { userId: "dono", by: "player" })).rejects.toBeInstanceOf(LevelUpError)
        const rollDie = vi.fn(() => 1)
        const { gains } = await applyLevelUp(id, { targetLevel: 2, hp: { method: "roll" }, spells }, { userId: "dono", by: "opex" }, { rollDie })
        expect(rollDie).toHaveBeenCalledWith(6)
        expect(gains.hp).toEqual({ method: "roll", gain: 3, die: 1, hpMax: 11 })
    })

    it("troca uma magia conhecida quando o Maddox permite", async () => {
        const f = await fixture()
        const id = await wizardSheet(f, 1, ["luz", "raio", "maos", "escudo", "misseis", "sono", "armadura"])
        const resolveSpellSwap = async () => ({ allowed: true, source: "Conjuração" })
        const escudo = await CharacterSpell.findOne({ sheetId: id, catalogSpellId: f.spells.escudo }).lean()
        await expect(applyLevelUp(id, { targetLevel: 2, hp: { method: "average" }, spells: [String(f.spells.detectar)], swap: { remove: String(escudo!._id), add: String(f.spells.detectar) } }, { userId: "dono", by: "player" }, { resolveSpellSwap })).rejects.toThrow("não repetir uma escolha")
        await expect(applyLevelUp(id, { targetLevel: 2, hp: { method: "average" }, spells: [String(f.spells.detectar)], swap: { remove: String(escudo!._id), add: String(f.spells.detectar) } }, { userId: "dono", by: "player" })).rejects.toThrow("não troca magias")
    })
})
