import type { AttributeType } from "@/features/character-sheets/types/character-sheet.types"
import { MADDOX_ABILITIES } from "../check-modifier"
import { abilityModifier, averageOf, formatDiceExpression, parseDiceExpression } from "../combat-rules"
import { plainText } from "../combat-options"
import type { MonsterActionStat, MonsterStats } from "../combat-types"

/**
 * Bloco de estatísticas dos adversários do combate tático (Maddox 7) — SOMENTE servidor. No Fiel ao D&D vem do
 * catálogo de Monstros (PV pela média do `hitPointsFormula`, CA pelo primeiro número, salvaguardas pelos atributos e
 * a proficiência do ND, ações com `attackRoll`/`hitRoll`); no Rigoroso também pode vir de um bloco próprio do Maddox.
 */

/** Tipos de dano do catálogo de Monstros (inglês) → os nomes usados nas armas e nos ataques (pt-BR). */
const DAMAGE_KEY_LABELS: Record<string, string[]> = {
    acid: ["ácido"],
    cold: ["frio"],
    fire: ["fogo"],
    force: ["força"],
    lightning: ["relâmpago", "elétrico"],
    necrotic: ["necrótico"],
    poison: ["veneno"],
    psychic: ["psíquico"],
    radiant: ["radiante"],
    thunder: ["trovão", "trovejante"],
    physical: ["cortante", "perfurante", "concussão", "contundente"],
}

export const damageLabels = (keys: readonly string[] | undefined) => (keys ?? []).flatMap((key) => DAMAGE_KEY_LABELS[key] ?? [key])

const DAMAGE_WORDS = ["cortante", "perfurante", "concussão", "contundente", "ácido", "fogo", "frio", "relâmpago", "elétrico", "trovão", "trovejante", "veneno", "psíquico", "radiante", "necrótico", "força"]

const fold = (value: string) =>
    value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()

/** "2d8 + 10 cortante + 2d8 fogo" → dados somados e o primeiro tipo ("2d8+2d8+10" → "4d8+10", "cortante"). */
export function parseHitRoll(raw: string | null | undefined): { damage: string | null; damageType: string | null } {
    const text = (raw ?? "").trim()
    if (!text) return { damage: null, damageType: null }
    const words = fold(text)
    const type = DAMAGE_WORDS.find((word) => words.includes(fold(word))) ?? null
    const tokens = [...text.matchAll(/([+-]?)\s*(\d+\s*d\s*\d+|\d+)/gi)].map((match, index) => `${index === 0 ? (match[1] === "-" ? "-" : "") : match[1] || "+"}${match[2]!.replace(/\s+/g, "").toLowerCase()}`)
    const expression = tokens.length ? parseDiceExpression(tokens.join("")) : null
    return { damage: expression ? formatDiceExpression(expression) : null, damageType: type }
}

const NUMBER_WORDS: Record<string, number> = { dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5 }
const ABILITY_WORDS: Record<string, AttributeType> = { forca: "strength", destreza: "dexterity", constituicao: "constitution", inteligencia: "intelligence", sabedoria: "wisdom", carisma: "charisma" }

export function abilityFromWord(word: string): AttributeType | null {
    return ABILITY_WORDS[fold(word).trim()] ?? (MADDOX_ABILITIES.includes(word as AttributeType) ? (word as AttributeType) : null)
}

interface CatalogParam {
    label: string
    description: string
    attackRoll?: number | null
    hitRoll?: string | null
    recharge?: string | null
}

/** Ação do bloco do catálogo → ataque (com `attackRoll`), salvaguarda ("Salvaguarda de Destreza CD 15") ou outra. */
export function monsterActionFromCatalog(param: CatalogParam, economy: MonsterActionStat["economy"]): MonsterActionStat {
    const description = plainText(param.description ?? "")
    const folded = fold(description)
    const { damage, damageType } = parseHitRoll(param.hitRoll)
    const save = folded.match(/salvaguarda de (forca|destreza|constituicao|inteligencia|sabedoria|carisma)[^.]{0,40}?cd (\d+)/)
    const recharge = param.recharge?.trim() || fold(param.label).match(/recarga (\d(?:-\d)?)/)?.[1] || null
    const base = { name: param.label.replace(/\s*\(recarga[^)]*\)/i, "").trim() || param.label, damage, damageType, recharge, available: true, economy, description }
    if (typeof param.attackRoll === "number" && !save) {
        return { ...base, kind: "attack", bonus: param.attackRoll, dc: null, ability: null, halfOnSave: false, ranged: /a distancia|\brw\b/.test(folded) && !/corpo a corpo|\bmw\b/.test(folded) }
    }
    if (save) return { ...base, kind: "save", bonus: null, dc: Number(save[2]), ability: ABILITY_WORDS[save[1]!]!, halfOnSave: /metade do dano/.test(folded), ranged: true }
    return { ...base, kind: "other", bonus: null, dc: null, ability: null, halfOnSave: false, ranged: false }
}

