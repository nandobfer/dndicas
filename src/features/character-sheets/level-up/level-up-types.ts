import type { AttributeType } from "../types/character-sheet.types"

/**
 * Subida de nível da ficha (DND-56): opções reais do próximo nível (montadas pelo servidor a partir do catálogo) e as
 * escolhas validadas pelo mesmo servidor. O wizard da ficha, o wizard da mesa do Maddox e o Personagem Opex usam estes
 * tipos: a tela mostra as opções, o Opex escolhe entre elas e o servidor aplica.
 */

export type LevelUpFeatAttributeRule = { kind: "asi" } | { kind: "one-of"; options: AttributeType[] } | { kind: "none" }

export interface LevelUpFeatOption {
    id: string
    name: string
    category: string | null
    attributeRule: LevelUpFeatAttributeRule
}

export type LevelUpFeatSlotKind = "general" | "epic" | "fighting-style"

export interface LevelUpTraitOption {
    id: string
    label: string
    source: "classe" | "subclasse" | "raça"
}

export interface LevelUpSpellOption {
    id: string
    name: string
    circle: number
}

export interface LevelUpKnownSpell {
    /** Id do registro da ficha (`CharacterSpell`). */
    id: string
    catalogId: string | null
    name: string
    circle: number
}

export interface LevelUpSpellSwap {
    allowed: boolean
    /** Trecho do traço do catálogo que sustenta a troca (decisão do Maddox). */
    source: string | null
}

export interface LevelUpSpellStep {
    cantrips: number
    spells: number
    maxCircle: number
    cantripOptions: LevelUpSpellOption[]
    spellOptions: LevelUpSpellOption[]
    known: LevelUpKnownSpell[]
    swap: LevelUpSpellSwap
}

export interface LevelUpResourceChange {
    name: string
    before: number | null
    after: number
}

export interface LevelUpOptions {
    sheetId: string
    currentLevel: number
    targetLevel: number
    className: string
    hitDie: string
    hitDieSides: number
    constitutionModifier: number
    hpAverage: number
    hpMax: number
    subclass: { required: boolean; options: { id: string; name: string }[]; current: { id: string; name: string } | null }
    feat: { kind: LevelUpFeatSlotKind; options: LevelUpFeatOption[]; cap: number } | null
    traits: LevelUpTraitOption[]
    /** Traços da subclasse até o nível, por subclasse (quando a escolha é neste nível). */
    subclassTraits: Record<string, LevelUpTraitOption[]>
    spells: LevelUpSpellStep | null
    spellSlots: { before: Record<string, number>; after: Record<string, number> }
    resources: LevelUpResourceChange[]
    /** Atributos atuais (base do aumento do talento). */
    scores: Record<AttributeType, number>
}

export interface LevelUpChoices {
    targetLevel: number
    hp: { method: "average" } | { method: "roll"; die?: number }
    subclassId?: string | null
    feat?: { id: string; attributes?: Partial<Record<AttributeType, number>> } | null
    cantrips?: string[]
    spells?: string[]
    swap?: { remove: string; add: string } | null
}

/** O que o personagem ganhou (card "Subida de nível" e resposta do wizard). */
export interface LevelUpGains {
    fromLevel: number
    toLevel: number
    hp: { method: "average" | "roll"; gain: number; die: number | null; hpMax: number }
    subclass: string | null
    feat: { name: string; attributes: Partial<Record<AttributeType, number>> } | null
    traits: string[]
    cantrips: string[]
    spells: string[]
    swap: { from: string; to: string } | null
}

export interface SheetLevelUpCampaignInfo {
    campaignId: string
    stepId: string | null
    /** Nível da subida pendente. */
    toLevel: number | null
    mode: "marco" | "experiencia"
    status: string | null
    /** Motivo de não poder subir agora (pt-BR); `null` = pode. */
    blocked: string | null
}

export interface SheetLevelUpState {
    options: LevelUpOptions | null
    campaign: SheetLevelUpCampaignInfo | null
    /** Motivo de não haver opções (nível 20, ficha sem classe…). */
    unavailable: string | null
}
