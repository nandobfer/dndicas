import type { AttributeType } from "@/features/character-sheets/types/character-sheet.types"
import { getCantripDamageDiceQuantity } from "@/features/character-sheets/utils/sheet-rules"
import {
    MADDOX_STANDARD_ACTION_DEFS,
    MADDOX_STANDARD_ACTIONS,
    type MaddoxCombatCost,
    type MaddoxCombatResolution,
    type MaddoxReactionTrigger,
    type MaddoxStandardAction,
} from "./constants"
import { abilityModifier, canAct, type CombatCondition, type CombatEconomy } from "./combat-rules"
import type { MaddoxMasteryKey } from "./weapon-mastery"

/**
 * Opções PURAS do personagem no combate tático (Maddox 7): o que ele PODE usar agora, por Ação, Ação bônus e reação.
 * O servidor monta a lista para o DTO (`me.combat.options`) e revalida a escolha a cada ação; a tela só exibe. Quem
 * não está na lista não pode ser usado: arma não equipada, magia não preparada ou sem espaço, cargas esgotadas, custo de
 * ação diferente, condição que incapacita ou a regra de 2024 de uma magia com espaço por turno.
 */

/** Perfil de uma habilidade, talento ou magia no combate (classificador: texto + JEV, com cache). */
export interface CombatProfile {
    cost: MaddoxCombatCost
    trigger: MaddoxReactionTrigger | null
    resolution: MaddoxCombatResolution | null
    halfOnSave: boolean
}

export interface OptionSheet {
    level: number
    abilities: Record<AttributeType, number>
    proficiencyBonus: number
    spellAttribute: AttributeType | null
    spellSaveDc: number
    spellAttackBonus: number
    spellSlots: Record<string, { total: number; used: number }>
    /** Escudo equipado (DND-41): a arma Versátil não ganha a opção de duas mãos. */
    shieldEquipped?: boolean
}

export interface OptionWeapon {
    /** Id do item na ficha. */
    id: string
    name: string
    quantity: number
    damageDice: { quantidade: number; tipo: string } | null
    damageType: string | null
    /** Nomes das propriedades, em texto puro ("Acuidade", "Leve", "Munição"). */
    properties: string[]
    /** Dado da propriedade Versátil ("Versátil (1d8)"): a opção de duas mãos (DND-41). */
    versatileDice?: { quantidade: number; tipo: string } | null
    /** DND-49: maestria da arma no catálogo, só quando o personagem a domina (`weaponMasteries` da ficha). */
    mastery?: MaddoxMasteryKey | null
}

export interface OptionSpell {
    id: string
    name: string
    circle: number
    prepared: boolean
    castingTime: string
    concentration: boolean
    saveAttribute: AttributeType | null
    baseDice: { quantidade: number; tipo: string } | null
    extraDicePerLevel: { quantidade: number; tipo: string } | null
    damageType: string | null
    description: string
    profile: CombatProfile | null
    /** DND-49: componente Verbal (conjurar revela quem está escondido). */
    verbal?: boolean
}

export interface OptionItem {
    id: string
    name: string
    quantity: number
    consumable: boolean
    effectDice: { quantidade: number; tipo: string } | null
    description: string
}

export interface OptionAbility {
    /** `trait:<id>` ou `feat:<id>`. */
    id: string
    name: string
    description: string
    profile: CombatProfile | null
    charge: { id: string; total: number; used: number } | null
}

export type CombatOptionCategory = "weapons" | "spells" | "items" | "abilities" | "standard" | "other"
export type CombatEconomySlot = "action" | "bonus" | "reaction"
export type CombatOptionTarget = "enemy" | "ally" | "self" | "any" | "none"
export type CombatOptionResolution = MaddoxCombatResolution | "standard" | "free" | "check"