/** "realiza três ataques" → 3 (Ataques Múltiplos); sem a ação = 1. */
export function multiattackOf(params: readonly CatalogParam[]): number {
    const multi = params.find((param) => /ataques? m[uú]ltiplos|multiataque/i.test(param.label))
    if (!multi) return 1
    const word = fold(plainText(multi.description)).match(/\b(dois|duas|tres|quatro|cinco|\d)\b[^.]{0,30}ataques?/)?.[1]
    const count = word ? (NUMBER_WORDS[word] ?? Number(word)) : 2
    return Math.max(2, Math.min(5, Number.isFinite(count) ? count : 2))
}

export interface CatalogMonsterDoc {
    _id: unknown
    name: string
    armorClass: string | number
    hitPointsFormula: string
    initiative?: number | null
    attributes: Record<AttributeType, number>
    savingThrows?: Partial<Record<AttributeType, { proficient?: boolean; override?: number }>>
    challengeRating?: string
    proficiencyBonusOverride?: number | null
    damageResistances?: string[]
    damageImmunities?: string[]
    damageVulnerabilities?: string[]
    conditionImmunities?: string[]
    actions?: CatalogParam[]
    bonusActions?: CatalogParam[]
    reactions?: CatalogParam[]
}

const crProficiency = (cr: string | undefined) => {
    const value = cr?.includes("/") ? 0 : Number(cr ?? 0)
    return value >= 29 ? 9 : value >= 25 ? 8 : value >= 21 ? 7 : value >= 17 ? 6 : value >= 13 ? 5 : value >= 9 ? 4 : value >= 5 ? 3 : 2
}

export function monsterStatsFromCatalog(doc: CatalogMonsterDoc): MonsterStats {
    const attributes: Record<AttributeType, number> = Object.assign({ strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 }, doc.attributes ?? {})
    const prof = doc.proficiencyBonusOverride ?? crProficiency(doc.challengeRating)
    const saves = Object.fromEntries(
        MADDOX_ABILITIES.map((ability) => {
            const state = doc.savingThrows?.[ability]
            const value = typeof state?.override === "number" ? state.override : abilityModifier(attributes[ability]) + (state?.proficient ? prof : 0)
            return [ability, value]
        }),
    ) as Record<AttributeType, number>
    const hpExpression = parseDiceExpression(String(doc.hitPointsFormula ?? "").replace(/\s+/g, ""))
    const hpMax = Math.max(1, hpExpression ? averageOf(hpExpression) : Number.parseInt(String(doc.hitPointsFormula), 10) || 1)
    const ac = Math.max(1, Number.parseInt(String(doc.armorClass ?? "10"), 10) || 10)
    const actions = [
        ...(doc.actions ?? []).filter((param) => !/ataques? m[uú]ltiplos|multiataque/i.test(param.label)).map((param) => monsterActionFromCatalog(param, "action")),
        ...(doc.bonusActions ?? []).map((param) => monsterActionFromCatalog(param, "bonus")),
        ...(doc.reactions ?? []).map((param) => monsterActionFromCatalog(param, "reaction")),
    ]
    return {
        source: "catalog",
        monsterId: String(doc._id),
        ac,
        hpMax,
        hp: hpMax,
        tempHp: 0,
        initiativeBonus: typeof doc.initiative === "number" ? doc.initiative : abilityModifier(attributes.dexterity),
        dexterity: attributes.dexterity,
        saves,
        resistances: damageLabels(doc.damageResistances),
        immunities: damageLabels(doc.damageImmunities),
        vulnerabilities: damageLabels(doc.damageVulnerabilities),
        conditionImmunities: doc.conditionImmunities ?? [],
        actions,
        multiattack: multiattackOf(doc.actions ?? []),
    }
}

