import type { AttributeType } from "@/features/character-sheets/types/character-sheet.types"
import type { DiceTerm, DiceType } from "@/features/dice-roller/types"
import { MADDOX_CONDITION_LABELS, type MaddoxConditionKey } from "./constants"

/**
 * Regras PURAS do combate tático (Maddox 7), usadas pelo servidor e pela tela: vantagem e desvantagem por condição,
 * crítico, dano (resistência, PV temporários, 0 PV, morte instantânea), cura, testes contra a morte, concentração,
 * ordem de iniciativa e expressões de dados. Nada aqui rola dado nem toca o banco.
 */

export type RollMode = "normal" | "advantage" | "disadvantage"

export interface CombatCondition {
    key: MaddoxConditionKey
    /** Rodada em que a condição termina (no início do turno de quem a tem); `null` = até alguém removê-la. */
    untilRound: number | null
    /** Exaustão: nível (1–6). */
    level?: number
    /** De onde veio ("Esconder", "Teia", "Lobo — Mordida"). */
    source?: string
}

/** Flags que valem até o início do próximo turno de quem as tem (ou até serem usadas). */
export interface CombatFlags {
    dodging?: boolean
    disengaged?: boolean
    dashed?: boolean
    /** Escudo: +5 na CA até o início do próximo turno. */
    shield?: boolean
    /** Ajudado por um aliado: vantagem no próximo ataque (contra `targetKey`, se houver) ou teste. */
    helped?: { byName: string; byKey: string; targetKey: string | null } | null
}

/** Economia de ações do turno (true = ainda disponível). */
export interface CombatEconomy {
    action: boolean
    bonus: boolean
    reaction: boolean
    /** Ataques que ainda restam da ação Atacar (Ataque Extra). */
    attacksLeft: number
    /** A ação Atacar já começou neste turno (os próximos ataques não gastam outra Ação). */
    attackAction: boolean
    /** Já conjurou uma magia com espaço neste turno (regra de 2024: uma por turno). */
    slotSpellCast: boolean
    /** Atacou com uma arma Leve na ação Atacar (libera o ataque com a outra arma Leve na Ação bônus). */
    lightAttack: boolean
    /** Arma Leve usada na ação Atacar: a Ação bônus só oferece OUTRA (ou a mesma, havendo duas). */
    lightWeaponId?: string | null
    /** Ataque furtivo já somado a um dano neste turno (DND-41: uma vez por turno). */
    sneakAttackUsed?: boolean
}

export const freshEconomy = (): CombatEconomy => ({ action: true, bonus: true, reaction: true, attacksLeft: 0, attackAction: false, slotSpellCast: false, lightAttack: false, lightWeaponId: null, sneakAttackUsed: false })

export interface CombatSubject {
    conditions: readonly CombatCondition[]
    flags?: CombatFlags | null
}

export const hasCondition = (subject: CombatSubject, key: MaddoxConditionKey) => subject.conditions.some((condition) => condition.key === key)
export const conditionLabel = (key: MaddoxConditionKey) => MADDOX_CONDITION_LABELS[key]

const INCAPACITATING: readonly MaddoxConditionKey[] = ["incapacitated", "paralyzed", "petrified", "stunned", "unconscious"]

/** Pode usar Ação, Ação bônus e reação (nenhuma condição que incapacita). */
export const canAct = (subject: CombatSubject) => !subject.conditions.some((condition) => INCAPACITATING.includes(condition.key))

/** Junta vantagem e desvantagem: as duas juntas se anulam. */
export function combineModes(advantage: boolean, disadvantage: boolean): RollMode {
    if (advantage && disadvantage) return "normal"
    if (advantage) return "advantage"
    if (disadvantage) return "disadvantage"
    return "normal"
}

export interface AttackModeInput {
    attacker: CombatSubject
    target: CombatSubject
    /** Ataque corpo a corpo (a até 1,5 m) ou à distância. */
    ranged: boolean
    /** O atacante foi ajudado (Ajudar) contra este alvo. */
    helped?: boolean
}

/** Vantagem/desvantagem de uma jogada de ataque pelas condições e flags dos dois lados (PHB 2024). */
export function attackMode(input: AttackModeInput): { mode: RollMode; reasons: string[] } {
    const { attacker, target, ranged } = input
    const adv: string[] = []
    const dis: string[] = []
    if (hasCondition(attacker, "invisible")) adv.push("atacante invisível")
    if (input.helped) adv.push("ajudado por um aliado")
    for (const key of ["poisoned", "blinded", "frightened", "restrained", "prone"] as const) if (hasCondition(attacker, key)) dis.push(`atacante ${conditionLabel(key).toLowerCase()}`)
    for (const key of ["blinded", "paralyzed", "petrified", "restrained", "stunned", "unconscious"] as const) if (hasCondition(target, key)) adv.push(`alvo ${conditionLabel(key).toLowerCase()}`)
    if (hasCondition(target, "prone")) (ranged ? dis : adv).push(ranged ? "alvo caído (à distância)" : "alvo caído")
    if (hasCondition(target, "invisible") && !hasCondition(attacker, "invisible")) dis.push("alvo invisível")
    if (target.flags?.dodging && canAct(target)) dis.push("alvo esquivando")
    return { mode: combineModes(adv.length > 0, dis.length > 0), reasons: [...adv, ...dis] }
}

