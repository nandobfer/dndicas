import mongoose, { Schema, Document } from "mongoose"
import type { AttributeType, SkillName } from "../types/character-sheet.types"

export interface ICharacterSheet extends Document {
    _id: mongoose.Types.ObjectId
    slug: string
    userId: string
    username: string
    name: string
    class: string
    classRef: mongoose.Types.ObjectId | null
    subclass: string
    subclassRef: mongoose.Types.ObjectId | null
    level: number
    experience: string
    race: string
    raceRef: mongoose.Types.ObjectId | null
    origin: string
    originRef: mongoose.Types.ObjectId | null
    inspiration: boolean
    multiclassNotes: string
    photo: string | null
    age: string
    height: string
    weight: string
    eyes: string
    skin: string
    hair: string
    appearance: string
    strength: number
    dexterity: number
    constitution: number
    intelligence: number
    wisdom: number
    charisma: number
    proficiencyBonusOverride: number | null
    savingThrows: Record<AttributeType, boolean>
    skills: Record<SkillName, { proficient: boolean; expertise: boolean; override?: number }>
    movementSpeed: string
    hpMax: number | null
    hpCurrent: number | null
    hpTemp: number
    hitDiceTotal: string
    hitDiceUsed: number
    deathSavesSuccess: number
    deathSavesFailure: number
    armorClassOverride: number | null
    armorClassBonus: number | null
    initiativeOverride: number | null
    passivePerceptionOverride: number | null
    spellcastingAttribute: string | null
    spellSaveDCOverride: number | null
    spellAttackBonusOverride: number | null
    spellSlots: Record<string, { total: number; used: number }>
    resourceCharges: Array<{
        id: string
        name: string
        total: number
        used: number
        source: {
            kind: "manual-name-mention" | "class-feature" | "species-trait" | "feat" | "item"
            entityType: "Habilidade" | "Talento" | "Item"
            entityId: string
        } | null
    }>
    coins: { cp: number; sp: number; ep: number; gp: number; pp: number }
    personalityTraits: string
    ideals: string
    bonds: string
    flaws: string
    notes: string
    // 2024 sheet fields
    classFeatures: string
    speciesTraits: string
    featuresNotes: string
    size: string
    armorTraining: { light: boolean; medium: boolean; heavy: boolean; shields: boolean }
    weaponProficiencies: string
    toolProficiencies: string
    createdAt: Date
    updatedAt: Date
}