export interface CombatOption {
    /** Estável entre chamadas: `weapon:<id>`, `offhand:<id>`, `unarmed`, `spell:<id>`, `item:<id>:self|ally`, `ability:<id>`, `standard:<ação>`, `free`, `opportunity`, `ready`. */
    id: string
    category: CombatOptionCategory
    economy: CombatEconomySlot
    label: string
    detail: string
    target: CombatOptionTarget
    multiTarget: boolean
    resolution: CombatOptionResolution
    /** `mastery`/`modifier` (DND-49): maestria da arma dominada e o modificador de atributo usado (Garantido, Derrubar). */
    attack?: { bonus: number; damage: string; damageType: string | null; ranged: boolean; light: boolean; finesse?: boolean; riders?: CombatRider[]; mastery?: MaddoxMasteryKey | null; modifier?: number }
    save?: { ability: AttributeType; dc: number; halfOnSave: boolean; damage: string | null; damageType: string | null }
    heal?: { dice: string }
    spell?: { circle: number; levels: number[]; concentration: boolean; verbal?: boolean }
    charges?: { chargeId: string; used: number; total: number }
    /** Ações comuns com teste: perícias que o jogador escolhe. */
    skills?: string[]
    /** Custo não identificado (classificador sem resposta): o Maddox confere como ação livre. */
    uncertain?: boolean
    /** Reação: o gatilho que a abre. */
    trigger?: MaddoxReactionTrigger
    /** DND-41: a opção foi ajustada pelo Maddox (preparação do combate ou pedido de ajuste). */
    adjusted?: { reason: string }
    /** DND-41: opção acrescentada pelo Maddox que gasta um item da ficha (quantidade − 1). */
    consumes?: { itemId: string }
}

/** Dano adicional marcável num ataque (DND-41: "Ataque furtivo (+Xd6)"). */
export interface CombatRider {
    key: "sneak-attack"
    label: string
    /** Dados somados ao dano ("2d6"). */
    dice: string
}

export interface CombatOptionsInput {
    sheet: OptionSheet
    weapons: readonly OptionWeapon[]
    spells: readonly OptionSpell[]
    items: readonly OptionItem[]
    abilities: readonly OptionAbility[]
    economy: CombatEconomy
    conditions: readonly CombatCondition[]
    /** Com 0 PV (morrendo): só o teste contra a morte. */
    dying: boolean
    /** Ação preparada guardada (vira a reação de gatilho "preparada"). */
    ready?: { optionId: string; label: string } | null
    /** DND-41: lista completa para a preparação (cargas, espaços e quantidades esgotados não tiram a opção). */
    ignoreResources?: boolean
}

export interface CombatOptions {
    action: CombatOption[]
    bonus: CombatOption[]
    reactions: CombatOption[]
    /** Ataques por ação Atacar (Ataque Extra). */
    attacksPerAction: number
}

export const plainText = (html: string) =>
    html
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim()

