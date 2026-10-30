import mongoose, { Schema, type Model } from "mongoose"
import { MADDOX_SCRIPT_KINDS, type MaddoxScriptKind, type MaddoxScriptTopic } from "../constants"

/**
 * Versão imutável de um roteiro de entrevista do Maddox — `maddox_interview_scripts`. Cada gravação
 * cria uma (por tipo); a entrevista usa sempre a versão com que começou. Versionamento copiado do
 * roteiro do Agente Entrevistador do Ciliar.
 */
export interface IMaddoxInterviewScript {
    kind: MaddoxScriptKind
    version: number
    guide: string
    topics: MaddoxScriptTopic[]
    notes: string
    createdBy: string
    createdAt: Date
}

const topicSchema = new Schema<MaddoxScriptTopic>({ id: String, text: String, active: Boolean }, { _id: false })

const MaddoxInterviewScriptSchema = new Schema<IMaddoxInterviewScript>(
    {
        kind: { type: String, enum: MADDOX_SCRIPT_KINDS, required: true, immutable: true },
        version: { type: Number, required: true, immutable: true },
        guide: { type: String, required: true, immutable: true },
        topics: { type: [topicSchema], default: [], immutable: true },
        notes: { type: String, default: "", immutable: true },
        createdBy: { type: String, required: true, immutable: true },
    },
    { collection: "maddox_interview_scripts", timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
)

MaddoxInterviewScriptSchema.index({ kind: 1, version: 1 }, { unique: true })

export const MaddoxInterviewScriptModel: Model<IMaddoxInterviewScript> =
    (mongoose.models.MaddoxInterviewScript as Model<IMaddoxInterviewScript>) || mongoose.model<IMaddoxInterviewScript>("MaddoxInterviewScript", MaddoxInterviewScriptSchema)