const CharacterSheetSchema = new Schema<ICharacterSheet>(
    {
        slug: { type: String, required: true, unique: true, trim: true },
        userId: { type: String, required: true, trim: true, index: true },
        username: { type: String, default: "", trim: true, index: true },
        name: { type: String, default: "", trim: true, maxlength: 100 },
        class: { type: String, default: "", trim: true, maxlength: 2000 },
        classRef: { type: Schema.Types.ObjectId, ref: "Class", default: null },
        subclass: { type: String, default: "", trim: true, maxlength: 2000 },
        subclassRef: { type: Schema.Types.ObjectId, ref: "Subclass", default: null },
        level: { type: Number, default: 1, min: 1, max: 20 },
        experience: { type: String, default: "" },
        race: { type: String, default: "", trim: true, maxlength: 2000 },
        raceRef: { type: Schema.Types.ObjectId, ref: "Race", default: null },
        origin: { type: String, default: "", trim: true, maxlength: 2000 },
        originRef: { type: Schema.Types.ObjectId, ref: "Background", default: null },
        inspiration: { type: Boolean, default: false },
        multiclassNotes: { type: String, default: "" },
        photo: { type: String, default: null },
        age: { type: String, default: "" },
        height: { type: String, default: "" },
        weight: { type: String, default: "" },
        eyes: { type: String, default: "" },
        skin: { type: String, default: "" },
        hair: { type: String, default: "" },
        appearance: { type: String, default: "" },
        strength: { type: Number, default: 10, min: 1, max: 30 },
        dexterity: { type: Number, default: 10, min: 1, max: 30 },
        constitution: { type: Number, default: 10, min: 1, max: 30 },
        intelligence: { type: Number, default: 10, min: 1, max: 30 },
        wisdom: { type: Number, default: 10, min: 1, max: 30 },
        charisma: { type: Number, default: 10, min: 1, max: 30 },
        proficiencyBonusOverride: { type: Number, default: null },
        savingThrows: {
            type: Map,
            of: Boolean,
            default: () => ({
                strength: false,
                dexterity: false,
                constitution: false,
                intelligence: false,
                wisdom: false,
                charisma: false,
            }),
        },
        skills: {
            type: Map,
            of: new Schema({ proficient: { type: Boolean, default: false }, expertise: { type: Boolean, default: false }, override: { type: Number } }, { _id: false }),
            default: () => ({}),
        },
        movementSpeed: { type: String, default: "" },
        hpMax: { type: Number, default: null },
        hpCurrent: { type: Number, default: null },
        hpTemp: { type: Number, default: 0, min: 0 },
        hitDiceTotal: { type: String, default: "" },
        hitDiceUsed: { type: Number, default: 0, min: 0 },
        deathSavesSuccess: { type: Number, default: 0, min: 0, max: 3 },
        deathSavesFailure: { type: Number, default: 0, min: 0, max: 3 },
        armorClassOverride: { type: Number, default: null },
        armorClassBonus: { type: Number, default: null },
        initiativeOverride: { type: Number, default: null },
        passivePerceptionOverride: { type: Number, default: null },
        spellcastingAttribute: { type: String, default: null },
        spellSaveDCOverride: { type: Number, default: null },
        spellAttackBonusOverride: { type: Number, default: null },
        spellSlots: { type: Map, of: new Schema({ total: { type: Number, default: 0, min: 0 }, used: { type: Number, default: 0, min: 0 } }, { _id: false }), default: () => ({}) },
        resourceCharges: {
            type: [
                new Schema(
                    {
                        id: { type: String, required: true, trim: true },
                        name: { type: String, default: "", trim: true, maxlength: 2000 },
                        total: { type: Number, default: 0, min: 0 },
                        used: { type: Number, default: 0, min: 0 },
                        source: {
                            type: new Schema(
                                {
                                    kind: { type: String, enum: ["manual-name-mention", "class-feature", "species-trait", "feat", "item"], required: true },
                                    entityType: { type: String, enum: ["Habilidade", "Talento", "Item"], required: true },
                                    entityId: { type: String, required: true, trim: true },
                                },
                                { _id: false }
                            ),
                            default: null,
                        },
                    },
                    { _id: false }
                ),
            ],
            default: () => [],
        },
        coins: {
            type: new Schema({ cp: { type: Number, default: 0, min: 0 }, sp: { type: Number, default: 0, min: 0 }, ep: { type: Number, default: 0, min: 0 }, gp: { type: Number, default: 0, min: 0 }, pp: { type: Number, default: 0, min: 0 } }, { _id: false }),
            default: () => ({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }),
        },
        personalityTraits: { type: String, default: "" },
        ideals: { type: String, default: "" },
        bonds: { type: String, default: "" },
        flaws: { type: String, default: "" },
        notes: { type: String, default: "" },
        classFeatures: { type: String, default: "" },
        speciesTraits: { type: String, default: "" },
        featuresNotes: { type: String, default: "" },
        size: { type: String, default: "" },
        armorTraining: {
            type: new Schema(
                {
                    light: { type: Boolean, default: false },
                    medium: { type: Boolean, default: false },
                    heavy: { type: Boolean, default: false },
                    shields: { type: Boolean, default: false },
                },
                { _id: false }
            ),
            default: () => ({ light: false, medium: false, heavy: false, shields: false }),
        },
        weaponProficiencies: { type: String, default: "" },
        toolProficiencies: { type: String, default: "" },
    },
    { timestamps: true }
)

CharacterSheetSchema.index({ updatedAt: -1 })

export const CharacterSheet = (mongoose.models.CharacterSheet as mongoose.Model<ICharacterSheet>) || mongoose.model<ICharacterSheet>("CharacterSheet", CharacterSheetSchema)
