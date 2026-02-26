import mongoose, { Schema, Document } from 'mongoose';

export interface DiceValue {
  quantidade: number;  // Positive integer, no upper limit
  tipo: 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';
}

import { type SpellSchool, type SpellComponent, type AttributeType } from "../types/spells.types"

export interface ISpell extends Document {
    _id: mongoose.Types.ObjectId
    name: string // Spell name (unique)
    description: string // Rich HTML (TipTap output with mentions)
    circle: number // 0-9 (0 = Truque/Cantrip)
    school: SpellSchool // One of 8 D&D schools
    component: SpellComponent[] // Concentration, Somatic, Verbal, Material
    range?: string // Optional - range description
    area?: string // Optional - area description
    saveAttribute?: AttributeType // Optional - saving throw attribute
    baseDice?: DiceValue // Optional - base damage dice
    extraDicePerLevel?: DiceValue // Optional - dice added per spell slot level above base
    source: string // Free text (e.g., "PHB pg. 230", "Homebrew")
    status: "active" | "inactive" // Admin toggle
    createdAt: Date
    updatedAt: Date
}

const DiceValueSchema = new Schema<DiceValue>(
    {
        quantidade: {
            type: Number,
            required: true,
            min: [1, "Quantidade de dados deve ser pelo menos 1"],
            validate: {
                validator: Number.isInteger,
                message: "Quantidade deve ser um número inteiro",
            },
        },
        tipo: {
            type: String,
            required: true,
            enum: {
                values: ["d4", "d6", "d8", "d10", "d12", "d20"],
                message: "{VALUE} não é um tipo de dado válido",
            },
        },
    },
    { _id: false }, // Embedded document, no separate _id
)

const SpellSchema = new Schema<ISpell>(
    {
        name: {
            type: String,
            required: [true, "Nome da magia é obrigatório"],
            trim: true,
            minlength: [2, "Nome deve ter pelo menos 2 caracteres"],
            maxlength: [100, "Nome deve ter no máximo 100 caracteres"],
            index: true,
            unique: true,
        },
        description: {
            type: String,
            required: [true, "Descrição é obrigatória"],
            minlength: [10, "Descrição deve ter pelo menos 10 caracteres"],
            maxlength: [10000, "Descrição deve ter no máximo 10000 caracteres"],
        },
        circle: {
            type: Number,
            required: [true, "Círculo é obrigatório"],
            min: [0, "Círculo deve ser entre 0 (truque) e 9"],
            max: [9, "Círculo deve ser entre 0 (truque) e 9"],
            index: true,
        },
        school: {
            type: String,
            required: [true, "Escola de magia é obrigatória"],
            enum: {
                values: ["Abjuração", "Adivinhação", "Conjuração", "Encantamento", "Evocação", "Ilusão", "Necromancia", "Transmutação"],
                message: "{VALUE} não é uma escola de magia válida",
            },
            index: true,
        },
        component: {
            type: [String],
            required: true,
            default: [],
        },
        range: {
            type: String,
            required: false,
            trim: true,
        },
        area: {
            type: String,
            required: false,
            trim: true,
        },
        saveAttribute: {
            type: String,
            required: false,
            enum: {
                values: ["Força", "Destreza", "Constituição", "Inteligência", "Sabedoria", "Carisma"],
                message: "{VALUE} não é um atributo válido",
            },
            index: true,
        },
        baseDice: {
            type: DiceValueSchema,
            required: false,
        },
        extraDicePerLevel: {
            type: DiceValueSchema,
            required: false,
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
            enum: {
                values: ["active", "inactive"],
                message: "{VALUE} não é um status válido",
            },
            default: "active",
            index: true,
        },
    },
    {
        timestamps: true,
        collection: "spells",
    },
)

// Indexes for common queries
SpellSchema.index({ name: 'text', description: 'text' }); // Full-text search
SpellSchema.index({ circle: 1, school: 1 }); // Filter by circle + school
SpellSchema.index({ school: 1, status: 1 }); // Filter by school + status
SpellSchema.index({ 'baseDice.tipo': 1 }); // Filter by dice type
SpellSchema.index({ saveAttribute: 1, status: 1 }); // Filter by save attribute
SpellSchema.index({ status: 1, createdAt: -1 }); // Admin list all, sorted

// Virtual for display
SpellSchema.virtual('circleLabel').get(function () {
  return this.circle === 0 ? 'Truque' : `${this.circle}º Círculo`;
});

// Ensure virtuals are included in JSON
SpellSchema.set('toJSON', { virtuals: true });
SpellSchema.set('toObject', { virtuals: true });

// Robust model export for Next.js dev mode (handles schema changes)
if (mongoose.models.Spell && !(mongoose.models.Spell.schema as any).path('range')) {
    delete (mongoose.models as any).Spell;
}

export const Spell = mongoose.models.Spell || mongoose.model<ISpell>('Spell', SpellSchema);
export default Spell;
