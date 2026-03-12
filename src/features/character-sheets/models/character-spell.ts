import mongoose, { Schema, Document } from "mongoose"

export interface ICharacterSpell extends Document {
    _id: mongoose.Types.ObjectId
    sheetId: mongoose.Types.ObjectId
    catalogSpellId: mongoose.Types.ObjectId | null
    name: string
    circle: number
    school: string
    image: string | null
    prepared: boolean
    components: string[]
    createdAt: Date
}

const CharacterSpellSchema = new Schema<ICharacterSpell>(
    {
        sheetId: { type: Schema.Types.ObjectId, ref: "CharacterSheet", required: true, index: true },
        catalogSpellId: { type: Schema.Types.ObjectId, ref: "Spell", default: null },
        name: { type: String, required: true, trim: true, maxlength: 100 },
        circle: { type: Number, default: 0, min: 0, max: 9 },
        school: { type: String, default: "" },
        image: { type: String, default: null },
        prepared: { type: Boolean, default: false },
        components: [{ type: String }],
    },
    { timestamps: { createdAt: true, updatedAt: false } }
)

export const CharacterSpell = (mongoose.models.CharacterSpell as mongoose.Model<ICharacterSpell>) || mongoose.model<ICharacterSpell>("CharacterSpell", CharacterSpellSchema)