const fold = (value: string) =>
    plainText(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()

const signed = (value: number) => (value >= 0 ? `+${value}` : String(value))
const dice = (value: { quantidade: number; tipo: string } | null, quantity?: number) => (value ? `${quantity ?? value.quantidade}${value.tipo.startsWith("d") ? value.tipo : `d${value.tipo}`}` : "")
const withModifier = (expression: string, modifier: number) => (expression ? `${expression}${modifier ? signed(modifier) : ""}` : String(Math.max(0, modifier)))

// ── Classificação pelo texto ──────────────────────────────────────────────────

/**
 * Custo pelo texto da habilidade ("como uma Ação Bônus", "usa a sua ação", "como Reação, quando for atingido…").
 * `null` = o texto não deixa claro (vai para o JEV, em segundo plano).
 */
export function profileFromText(text: string): CombatProfile | null {
    const value = fold(text)
    if (!value) return null
    // "Sempre que você usar a ação Atacar…" (Ataque Extra, Estilo de Luta): modifica outra ação, não gasta a sua.
    if (/sempre que (voce )?(usa|usar|realiza|realizar|fizer|faz|tomar|toma) (a |sua |a sua )?acao/.test(value)) return { cost: "passive", trigger: null, resolution: null, halfOnSave: false }
    const bonus = /(como|com|usa|usar|usando|gastar|gasta) (uma |a |sua |a sua )?acao bonus/.test(value)
    const reaction = /(como|com|usa|usar|usando|gastar|gasta) (uma |a |sua |a sua )?reacao/.test(value)
    const action = /(como|com|usa|usar|usando|gastar|gasta) (uma |a |sua |a sua )?acao(?! bonus)\b/.test(value) || /\bacao de magia\b/.test(value)
    const trigger = reaction ? reactionTriggerFromText(value) : null
    const halfOnSave = /metade (do|desse|deste|de) dano/.test(value)
    const resolution = resolutionFromText(value)
    if (reaction && !bonus) return { cost: "reaction", trigger, resolution, halfOnSave }
    if (bonus) return { cost: "bonus", trigger: null, resolution, halfOnSave }
    if (action) return { cost: "action", trigger: null, resolution, halfOnSave }
    return null
}

function reactionTriggerFromText(value: string): MaddoxReactionTrigger {
    if (/(atingid|acertad|alvo de uma jogada de ataque|jogada de ataque te atingir)/.test(value)) return "hit"
    if (/(sofre|sofrer|recebe|receber) dano/.test(value)) return "damaged"
    if (/conjur/.test(value)) return "spell"
    if (/(sai|sair|deixa|deixar) (do |o )?(seu )?alcance/.test(value)) return "leave-reach"
    return "other"
}

function resolutionFromText(value: string): MaddoxCombatResolution | null {
    if (/salvaguarda|teste de resistencia/.test(value)) return "save"
    if (/((faca|faz|realize|realiza|fazer|faca) (um|uma) (jogada de )?ataque|ataque (corpo a corpo|a distancia) (de|com) magia)/.test(value)) return "attack"
    if (/(acerta|atinge) automaticamente/.test(value)) return "auto"
    if (/(recupera|recuperam|restaura|cura)[^.]{0,40}pontos de vida/.test(value)) return "heal"
    return null
}

/** Custo pelo tempo de conjuração da magia ("Ação", "Ação Bônus", "Reação", "Ritual" ou o texto livre da ficha). */
export function costFromCastingTime(castingTime: string): MaddoxCombatCost {
    const value = fold(castingTime)
    if (/bonus/.test(value)) return "bonus"
    if (/reacao/.test(value)) return "reaction"
    if (/acao|ritual/.test(value) || !value) return "action"
    return "other"
}

/** Como a magia é resolvida pelo servidor: salvaguarda, ataque, cura, acerto automático ou utilitária (Maddox). */
export function spellResolution(spell: Pick<OptionSpell, "saveAttribute" | "baseDice" | "description" | "profile">): MaddoxCombatResolution {
    const value = fold(spell.description)
    if (spell.saveAttribute) return "save"
    const byText = resolutionFromText(value)
    if (byText && (byText !== "heal" || spell.baseDice) && (byText !== "auto" || spell.baseDice)) return byText
    if (spell.profile?.resolution) return spell.profile.resolution
    return "utility"
}

/** Ataque Extra pelo nome das habilidades: "Ataque Extra" = 2, "Dois Ataques Extras" = 3, "Três Ataques Extras" = 4. */
export function attacksPerAction(abilities: readonly Pick<OptionAbility, "name">[]): number {
    let attacks = 1
    for (const ability of abilities) {
        const name = fold(ability.name)
        if (/tres ataques extras/.test(name)) attacks = Math.max(attacks, 4)
        else if (/dois ataques extras/.test(name)) attacks = Math.max(attacks, 3)
        else if (/ataque extra/.test(name)) attacks = Math.max(attacks, 2)
    }
    return attacks
}

// ── Armas ─────────────────────────────────────────────────────────────────────

/** Nome da propriedade sem o prefixo do catálogo ("Propriedade: Leve" → "leve"). */
const propertyKey = (property: string) => fold(property).replace(/^propriedade\s*:\s*/, "")
const hasProperty = (weapon: OptionWeapon, pattern: RegExp) => weapon.properties.some((property) => pattern.test(propertyKey(property)))
export const isLight = (weapon: OptionWeapon) => hasProperty(weapon, /^leve\b|\blight\b/)
export const isRanged = (weapon: OptionWeapon) => hasProperty(weapon, /municao|ammunition|distancia\b/)
export const isFinesse = (weapon: OptionWeapon) => hasProperty(weapon, /acuidade|finesse/)
export const isThrown = (weapon: OptionWeapon) => hasProperty(weapon, /arremesso|thrown/)
export const isVersatile = (weapon: OptionWeapon) => hasProperty(weapon, /versatil|versatile/)

/**
 * DND-41: propriedades da arma do catálogo. O catálogo grava a propriedade como menção em `description`
 * ("Propriedade: Acuidade / Finesse"), com `name` vazio; o nome vem de um ou de outro, sem o prefixo. O dado da
 * Versátil sai do parêntese ("Versátil (1d8)").
 */
export function weaponProperties(raw: readonly { name?: string | null; description?: string | null }[] | null | undefined): { properties: string[]; versatileDice: { quantidade: number; tipo: string } | null } {
    const properties = (raw ?? [])
        .map((property) => plainText(property.name?.trim() ? property.name : (property.description ?? "")).replace(/^propriedade\s*:\s*/i, "").trim())
        .filter(Boolean)
    let versatileDice: { quantidade: number; tipo: string } | null = null
    for (const property of properties) {
        if (!/versatil|versatile/.test(fold(property))) continue
        const match = /(\d+)\s*d\s*(\d+)/i.exec(property)
        if (match) versatileDice = { quantidade: Number(match[1]), tipo: `d${match[2]}` }
    }
    return { properties, versatileDice }
}

/** Id do item na ficha a partir do id da opção (`weapon:<id>`, `offhand:<id>`, `cleave:<id>`, `weapon:<id>:two-handed`, `weapon:<id>:thrown`). */
export function weaponItemId(optionId: string): string | null {
    const match = /^(?:weapon|offhand|cleave):([^:]+)/.exec(optionId)
    return match ? match[1]! : null
}

/** Modificador do ataque com a arma: Acuidade = o maior entre Força e Destreza; à distância = Destreza; senão Força. */
export function weaponModifier(weapon: OptionWeapon, sheet: OptionSheet): number {
    const str = abilityModifier(sheet.abilities.strength)
    const dex = abilityModifier(sheet.abilities.dexterity)
    if (isFinesse(weapon)) return Math.max(str, dex)
    return isRanged(weapon) ? dex : str
}

type WeaponVariant = "main" | "offhand" | "two-handed" | "thrown"

function weaponOption(weapon: OptionWeapon, sheet: OptionSheet, economy: CombatEconomySlot, variant: WeaponVariant | boolean): CombatOption {
    const kind: WeaponVariant = variant === true ? "offhand" : variant === false ? "main" : variant
    const offhand = kind === "offhand"
    const modifier = weaponModifier(weapon, sheet)
    const bonus = sheet.proficiencyBonus + modifier
    const damageModifier = offhand ? Math.min(0, modifier) : modifier
    const damageDice = kind === "two-handed" && weapon.versatileDice ? weapon.versatileDice : weapon.damageDice
    const damage = withModifier(dice(damageDice), damageModifier)
    const ranged = kind === "thrown" || isRanged(weapon)
    const id = offhand ? `offhand:${weapon.id}` : kind === "main" ? `weapon:${weapon.id}` : `weapon:${weapon.id}:${kind}`
    const label = offhand ? `${weapon.name} (outra mão)` : kind === "two-handed" ? `${weapon.name} (duas mãos)` : kind === "thrown" ? `${weapon.name} (arremesso)` : weapon.name
    return {
        id,
        category: "weapons",
        economy,
        label,
        detail: `${signed(bonus)} para acertar · ${damage}${weapon.damageType ? ` ${weapon.damageType}` : ""}${kind === "thrown" ? " · arremessada" : ranged ? " · à distância" : ""}`,
        target: "enemy",
        multiTarget: false,
        resolution: "attack",
        attack: { bonus, damage, damageType: weapon.damageType, ranged, light: isLight(weapon), finesse: isFinesse(weapon), mastery: weapon.mastery ?? null, modifier },
    }
}

/**
 * DND-49 — ataque extra da propriedade Leve: na Ação bônus, ou, com a Maestria Ágil (Nick) da arma do ataque extra,
 * como parte da ação Atacar (sem gastar a Ação bônus). Uma vez por turno, acertando ou errando o primeiro ataque.
 */
function lightExtraOption(weapon: OptionWeapon, sheet: OptionSheet): CombatOption {
    if (weapon.mastery === "nick") {
        const option = weaponOption(weapon, sheet, "action", true)
        return { ...option, label: `${weapon.name} (outra mão · Maestria Ágil)`, detail: `${option.detail} · parte da ação Atacar, sem gastar a Ação bônus` }
    }
    return weaponOption(weapon, sheet, "bonus", true)
}

/**
 * DND-49 — Maestria Trespassar: depois de acertar um ataque corpo a corpo com a arma, um 2º ataque com a mesma arma
 * contra OUTRO inimigo a até 1,5 m do primeiro (o jogador declara; o Maddox pode recusar pela cena), uma vez por turno.
 * O dano não soma o modificador de atributo, a não ser que seja negativo.
 */
function cleaveOption(weapon: OptionWeapon, sheet: OptionSheet): CombatOption {
    const option = weaponOption(weapon, sheet, "action", true)
    return { ...option, id: `cleave:${weapon.id}`, label: `${weapon.name} (Maestria Trespassar)`, detail: `${option.detail} · outro inimigo a até 1,5 m do primeiro alvo` }
}

function unarmedOption(sheet: OptionSheet): CombatOption {
    const modifier = abilityModifier(sheet.abilities.strength)
    const bonus = sheet.proficiencyBonus + modifier
    const damage = String(Math.max(1, 1 + modifier))
    return {
        id: "unarmed",
        category: "weapons",
        economy: "action",
        label: "Ataque desarmado",
        detail: `${signed(bonus)} para acertar · ${damage} contundente`,
        target: "enemy",
        multiTarget: false,
        resolution: "attack",
        attack: { bonus, damage, damageType: "contundente", ranged: false, light: false },
    }
}

// ── Magias ────────────────────────────────────────────────────────────────────

/** Círculos com espaço livre a partir do círculo da magia. */
export function availableSlotLevels(sheet: OptionSheet, circle: number): number[] {
    return Object.entries(sheet.spellSlots)
        .map(([level, slot]) => ({ level: Number(level), free: (slot?.total ?? 0) - (slot?.used ?? 0) }))
        .filter((slot) => Number.isFinite(slot.level) && slot.level >= Math.max(1, circle) && slot.free > 0)
        .map((slot) => slot.level)
        .sort((a, b) => a - b)
}

/** Dados de dano/cura da magia no círculo `level` (truques escalam com o nível do personagem). */
export function spellDice(spell: Pick<OptionSpell, "circle" | "baseDice" | "extraDicePerLevel">, characterLevel: number, level: number): string {
    if (!spell.baseDice) return ""
    if (spell.circle === 0) return dice(spell.baseDice, getCantripDamageDiceQuantity(spell.baseDice.quantidade, characterLevel))
    const extra = spell.extraDicePerLevel ? Math.max(0, level - spell.circle) : 0
    const base = dice(spell.baseDice)
    if (!extra || !spell.extraDicePerLevel) return base
    const extraDice = dice(spell.extraDicePerLevel, spell.extraDicePerLevel.quantidade * extra)
    return spell.extraDicePerLevel.tipo === spell.baseDice.tipo ? dice(spell.baseDice, spell.baseDice.quantidade + spell.extraDicePerLevel.quantidade * extra) : `${base}+${extraDice}`
}

function spellOption(spell: OptionSpell, sheet: OptionSheet, economy: CombatEconomySlot, levels: number[]): CombatOption {
    const resolution = spellResolution(spell)
    const level = spell.circle === 0 ? 0 : (levels[0] ?? spell.circle)
    const amount = spellDice(spell, sheet.level, level)
    const spellMod = sheet.spellAttribute ? abilityModifier(sheet.abilities[sheet.spellAttribute]) : 0
    const circleLabel = spell.circle === 0 ? "Truque" : `${spell.circle}º círculo`
    const option: CombatOption = {
        id: `spell:${spell.id}`,
        category: "spells",
        economy,
        label: spell.name,
        detail: circleLabel,
        target: resolution === "heal" ? "ally" : resolution === "utility" ? "any" : "enemy",
        multiTarget: resolution === "save",
        resolution,
        spell: { circle: spell.circle, levels: spell.circle === 0 ? [] : levels, concentration: spell.concentration, ...(spell.verbal ? { verbal: true } : {}) },
    }
    if (resolution === "attack") {
        option.attack = { bonus: sheet.spellAttackBonus, damage: amount || "0", damageType: spell.damageType, ranged: true, light: false }
        option.detail = `${circleLabel} · ${signed(sheet.spellAttackBonus)} para acertar${amount ? ` · ${amount}${spell.damageType ? ` ${spell.damageType}` : ""}` : ""}`
    } else if (resolution === "save" && spell.saveAttribute) {
        const halfOnSave = spell.profile?.halfOnSave ?? /metade (do|desse|deste|de) dano/.test(fold(spell.description))
        option.save = { ability: spell.saveAttribute, dc: sheet.spellSaveDc, halfOnSave, damage: amount || null, damageType: spell.damageType }
        option.detail = `${circleLabel} · salvaguarda CD ${sheet.spellSaveDc}${amount ? ` · ${amount}${spell.damageType ? ` ${spell.damageType}` : ""}${halfOnSave ? " (metade no sucesso)" : ""}` : ""}`
    } else if (resolution === "heal") {
        option.heal = { dice: withModifier(amount, spellMod) }
        option.detail = `${circleLabel} · cura ${option.heal.dice}`
    } else if (resolution === "auto") {
        option.attack = { bonus: 0, damage: amount, damageType: spell.damageType, ranged: true, light: false }
        option.detail = `${circleLabel} · acerto automático · ${amount}`
    }
    if (spell.concentration) option.detail += " · Concentração"
    return option
}

// ── Itens e habilidades ───────────────────────────────────────────────────────

const isHealingItem = (item: OptionItem) => Boolean(item.effectDice) && /(cura|curar|pontos de vida|healing)/.test(fold(`${item.name} ${item.description}`))

/** Primeira expressão de dados do texto da habilidade ("1d10 + seu nível" → "1d10"). */
const firstDice = (text: string) => /\b(\d+)\s*d\s*(\d+)\b/i.exec(text)?.slice(1, 3).join("d") ?? null

/**
 * Resolução da habilidade pelo servidor só quando o texto dá os números: cura e acerto automático precisam dos dados;
 * ataque e salvaguarda precisam de bônus/CD que a habilidade não traz. Sem isso, vira utilitária (o Maddox resolve).
 */
function abilityResolution(ability: OptionAbility): Pick<CombatOption, "resolution" | "heal" | "attack"> {
    const resolution = ability.profile?.resolution ?? "utility"
    const amount = firstDice(ability.description)
    if (resolution === "heal" && amount) return { resolution, heal: { dice: amount } }
    if (resolution === "auto" && amount) return { resolution, attack: { bonus: 0, damage: amount, damageType: null, ranged: false, light: false } }
    return { resolution: "utility" }
}

function abilityOption(ability: OptionAbility, economy: CombatEconomySlot): CombatOption {
    return {
        id: `ability:${ability.id}`,
        category: "abilities",
        economy,
        label: ability.name,
        detail: ability.profile ? (ability.charge ? `${ability.charge.total - ability.charge.used}/${ability.charge.total} usos` : "Habilidade") : "Custo não identificado: o Maddox confere",
        target: "any",
        multiTarget: false,
        ...abilityResolution(ability),
        ...(ability.charge ? { charges: { chargeId: ability.charge.id, used: ability.charge.used, total: ability.charge.total } } : {}),
        ...(ability.profile ? {} : { uncertain: true }),
        ...(ability.profile?.trigger ? { trigger: ability.profile.trigger } : {}),
    }
}

const STANDARD_SKILLS: Partial<Record<MaddoxStandardAction, string[]>> = {
    hide: ["Furtividade"],
    influence: ["Enganação", "Intimidação", "Atuação", "Persuasão"],
    search: ["Intuição", "Medicina", "Percepção", "Sobrevivência"],
    study: ["Arcanismo", "História", "Investigação", "Natureza", "Religião"],
}

const STANDARD_TARGETS: Partial<Record<MaddoxStandardAction, CombatOptionTarget>> = { help: "ally", influence: "enemy" }

function standardOptions(): CombatOption[] {
    return MADDOX_STANDARD_ACTIONS.map((key) => ({
        id: `standard:${key}`,
        category: "standard" as const,
        economy: "action" as const,
        label: MADDOX_STANDARD_ACTION_DEFS[key].label,
        detail: MADDOX_STANDARD_ACTION_DEFS[key].detail,
        target: STANDARD_TARGETS[key] ?? "none",
        multiTarget: false,
        resolution: STANDARD_SKILLS[key] ? ("check" as const) : ("standard" as const),
        ...(STANDARD_SKILLS[key] ? { skills: STANDARD_SKILLS[key] } : {}),
    }))
}

const freeOption = (economy: CombatEconomySlot): CombatOption => ({
    id: "free",
    category: "other",
    economy,
    label: "Outra ação",
    detail: "Descreva o que o personagem faz; o Maddox confere se vale pelas regras.",
    target: "none",
    multiTarget: false,
    resolution: "free",
})

const hasCharges = (ability: OptionAbility) => !ability.charge || ability.charge.used < ability.charge.total

/** O que o personagem pode usar agora, por Ação, Ação bônus e reação. */
export function buildCombatOptions(input: CombatOptionsInput): CombatOptions {
    const { sheet, economy } = input
    const perAction = attacksPerAction(input.abilities)
    const empty: CombatOptions = { action: [], bonus: [], reactions: [], attacksPerAction: perAction }
    if (input.dying || !canAct({ conditions: input.conditions })) return empty

    const action: CombatOption[] = []
    const bonus: CombatOption[] = []
    const reactions: CombatOption[] = []
    const canAttack = economy.action || (economy.attackAction && economy.attacksLeft > 0)
    const ignore = Boolean(input.ignoreResources)
    const weapons = input.weapons.filter((weapon) => ignore || weapon.quantity > 0)

    if (canAttack) {
        for (const weapon of weapons) {
            action.push(weaponOption(weapon, sheet, "action", "main"))
            // Versátil (DND-41): duas mãos sem escudo e sem ter atacado com outra arma neste turno.
            const otherInHand = Boolean(economy.lightWeaponId && economy.lightWeaponId !== weapon.id)
            if (isVersatile(weapon) && weapon.versatileDice && !sheet.shieldEquipped && !otherInHand) action.push(weaponOption(weapon, sheet, "action", "two-handed"))
            if (isThrown(weapon)) action.push(weaponOption(weapon, sheet, "action", "thrown"))
        }
        action.push(unarmedOption(sheet))
    }
    if (economy.lightAttack && !economy.lightExtraUsed) {
        // Propriedade Leve: o ataque extra é com OUTRA arma Leve (ou a mesma, se houver duas). Com a Maestria Ágil, entra
        // na ação Atacar; sem ela, gasta a Ação bônus.
        for (const weapon of weapons.filter(isLight)) {
            if (economy.lightWeaponId && weapon.id === economy.lightWeaponId && weapon.quantity < 2) continue
            const option = lightExtraOption(weapon, sheet)
            if (option.economy === "action") action.push(option)
            else if (economy.bonus) bonus.push(option)
        }
    }
    if (economy.cleave && !economy.cleaveUsed) {
        const weapon = weapons.find((item) => item.id === economy.cleave!.weaponId && item.mastery === "cleave")
        if (weapon) action.push(cleaveOption(weapon, sheet))
    }

    for (const spell of input.spells) {
        if (spell.circle > 0 && !spell.prepared) continue
        const cost = costFromCastingTime(spell.castingTime)
        if (cost === "other" || cost === "passive") continue
        const free = spell.circle === 0 ? [] : availableSlotLevels(sheet, spell.circle)
        const levels = ignore && spell.circle > 0 && free.length === 0 ? [spell.circle] : free
        if (!ignore && spell.circle > 0 && (levels.length === 0 || economy.slotSpellCast)) continue
        if (cost === "action" && economy.action) action.push(spellOption(spell, sheet, "action", levels))
        else if (cost === "bonus" && economy.bonus) bonus.push(spellOption(spell, sheet, "bonus", levels))
        else if (cost === "reaction" && economy.reaction) reactions.push({ ...spellOption(spell, sheet, "reaction", levels), trigger: spell.profile?.trigger ?? reactionTriggerFromText(fold(spell.description)) })
    }

    for (const item of input.items) {
        if (!item.consumable || (!ignore && item.quantity <= 0)) continue
        if (isHealingItem(item)) {
            const heal = { dice: dice(item.effectDice) || "0" }
            if (economy.bonus) bonus.push({ id: `item:${item.id}:self`, category: "items", economy: "bonus", label: `${item.name} (em você)`, detail: `Cura ${heal.dice} · ${item.quantity} restante(s)`, target: "self", multiTarget: false, resolution: "heal", heal })
            if (economy.action) action.push({ id: `item:${item.id}:ally`, category: "items", economy: "action", label: `${item.name} (em um aliado)`, detail: `Cura ${heal.dice} · ${item.quantity} restante(s)`, target: "ally", multiTarget: false, resolution: "heal", heal })
        } else if (economy.action) {
            action.push({ id: `item:${item.id}:use`, category: "items", economy: "action", label: item.name, detail: `Utilizar · ${item.quantity} restante(s); o Maddox resolve o efeito`, target: "any", multiTarget: false, resolution: "utility" })
        }
    }

    for (const ability of input.abilities) {
        if (!ignore && !hasCharges(ability)) continue
        const cost = ability.profile?.cost
        if (cost === "action" && economy.action) action.push(abilityOption(ability, "action"))
        else if (cost === "bonus" && economy.bonus) bonus.push(abilityOption(ability, "bonus"))
        else if (cost === "reaction" && economy.reaction) reactions.push(abilityOption(ability, "reaction"))
        else if (!ability.profile) {
            if (economy.action) action.push(abilityOption(ability, "action"))
            if (economy.bonus) bonus.push(abilityOption(ability, "bonus"))
        }
    }

    if (economy.action) action.push(...standardOptions(), freeOption("action"))
    if (economy.bonus) bonus.push(freeOption("bonus"))

    if (economy.reaction) {
        const melee = weapons.filter((weapon) => !isRanged(weapon))
        const best = melee[0] ? weaponOption(melee[0], sheet, "reaction", false) : { ...unarmedOption(sheet), economy: "reaction" as const }
        reactions.unshift({ ...best, id: "opportunity", label: `Ataque de oportunidade (${best.label})`, trigger: "leave-reach" })
        if (input.ready) reactions.push({ id: "ready", category: "other", economy: "reaction", label: `Ação preparada: ${input.ready.label}`, detail: "Executa a ação que você preparou.", target: "any", multiTarget: false, resolution: "standard", trigger: "ready" })
    }
    return { action, bonus, reactions, attacksPerAction: perAction }
}

/** Opção pelo id na economia pedida (revalidação no servidor). */
export function findCombatOption(options: CombatOptions, economy: CombatEconomySlot, id: string): CombatOption | null {
    const list = economy === "action" ? options.action : economy === "bonus" ? options.bonus : options.reactions
    return list.find((option) => option.id === id) ?? null
}
