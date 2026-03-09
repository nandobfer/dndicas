import mongoose, { Schema, Document, Model } from "mongoose";
import { DiceValue, ItemType, ItemRarity, ArmorType, DamageType, ItemTrait } from "../types/items.types";

export interface IItem extends Document {
    _id: mongoose.Types.ObjectId
    name: string
    description: string
    source: string
    status: "active" | "inactive"
    image?: string
    price?: string
    isMagic: boolean
    type: ItemType
    rarity: ItemRarity
    traits: ItemTrait[]

    // Weapon specifics
    properties?: ItemTrait[]
    damageDice?: DiceValue
    damageType?: DamageType
    mastery?: string

    // Tool specifics
    attributeUsed?: string

    // Armor specifics
    ac?: number
    acType?: "base" | "bonus"
    armorType?: ArmorType

    // Shield specifics
    acBonus?: number

    // Consumable specifics
    effectDice?: DiceValue

    createdAt: Date
    updatedAt: Date
}

const DiceValueSchema = new Schema(
    {
        quantidade: { type: Number, required: true, min: 1 },
        tipo: { type: String, required: true, enum: ["d4", "d6", "d8", "d10", "d12", "d20"] },
    },
    { _id: false },
)

const ItemTraitSchema = new Schema(
    {
        name: { type: String, trim: true, maxlength: 100 },
        level: { type: Number, default: 1 },
        description: { type: String, required: true, maxlength: 5000 },
    },
    { _id: true },
)

const ItemSchema = new Schema<IItem>(
    {
        name: {
            type: String,
            required: [true, "Nome do item é obrigatório"],
            unique: true,
            maxlength: 100,
            trim: true,
        },
        description: {
            type: String,
            required: [true, "Descrição é obrigatória"],
        },
        source: {
            type: String,
            required: [true, "Fonte é obrigatória"],
            maxlength: 200,
            trim: true,
        },
        status: {
            type: String,
            enum: ["active", "inactive"],
            default: "active",
        },
        image: { type: String, default: "" },
        price: { type: String, default: "" },
        isMagic: { type: Boolean, default: false },
        type: {
            type: String,
            required: [true, "Tipo de item é obrigatório"],
            enum: ["ferramenta", "arma", "armadura", "escudo", "consumível", "munição", "qualquer"],
        },
        rarity: {
            type: String,
            required: [true, "Raridade é obrigatória"],
            enum: ["comum", "incomum", "raro", "muito raro", "lendário", "artefato"],
        },
        traits: { type: [ItemTraitSchema], default: [] },

        // Weapon specifics
        properties: { type: [ItemTraitSchema], default: [] },
        damageDice: { type: DiceValueSchema },
        damageType: {
            type: String,
            enum: ["cortante", "perfurante", "concussão", "ácido", "fogo", "frio", "relâmpago", "trovão", "veneno", "psíquico", "radiante", "necrótico", "força"],
        },
        mastery: { type: Schema.Types.Mixed }, // Similar to background featId or spell rule reference

        // Tool specifics
        attributeUsed: {
            type: String,
            enum: ["Força", "Destreza", "Constituição", "Inteligência", "Sabedoria", "Carisma"],
        },

        // Armor specifics
        ac: { type: Number },
        acType: { type: String, enum: ["base", "bonus"] },
        armorType: { type: String, enum: ["leve", "média", "pesada", "nenhuma"] },

        // Shield specifics
        acBonus: { type: Number },

        // Consumable specifics
        effectDice: { type: DiceValueSchema },
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
            versionKey: false,
            transform: (_, ret) => {
                const result = {
                    ...ret,
                    id: String(ret._id),
                }
                return result
            },
        },
        toObject: { virtuals: true },
    },
)

// Indexes
ItemSchema.index({ name: "text", description: "text", source: "text" });
ItemSchema.index({ type: 1 });
ItemSchema.index({ rarity: 1 });
ItemSchema.index({ status: 1 });

export const ItemModel: Model<IItem> =
    mongoose.models.Item || mongoose.model<IItem>("Item", ItemSchema);