/** Bloco próprio informado pelo Maddox (Rigoroso). */
export interface CustomMonsterInput {
    ca: number
    pv: number
    iniciativa?: number
    destreza?: number
    salvaguardas?: Partial<Record<AttributeType, number>>
    resistencias?: string[]
    imunidades?: string[]
    vulnerabilidades?: string[]
    ataquesMultiplos?: number
    acoes: { nome: string; tipo: "ataque" | "salvaguarda" | "outro"; bonus?: number; cd?: number; atributo?: string; dano?: string; tipoDano?: string; metadeNoSucesso?: boolean; distancia?: boolean; recarga?: string; economia?: "acao" | "bonus" | "reacao" }[]
}

export function monsterStatsFromCustom(input: CustomMonsterInput): MonsterStats {
    const dexterity = input.destreza ?? 10
    const saves = Object.fromEntries(MADDOX_ABILITIES.map((ability) => [ability, input.salvaguardas?.[ability] ?? (ability === "dexterity" ? abilityModifier(dexterity) : 0)])) as Record<AttributeType, number>
    return {
        source: "custom",
        monsterId: null,
        ac: Math.max(1, Math.round(input.ca)),
        hpMax: Math.max(1, Math.round(input.pv)),
        hp: Math.max(1, Math.round(input.pv)),
        tempHp: 0,
        initiativeBonus: input.iniciativa ?? abilityModifier(dexterity),
        dexterity,
        saves,
        resistances: input.resistencias ?? [],
        immunities: input.imunidades ?? [],
        vulnerabilities: input.vulnerabilidades ?? [],
        conditionImmunities: [],
        multiattack: Math.max(1, Math.min(5, input.ataquesMultiplos ?? 1)),
        actions: input.acoes.map((action) => {
            const expression = parseDiceExpression(action.dano ?? "")
            return {
                name: action.nome.trim(),
                kind: action.tipo === "ataque" ? "attack" : action.tipo === "salvaguarda" ? "save" : "other",
                bonus: action.tipo === "ataque" ? (action.bonus ?? 0) : null,
                dc: action.tipo === "salvaguarda" ? (action.cd ?? 10) : null,
                ability: action.tipo === "salvaguarda" ? (abilityFromWord(action.atributo ?? "") ?? "dexterity") : null,
                damage: expression ? formatDiceExpression(expression) : null,
                damageType: action.tipoDano?.trim() || null,
                halfOnSave: Boolean(action.metadeNoSucesso),
                ranged: Boolean(action.distancia),
                recharge: action.recarga?.trim() || null,
                available: true,
                economy: action.economia === "bonus" ? "bonus" : action.economia === "reacao" ? "reaction" : "action",
                description: "",
            } satisfies MonsterActionStat
        }),
    }
}

/** Recarga "5-6" ou "6": o d6 rolado recarrega a ação? */
export function rechargeHit(recharge: string, d6: number): boolean {
    const match = recharge.match(/(\d)(?:\s*-\s*(\d))?/)
    if (!match) return true
    const min = Number(match[1])
    return d6 >= min
}

/** Monstro ATIVO do catálogo pelo id ou pelo nome (sem acento e caixa); sem ele, sugestões pelo começo do nome. */
export async function findCatalogMonster(ref: string): Promise<{ doc: CatalogMonsterDoc | null; suggestions: string[] }> {
    const { MonsterModel } = await import("@/features/monsters/models/monster")
    const value = ref.trim()
    if (/^[a-f0-9]{24}$/i.test(value)) {
        const byId = await MonsterModel.findOne({ _id: value, status: "active" }).lean<CatalogMonsterDoc>()
        if (byId) return { doc: byId, suggestions: [] }
    }
    const wanted = fold(value).trim()
    const all = await MonsterModel.find({ status: "active" }).select("_id name originalName").lean<{ _id: unknown; name: string; originalName?: string }[]>()
    const hit = all.find((doc) => fold(doc.name).trim() === wanted || (doc.originalName && fold(doc.originalName).trim() === wanted))
    if (hit) return { doc: await MonsterModel.findById(hit._id).lean<CatalogMonsterDoc>(), suggestions: [] }
    const first = wanted.split(/\s+/)[0] ?? ""
    const suggestions = first.length >= 3 ? all.filter((doc) => fold(doc.name).includes(first)).map((doc) => doc.name).slice(0, 10) : []
    return { doc: null, suggestions }
}
