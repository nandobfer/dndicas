import type { AttributeType } from "../types/character-sheet.types"
import type { LevelUpChoices, LevelUpOptions } from "./level-up-types"

/**
 * Estado PURO do wizard "Subir de nível" (DND-56): as escolhas da tela, o que falta para confirmar (pt-BR) e o corpo do
 * POST. A validação de verdade é do servidor; aqui é só o aviso antes de enviar.
 */

export interface LevelUpFormState {
    hpMethod: "average" | "roll"
    /** Resultado do dado rolado na tela (sem CON). */
    hpDie: number | null
    subclassId: string | null
    featId: string | null
    featAttributes: Partial<Record<AttributeType, number>>
    cantrips: string[]
    spells: string[]
    swapRemove: string | null
    swapAdd: string | null
}

export const emptyLevelUpForm = (): LevelUpFormState => ({ hpMethod: "average", hpDie: null, subclassId: null, featId: null, featAttributes: {}, cantrips: [], spells: [], swapRemove: null, swapAdd: null })

export const ATTRIBUTE_LABELS: Record<AttributeType, string> = { strength: "Força", dexterity: "Destreza", constitution: "Constituição", intelligence: "Inteligência", wisdom: "Sabedoria", charisma: "Carisma" }

/** O que falta para confirmar (`null` = pronto). */
export function levelUpMissing(options: LevelUpOptions, form: LevelUpFormState): string | null {
    if (form.hpMethod === "roll" && form.hpDie === null) return "Role o dado de vida ou escolha a média."
    if (options.subclass.required && !form.subclassId) return `Escolha uma subclasse para confirmar o nível ${options.targetLevel}.`
    if (options.feat) {
        if (!form.featId) return options.feat.kind === "fighting-style" ? `Escolha um Estilo de Luta para confirmar o nível ${options.targetLevel}.` : `Escolha um talento para confirmar o nível ${options.targetLevel}.`
        const feat = options.feat.options.find((option) => option.id === form.featId)
        const total = Object.values(form.featAttributes).reduce((sum, value) => sum + (value ?? 0), 0)
        if (feat?.attributeRule.kind === "asi" && total !== 2) return "Distribua +2 em um atributo ou +1 em dois."
        if (feat?.attributeRule.kind === "one-of" && total !== 1) return "Escolha o atributo que recebe +1."
    }
    const spells = options.spells
    if (spells) {
        if (form.cantrips.length !== spells.cantrips) return `Escolha ${spells.cantrips} truque(s) novo(s).`
        if (form.spells.length !== spells.spells) return `Escolha ${spells.spells} magia(s) nova(s).`
        if (Boolean(form.swapRemove) !== Boolean(form.swapAdd)) return "Na troca de magia, escolha a que sai e a que entra."
    }
    return null
}

export function levelUpChoicesOf(options: LevelUpOptions, form: LevelUpFormState): LevelUpChoices {
    const attributes = Object.fromEntries(Object.entries(form.featAttributes).filter(([, value]) => value)) as Partial<Record<AttributeType, number>>
    return {
        targetLevel: options.targetLevel,
        hp: form.hpMethod === "roll" && form.hpDie !== null ? { method: "roll", die: form.hpDie } : { method: "average" },
        subclassId: options.subclass.required ? form.subclassId : null,
        feat: options.feat && form.featId ? { id: form.featId, attributes } : null,
        cantrips: options.spells ? form.cantrips : [],
        spells: options.spells ? form.spells : [],
        swap: options.spells?.swap.allowed && form.swapRemove && form.swapAdd ? { remove: form.swapRemove, add: form.swapAdd } : null,
    }
}

/** Marca/desmarca um item de uma lista com limite (o mais antigo sai quando passa do limite). */
export function toggleLimited(list: readonly string[], id: string, limit: number): string[] {
    if (list.includes(id)) return list.filter((item) => item !== id)
    if (limit <= 0) return [...list]
    const next = [...list, id]
    return next.length > limit ? next.slice(next.length - limit) : next
}

/** Ganho de PV mostrado na tela (média ou dado + CON, mínimo 1). */
export function previewHpGain(options: LevelUpOptions, form: LevelUpFormState): number {
    if (form.hpMethod === "roll" && form.hpDie !== null) return Math.max(1, form.hpDie + options.constitutionModifier)
    return options.hpAverage
}
