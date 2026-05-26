import { Skull, Bird, Waves, Mountain, Footprints } from "lucide-react"
import type { AttributeType, SkillName } from "@/features/character-sheets/types/character-sheet.types"
import type { ConditionKey, MonsterAlignment, MonsterSize, MonsterType } from "../types/monsters.types"

export const MONSTER_TYPE_LABELS: Record<MonsterType, string> = {
    aberration: "Aberração",
    beast: "Besta",
    celestial: "Celestial",
    construct: "Constructo",
    dragon: "Dragão",
    elemental: "Elemental",
    fey: "Fada",
    fiend: "Corruptor",
    giant: "Gigante",
    humanoid: "Humanoide",
    monstrosity: "Monstruosidade",
    ooze: "Limo",
    plant: "Planta",
    undead: "Morto-vivo",
}

export const MONSTER_SIZE_LABELS: Record<MonsterSize, string> = {
    F: "Mínimo",
    D: "Diminuto",
    T: "Minúsculo",
    S: "Pequeno",
    M: "Médio",
    L: "Grande",
    H: "Enorme",
    G: "Gargantuano",
    C: "Colossal",
    V: "Variável",
}

export const ALIGNMENT_LABELS: Record<MonsterAlignment, string> = {
    LG: "Leal e Bom",
    NG: "Neutro e Bom",
    CG: "Caótico e Bom",
    LN: "Leal e Neutro",
    N: "Neutro",
    CN: "Caótico e Neutro",
    LE: "Leal e Mau",
    NE: "Neutro e Mau",
    CE: "Caótico e Mau",
    unaligned: "Sem alinhamento",
    any: "Qualquer alinhamento",
}

export const CONDITION_LABELS: Record<ConditionKey, string> = {
    blinded: "Cego",
    charmed: "Enfeitiçado",
    deafened: "Surdo",
    exhaustion: "Exaustão",
    frightened: "Amedrontado",
    grappled: "Agarrado",
    incapacitated: "Incapacitado",
    invisible: "Invisível",
    paralyzed: "Paralisado",
    petrified: "Petrificado",
    poisoned: "Envenenado",
    prone: "Caído",
    restrained: "Contido",
    stunned: "Atordoado",
    unconscious: "Inconsciente",
}

export const ATTRIBUTE_LABELS: Record<AttributeType, string> = {
    strength: "Força",
    dexterity: "Destreza",
    constitution: "Constituição",
    intelligence: "Inteligência",
    wisdom: "Sabedoria",
    charisma: "Carisma",
}

export const ATTRIBUTE_KEYS = Object.keys(ATTRIBUTE_LABELS) as AttributeType[]

export const SKILL_NAMES: SkillName[] = [
    "Acrobacia",
    "Arcanismo",
    "Atletismo",
    "Atuação",
    "Enganação",
    "Furtividade",
    "História",
    "Intimidação",
    "Intuição",
    "Investigação",
    "Lidar com Animais",
    "Medicina",
    "Natureza",
    "Percepção",
    "Persuasão",
    "Prestidigitação",
    "Religião",
    "Sobrevivência",
]

export const SPEED_FIELDS = [
    { name: "speed", label: "Deslocamento", icon: Footprints },
    { name: "flySpeed", label: "Voo", icon: Bird },
    { name: "swimSpeed", label: "Nado", icon: Waves },
    { name: "climbSpeed", label: "Escalada", icon: Mountain },
] as const

export const MONSTER_TYPE_OPTIONS = (Object.entries(MONSTER_TYPE_LABELS) as [MonsterType, string][]).map(([value, label]) => ({ value, label }))
export const MONSTER_SIZE_OPTIONS = (Object.entries(MONSTER_SIZE_LABELS) as [MonsterSize, string][]).map(([value, label]) => ({ value, label }))
export const ALIGNMENT_OPTIONS = (Object.entries(ALIGNMENT_LABELS) as [MonsterAlignment, string][]).map(([value, label]) => ({ value, label }))
export const CONDITION_OPTIONS = (Object.entries(CONDITION_LABELS) as [ConditionKey, string][]).map(([value, label]) => ({ value, label }))
export const MONSTER_ICON = Skull
