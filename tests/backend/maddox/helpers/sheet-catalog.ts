import mongoose from "mongoose"
import type { IMaddoxCharacterBuild } from "@/features/maddox/models"

/**
 * Catálogo mínimo (raça, classes, origem, talentos, itens, magias e traços com cargas) para os testes da ficha montada
 * na entrevista do Maddox, gravado direto nas coleções do MongoDB em memória do teste.
 */

const oid = () => new mongoose.Types.ObjectId()
const mention = (id: mongoose.Types.ObjectId | string, type: string, label: string) => `<span data-type="mention" data-id="${String(id)}" data-entity-type="${type}" class="mention">${label}</span>`

export async function seedSheetCatalog() {
    const db = mongoose.connection.db!
    const ids = {
        trait: { style: oid(), secondWind: oid(), actionSurge: oid(), subclass: oid(), asi: oid(), critical: oid(), versatile: oid(), ritual: oid() },
        race: oid(),
        fighter: oid(),
        wizard: oid(),
        champion: oid(),
        evoker: oid(),
        soldier: oid(),
        feats: { savage: oid(), defense: oid(), asi: oid(), athlete: oid(), boon: oid() },
        items: { sword: oid(), mail: oid(), shield: oid(), pack: oid() },
        spells: { fireBolt: oid(), light: oid(), missile: oid(), shield: oid(), fireball: oid() },
    }
    await db.collection("traits").insertMany([
        { _id: ids.trait.secondWind, name: "Sopro Revigorante", description: "Recupera fôlego.", status: "active", charges: { mode: "byLevel", values: [{ level: 1, value: "2" }, { level: 4, value: "3" }] } },
        { _id: ids.trait.style, name: "Estilo de Luta (Guerreiro)", description: "Estilo.", status: "active" },
        { _id: ids.trait.actionSurge, name: "Surto de Ação", description: "Ação extra.", status: "active", charges: { mode: "fixed", value: "1" } },
    ])
    await db.collection("races").insertOne({
        _id: ids.race,
        name: "Humano",
        originalName: "Human",
        description: "<p>Versáteis.</p>",
        size: "Médio",
        speed: "9 metros",
        status: "active",
        traits: [{ name: "Versátil", description: mention(ids.trait.versatile, "Habilidade", "Versátil") }],
    })
    await db.collection("characterclasses").insertMany([
        {
            _id: ids.fighter,
            name: "Guerreiro",
            originalName: "Fighter",
            description: "<p>Mestre das armas.</p>",
            status: "active",
            hitDice: "d10",
            primaryAttributes: ["Força"],
            savingThrows: ["Força", "Constituição"],
            armorProficiencies: ["Armaduras Leves", "Armaduras Médias", "Armaduras Pesadas", "Escudos"],
            weaponProficiencies: ["Armas Simples", "Armas Marciais"],
            skillCount: 2,
            availableSkills: ["Acrobacia", "Atletismo", "Intimidação", "Percepção", "Sobrevivência"],
            spellcasting: false,
            subclasses: [{ _id: ids.champion, name: "Campeão", spellcasting: false, traits: [{ level: 3, description: mention(ids.trait.critical, "Habilidade", "Crítico Aprimorado") }] }],
            traits: [
                { level: 1, description: mention(ids.trait.style, "Habilidade", "Estilo de Luta (Guerreiro)") },
                { level: 1, description: mention(ids.trait.secondWind, "Habilidade", "Sopro Revigorante") },
                { level: 2, description: mention(ids.trait.actionSurge, "Habilidade", "Surto de Ação") },
                { level: 3, description: mention(ids.trait.subclass, "Habilidade", "Subclasse de Guerreiro") },
                { level: 4, description: mention(ids.trait.asi, "Habilidade", "Melhoria de Atributo (Guerreiro)") },
            ],
        },
        {
            _id: ids.wizard,
            name: "Mago",
            originalName: "Wizard",
            description: "<p>Estudioso.</p>",
            status: "active",
            hitDice: "d6",
            primaryAttributes: ["Inteligência"],
            savingThrows: ["Inteligência", "Sabedoria"],
            armorProficiencies: [],
            weaponProficiencies: ["Armas Simples"],
            skillCount: 2,
            availableSkills: ["Arcanismo", "História", "Investigação", "Medicina"],
            spellcasting: true,
            spellcastingAttribute: "Inteligência",
            spells: [
                { id: String(ids.spells.fireBolt), name: "Raio de Fogo", circle: 0 },
                { id: String(ids.spells.light), name: "Luz", circle: 0 },
                { id: String(ids.spells.missile), name: "Mísseis Mágicos", circle: 1 },
                { id: String(ids.spells.shield), name: "Escudo Arcano", circle: 1 },
                { id: String(ids.spells.fireball), name: "Bola de Fogo", circle: 3 },
            ],
            subclasses: [{ _id: ids.evoker, name: "Evocador", spellcasting: false, traits: [] }],
            traits: [
                { level: 1, description: mention(ids.trait.ritual, "Habilidade", "Adepto de Ritual") },
                { level: 3, description: mention(oid(), "Habilidade", "Subclasse de Mago") },
                { level: 4, description: mention(oid(), "Habilidade", "Aumento de Atributo (Mago)") },
            ],
            progressionTable: { spellSlots: { 1: { cantrips: 2, preparedSpells: 2, slots: { 1: 2 } }, 2: { cantrips: 2, preparedSpells: 3, slots: { 1: 3 } } } },
        },
    ])
    await db.collection("feats").insertMany([
        { _id: ids.feats.savage, name: "Atacante Selvagem", level: 1, category: "Origem", attributeBonuses: [], status: "active", description: "Rola dano duas vezes." },
        { _id: ids.feats.defense, name: "Defesa", level: 1, category: "Estilo de Luta", attributeBonuses: [], status: "active", description: "+1 CA." },
        { _id: ids.feats.asi, name: "Aperfeiçoamento da pontuação de atributo", level: 4, category: "Geral", attributeBonuses: [], status: "active", description: "+2." },
        { _id: ids.feats.athlete, name: "Atleta", level: 4, category: "Geral", attributeBonuses: [{ attribute: "Força", value: 1 }, { attribute: "Destreza", value: 1 }], status: "active", description: "Escala." },
        { _id: ids.feats.boon, name: "Dádiva do Destino", level: 19, category: "Dádiva Épica", attributeBonuses: [{ attribute: "Força", value: 1 }], status: "active", description: "Épico." },
    ])
    // Origem Soldado: reaproveita a que o teste já tiver gravado (só liga o talento de origem).
    const existing = await db.collection("backgrounds").findOne({ name: "Soldado" })
    if (existing) {
        ids.soldier = existing._id as mongoose.Types.ObjectId
        await db.collection("backgrounds").updateOne({ _id: existing._id }, { $set: { featId: String(ids.feats.savage), skillProficiencies: ["Atletismo", "Intimidação"] } })
    } else {
        await db.collection("backgrounds").insertOne({
            _id: ids.soldier,
            name: "Soldado",
            originalName: "Soldier",
            description: "<p>Treino militar.</p>",
            source: "LDJ",
            status: "active",
            skillProficiencies: ["Atletismo", "Intimidação"],
            suggestedAttributes: ["Força", "Destreza", "Constituição"],
            featId: String(ids.feats.savage),
            equipment: "",
            traits: [],
        })
    }
    await db.collection("items").insertMany([
        { _id: ids.items.sword, name: "Espada longa", type: "arma", status: "active", description: "Lâmina.", price: "15 po", damageDice: { quantidade: 1, tipo: "d8" }, damageType: "cortante", properties: [{ description: "Versátil (1d10)" }] },
        { _id: ids.items.mail, name: "Cota de malha", type: "armadura", status: "active", description: "Pesada.", ac: 16, acType: "base", armorType: "pesada" },
        { _id: ids.items.shield, name: "Escudo", type: "escudo", status: "active", description: "Proteção.", ac: 2, acType: "bonus" },
        { _id: ids.items.pack, name: "Pacote de Aventureiro", type: "qualquer", status: "active", description: "Itens.", charges: { mode: "fixed", value: "10" } },
    ])
    await db.collection("spells").insertMany([
        { _id: ids.spells.fireBolt, name: "Raio de Fogo", circle: 0, school: "Evocação", status: "active", description: "Fogo.", component: ["Verbal", "Somático"], castingTime: "Ação", range: "36 metros", baseDice: { quantidade: 1, tipo: "d10" } },
        { _id: ids.spells.light, name: "Luz", circle: 0, school: "Evocação", status: "active", description: "Luz.", component: ["Verbal", "Material"] },
        { _id: ids.spells.missile, name: "Mísseis Mágicos", circle: 1, school: "Evocação", status: "active", description: "Dardos.", component: ["Verbal", "Somático"] },
        { _id: ids.spells.shield, name: "Escudo Arcano", circle: 1, school: "Abjuração", status: "active", description: "+5 CA.", component: ["Verbal", "Somático"] },
        { _id: ids.spells.fireball, name: "Bola de Fogo", circle: 3, school: "Evocação", status: "active", description: "Explosão.", component: ["Verbal", "Somático", "Material"] },
    ])
    return ids
}