/** Golpe corpo a corpo contra Paralisado ou Inconsciente que acerta é crítico. */
export const autoCritical = (target: CombatSubject, ranged: boolean) => !ranged && (hasCondition(target, "paralyzed") || hasCondition(target, "unconscious"))

/** Resultado da salvaguarda pelas condições: `fail` = falha automática (Força e Destreza com Paralisado, Atordoado, Inconsciente, Petrificado). */
export function saveMode(subject: CombatSubject, ability: AttributeType): RollMode | "fail" {
    const physical = ability === "strength" || ability === "dexterity"
    if (physical && subject.conditions.some((condition) => ["paralyzed", "stunned", "unconscious", "petrified"].includes(condition.key))) return "fail"
    const adv = ability === "dexterity" && Boolean(subject.flags?.dodging) && canAct(subject)
    const dis = (ability === "dexterity" && hasCondition(subject, "restrained")) || false
    return combineModes(adv, dis)
}

/** Exaustão (2024): −2 por nível em todos os testes de d20. */
export function exhaustionPenalty(subject: CombatSubject): number {
    const level = subject.conditions.find((condition) => condition.key === "exhaustion")?.level ?? 0
    return -2 * Math.max(0, Math.min(6, level))
}

// ── Ataque ────────────────────────────────────────────────────────────────────

export interface AttackOutcome {
    hit: boolean
    critical: boolean
    fumble: boolean
}

/** 20 natural sempre acerta (crítico); 1 natural sempre erra; senão, total ≥ CA. */
export function attackOutcome(d20: number, total: number, armorClass: number, forceCritical = false): AttackOutcome {
    if (d20 === 1) return { hit: false, critical: false, fumble: true }
    if (d20 === 20) return { hit: true, critical: true, fumble: false }
    const hit = total >= armorClass
    return { hit, critical: hit && forceCritical, fumble: false }
}

// ── Dano e cura ───────────────────────────────────────────────────────────────

export interface DamageDefenses {
    resistances?: readonly string[]
    immunities?: readonly string[]
    vulnerabilities?: readonly string[]
}

const normalizeType = (value: string) =>
    value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()

/** Dano depois de imunidade (0), resistência (metade, para baixo) e vulnerabilidade (dobro). */
export function adjustDamage(amount: number, damageType: string | null, defenses: DamageDefenses): { amount: number; note: string | null } {
    const value = Math.max(0, Math.floor(amount))
    if (!damageType) return { amount: value, note: null }
    const type = normalizeType(damageType)
    const has = (list?: readonly string[]) => (list ?? []).some((item) => normalizeType(item) === type)
    if (has(defenses.immunities)) return { amount: 0, note: "imune" }
    let result = value
    let note: string | null = null
    if (has(defenses.resistances)) {
        result = Math.floor(result / 2)
        note = "resistente"
    }
    if (has(defenses.vulnerabilities)) {
        result *= 2
        note = note ? null : "vulnerável"
    }
    return { amount: result, note }
}

export interface HitPoints {
    hp: number
    hpMax: number
    tempHp: number
}

export interface DamageResult extends HitPoints {
    /** Dano que os PV temporários absorveram. */
    absorbed: number
    /** Dano que chegou aos PV. */
    dealt: number
    /** Caiu a 0 PV com este dano. */
    droppedToZero: boolean
    /** Já estava a 0 PV ao sofrer o dano. */
    atZero: boolean
    /** Personagem: o dano que sobrou depois de chegar a 0 é ≥ PV máximo (morte instantânea). */
    massiveDeath: boolean
}

/** Aplica o dano: PV temporários primeiro, PV no mínimo 0, morte instantânea quando o excedente alcança o PV máximo. */
export function applyDamage(current: HitPoints, amount: number): DamageResult {
    const damage = Math.max(0, Math.floor(amount))
    const atZero = current.hp <= 0
    const absorbed = Math.min(current.tempHp, damage)
    const rest = damage - absorbed
    const hp = Math.max(0, current.hp - rest)
    const overflow = rest - current.hp
    return {
        hp,
        hpMax: current.hpMax,
        tempHp: current.tempHp - absorbed,
        absorbed,
        dealt: Math.min(rest, current.hp),
        droppedToZero: !atZero && hp === 0 && rest > 0,
        atZero,
        massiveDeath: rest > 0 && hp === 0 && overflow >= current.hpMax && current.hpMax > 0,
    }
}

export function applyHealing(current: HitPoints, amount: number): HitPoints & { healed: number } {
    const healed = Math.max(0, Math.min(current.hpMax - current.hp, Math.floor(amount)))
    return { ...current, hp: current.hp + healed, healed }
}

/** Faixa de PV mostrada para os adversários (os números ficam com o mestre). */
export type HpBand = "ileso" | "ferido" | "muito-ferido" | "caido"
export const HP_BAND_LABELS: Record<HpBand, string> = { ileso: "Ileso", ferido: "Ferido", "muito-ferido": "Muito ferido", caido: "Caído" }

