import mongoose, { Schema, Document } from "mongoose"
import type {
    HitDiceType,
    ArmorProficiency,
    WeaponProficiency,
    SkillType,
    SpellcastingTier,
    Subclass,
    ClassTrait,
} from "../types/classes.types"
import type { AttributeType } from "@/lib/config/colors"

export interface ICharacterClass extends Document {
    _id: mongoose.Types.ObjectId
    name: string
    image?: string
    description: string
    source: string
    status: "active" | "inactive"
    hitDice: HitDiceType
    primaryAttributes: AttributeType[]
    savingThrows: AttributeType[]
    armorProficiencies: ArmorProficiency[]
    weaponProficiencies: WeaponProficiency[]
    skillCount: number
    availableSkills: SkillType[]
    spellcasting: SpellcastingTier
    spellcastingAttribute?: AttributeType
    subclasses: Subclass[]
    traits: ClassTrait[]
    createdAt: Date
    updatedAt: Date
}

const ATTRIBUTES = ["Força", "Destreza", "Constituição", "Inteligência", "Sabedoria", "Carisma"] as const
const HIT_DICE = ["d6", "d8", "d10", "d12"] as const
const SPELLCASTING_TIERS = ["Nenhum", "Completo", "Metade", "Terço"] as const
const ARMOR_PROFICIENCIES = ["Nenhuma", "Armaduras Leves", "Armaduras Médias", "Armaduras Pesadas", "Escudos"] as const
const WEAPON_PROFICIENCIES = [
    "Armas Simples", "Armas Marciais", "Armas de Fogo", "Besta Leve", "Besta Pesada",
    "Balestras", "Espadas Longas", "Espadas Curtas", "Adagas", "Arcos",
] as const
const SKILLS = [
    "Acrobacia", "Arcanismo", "Atletismo", "Atuação", "Enganação", "Furtividade",
    "História", "Intimidação", "Intuição", "Investigação", "Lidar com Animais",
    "Medicina", "Natureza", "Percepção", "Persuasão", "Prestidigitação",
    "Religião", "Sobrevivência",
] as const

const SubclassSchema = new Schema<Subclass>(
    {
        name: {
            type: String,
            required: [true, "Nome da subclasse é obrigatório"],
            trim: true,
            minlength: [2, "Nome deve ter pelo menos 2 caracteres"],
            maxlength: [100, "Nome deve ter no máximo 100 caracteres"],
        },
        description: {
            type: String,
            required: false,
            maxlength: [1000, "Descrição da subclasse deve ter no máximo 1000 caracteres"],
        },
    },
    { _id: true },
)

const ClassTraitSchema = new Schema<ClassTrait>(
    {
        level: {
            type: Number,
            required: [true, "Nível da habilidade é obrigatório"],
            min: [1, "Nível mínimo é 1"],
            max: [20, "Nível máximo é 20"],
        },
        description: {
            type: String,
            required: [true, "Descrição da habilidade é obrigatória"],
            maxlength: [5000, "Descrição da habilidade deve ter no máximo 5000 caracteres"],
        },
    },
    { _id: true },
)

const CharacterClassSchema = new Schema<ICharacterClass>(
    {
        name: {
            type: String,
            required: [true, "Nome da classe é obrigatório"],
            trim: true,
            minlength: [2, "Nome deve ter pelo menos 2 caracteres"],
            maxlength: [100, "Nome deve ter no máximo 100 caracteres"],
            index: true,
            unique: true,
        },
        image: {
            type: String,
            required: false,
            default: "",
        },
        description: {
            type: String,
            required: [true, "Descrição é obrigatória"],
            minlength: [10, "Descrição deve ter pelo menos 10 caracteres"],
            maxlength: [20000, "Descrição deve ter no máximo 20000 caracteres"],
        },
        source: {
            type: String,
            required: false,
            trim: true,
            maxlength: [200, "Fonte deve ter no máximo 200 caracteres"],
            default: "",
        },
        status: {
            type: String,
            required: true,
            enum: { values: ["active", "inactive"], message: "{VALUE} não é um status válido" },
            default: "active",
            index: true,
        },
        hitDice: {
            type: String,
            required: [true, "Dado de vida é obrigatório"],
            enum: { values: HIT_DICE, message: "{VALUE} não é um dado de vida válido" },
        },
        primaryAttributes: {
            type: [String],
            required: true,
            enum: { values: ATTRIBUTES, message: "{VALUE} não é um atributo válido" },
            default: [],
        },
        savingThrows: {
            type: [String],
            required: true,
            validate: {
                validator: (v: string[]) => v.length === 2,
                message: "Exatamente 2 testes de resistência são necessários",
            },
            enum: { values: ATTRIBUTES, message: "{VALUE} não é um atributo válido" },
        },
        armorProficiencies: {
            type: [String],
            required: true,
            default: [],
        },
        weaponProficiencies: {
            type: [String],
            required: true,
            default: [],
        },
        skillCount: {
            type: Number,
            required: [true, "Número de perícias é obrigatório"],
            min: [1, "Mínimo 1 perícia"],
            max: [6, "Máximo 6 perícias"],
            validate: { validator: Number.isInteger, message: "Deve ser um número inteiro" },
        },
        availableSkills: {
            type: [String],
            required: true,
            enum: { values: SKILLS, message: "{VALUE} não é uma perícia válida" },
            default: [],
        },
        spellcasting: {
            type: String,
            required: [true, "Nível de conjuração é obrigatório"],
            enum: { values: SPELLCASTING_TIERS, message: "{VALUE} não é um nível de conjuração válido" },
            default: "Nenhum",
        },
        spellcastingAttribute: {
            type: String,
            required: false,
            enum: { values: [...ATTRIBUTES], message: "{VALUE} não é um atributo válido" },
        },
        subclasses: {
            type: [SubclassSchema],
            required: true,
            default: [],
        },
        traits: {
            type: [ClassTraitSchema],
            required: true,
            default: [],
        },
    },
    { timestamps: true },
)

// Text index for fuzzy search
CharacterClassSchema.index({ name: "text", description: "text" })

export const CharacterClass =
    mongoose.models.CharacterClass ||
    mongoose.model<ICharacterClass>("CharacterClass", CharacterClassSchema)