export async function clearSheetCatalog() {
    const db = mongoose.connection.db!
    await Promise.all(["traits", "races", "characterclasses", "feats", "backgrounds", "items", "spells"].map((name) => db.collection(name).deleteMany({})))
}

export type SheetCatalogIds = Awaited<ReturnType<typeof seedSheetCatalog>>

/** Guerreiro humano soldado de nível 1, completo (para testes que só precisam concluir a entrevista). */
export function fighterBuild(ids: SheetCatalogIds, over: Partial<IMaddoxCharacterBuild> = {}): IMaddoxCharacterBuild {
    return {
        level: 1,
        race: { id: String(ids.race), name: "Humano" },
        class: { id: String(ids.fighter), name: "Guerreiro" },
        subclass: null,
        origin: { id: String(ids.soldier), name: "Soldado" },
        classSkills: ["Percepção", "Sobrevivência"],
        expertise: [],
        fightingStyle: { id: String(ids.feats.defense), name: "Defesa" },
        feats: [],
        cantrips: [],
        spells: [],
        equipment: [
            { id: String(ids.items.sword), name: "Espada longa", quantity: 1, equipped: true },
            { id: String(ids.items.mail), name: "Cota de malha", quantity: 1, equipped: true },
        ],
        coins: { cp: 0, sp: 0, ep: 0, gp: 15, pp: 0 },
        languages: ["Comum", "Anão"],
        tools: [],
        ...over,
    }
}

/** Grava as escolhas na entrevista de personagem (como se o Maddox tivesse gravado pela ferramenta). */
export async function setInterviewBuild(filter: Record<string, unknown>, build: IMaddoxCharacterBuild) {
    await mongoose.connection.db!.collection("maddox_interviews").updateOne({ kind: "character", ...filter }, { $set: { build } })
}