export function hpBand(hp: number, hpMax: number): HpBand {
    if (hp <= 0) return "caido"
    if (hp >= hpMax) return "ileso"
    return hp * 2 > hpMax ? "ferido" : "muito-ferido"
}

// ── 0 PV e testes contra a morte ──────────────────────────────────────────────

export interface DeathSaves {
    success: number
    failure: number
}

export interface DeathSaveResult extends DeathSaves {
    /** 20 natural: volta com 1 PV (e os testes zeram). */
    revived: boolean
    stable: boolean
    dead: boolean
}

/** Teste contra a morte (2024): 10+ sucesso; 20 natural = 1 PV; 1 natural = duas falhas; 3 sucessos estável; 3 falhas morto. */
export function deathSave(d20: number, current: DeathSaves): DeathSaveResult {
    if (d20 === 20) return { success: 0, failure: 0, revived: true, stable: false, dead: false }
    const failure = Math.min(3, current.failure + (d20 === 1 ? 2 : d20 < 10 ? 1 : 0))
    const success = Math.min(3, current.success + (d20 >= 10 ? 1 : 0))
    return { success, failure, revived: false, stable: success >= 3 && failure < 3, dead: failure >= 3 }
}

/** Dano recebido a 0 PV: uma falha (duas no crítico). */
export function damageAtZero(current: DeathSaves, critical: boolean): DeathSaveResult {
    const failure = Math.min(3, current.failure + (critical ? 2 : 1))
    return { success: current.success, failure, revived: false, stable: false, dead: failure >= 3 }
}

/** CD da salvaguarda de Constituição para manter a concentração: max(10, metade do dano), até 30. */
export const concentrationDc = (damage: number) => Math.min(30, Math.max(10, Math.floor(Math.max(0, damage) / 2)))

// ── Iniciativa ────────────────────────────────────────────────────────────────

export interface InitiativeEntry {
    actorKey: string
    kind: "character" | "combatant"
    total: number
    /** Valor de Destreza (desempate). */
    dexterity: number
    /** Ordem de entrada no combate (último desempate). */
    joinIndex: number
}

/** Ordem de iniciativa: total maior → Destreza maior → personagens antes de adversários → ordem de entrada. */
export function sortInitiative<T extends InitiativeEntry>(entries: readonly T[]): T[] {
    return [...entries].sort((a, b) => b.total - a.total || b.dexterity - a.dexterity || (a.kind === b.kind ? 0 : a.kind === "character" ? -1 : 1) || a.joinIndex - b.joinIndex)
}

// ── Dados ─────────────────────────────────────────────────────────────────────

export interface DiceExpression {
    terms: DiceTerm[]
    modifier: number
}

const DIE_FACES: Record<string, DiceType> = { "4": "d4", "6": "d6", "8": "d8", "10": "d10", "12": "d12", "20": "d20", "100": "d100" }

/** "2d6 + 3", "1d8+1d6+2", "7" → termos e modificador; `null` se não for uma expressão de dados válida. */
export function parseDiceExpression(raw: string | null | undefined): DiceExpression | null {
    const text = (raw ?? "").replace(/\s+/g, "").toLowerCase()
    if (!text || !/^[+-]?(\d+d\d+|\d+)([+-](\d+d\d+|\d+))*$/.test(text)) return null
    const terms: DiceTerm[] = []
    let modifier = 0
    for (const part of text.match(/[+-]?[^+-]+/g) ?? []) {
        const sign = part.startsWith("-") ? -1 : 1
        const token = part.replace(/^[+-]/, "")
        const dice = token.match(/^(\d+)d(\d+)$/)
        if (dice) {
            const faces = DIE_FACES[dice[2]!]
            const quantity = Number(dice[1])
            if (!faces || sign < 0 || quantity < 1 || quantity > 40) return null
            const existing = terms.find((term) => term.dice === faces)
            if (existing) existing.quantity += quantity
            else terms.push({ dice: faces, quantity })
        } else modifier += sign * Number(token)
    }
    return { terms, modifier }
}

/** Expressão legível ("2d6+3"). */
export function formatDiceExpression(expression: DiceExpression): string {
    const dice = expression.terms.map((term) => `${term.quantity}${term.dice}`).join("+")
    if (!dice) return String(expression.modifier)
    if (!expression.modifier) return dice
    return `${dice}${expression.modifier > 0 ? "+" : ""}${expression.modifier}`
}

/** Crítico: dobra a quantidade de dados (o modificador não dobra). */
export const criticalExpression = (expression: DiceExpression): DiceExpression => ({ terms: expression.terms.map((term) => ({ ...term, quantity: term.quantity * 2 })), modifier: expression.modifier })

/** Média de uma expressão (PV dos monstros pela média do bloco). */
export const averageOf = (expression: DiceExpression) => Math.floor(expression.terms.reduce((sum, term) => sum + term.quantity * ((Number(term.dice.slice(1)) + 1) / 2), 0) + expression.modifier)

export const abilityModifier = (score: number) => Math.floor((score - 10) / 2)
