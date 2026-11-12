import mongoose, { Schema, type Model, type Types } from "mongoose"
import {
    MADDOX_CHARACTER_PORTRAIT_STATUSES,
    MADDOX_CHARACTER_STATUSES,
    MADDOX_INTERVIEW_STATUSES,
    MADDOX_SHEET_RESTORE_STATUSES,
    type MaddoxCharacterPortraitStatus,
    type MaddoxCharacterStatus,
    type MaddoxInterviewStatus,
    type MaddoxSheetRestoreStatus,
} from "../constants"

/**
 * Personagem jogável de uma campanha — `maddox_characters`. O perfil é narrativo (seções em Markdown,
 * como o `protagonista.md` do roleplay); no modo fiel ao D&D aponta para a ficha (`CharacterSheet`).
 */
export interface IMaddoxCharacter {
    _id: Types.ObjectId
    campaignId: Types.ObjectId
    memberId: Types.ObjectId
    userId: string
    /** Vazio até a entrevista combinar o nome (DND-31: o personagem nasce quando a entrevista começa). */
    name: string
    portraitUrl: string | null
    /** Retrato gerado depois de confirmar a síntese da entrevista (DND-31); `status: null` = nunca pedido. */
    portrait?: { status: MaddoxCharacterPortraitStatus | null; error: string | null; startedAt: Date | null; completedAt: Date | null }
    /** Seções narrativas (identidade, origem, personalidade, capacidades, equipamentos, relações, condição…). */
    profile: Record<string, string>
    sheetId: Types.ObjectId | null
    /** Condição atual na história (ferimentos, recursos, onde está), mantida pelo narrador; o perfil não muda. */
    currentState: string
    /**
     * A condição foi regravada desde o Maddox 9, quando passou a aparecer no Diário da campanha (o prompt avisa que ela é
     * pública). Sem isso, a condição antiga — gravada como rascunho interno do mestre — não chega aos jogadores.
     */
    currentStatePublic?: boolean
    interview: { status: MaddoxInterviewStatus; scriptVersion: number | null }
    status: MaddoxCharacterStatus
    /**
     * Ajuste da ficha pelo Maddox depois do reinício da campanha (DND-50), quando não há cópia nem retrato do início: a
     * ficha volta ao fim da entrevista. `pending` bloqueia "Iniciar campanha"; `failed` deixa a ficha como estava.
     */
    sheetRestore?: { resetId: string; status: MaddoxSheetRestoreStatus; error: string | null; startedAt: Date; updatedAt: Date } | null
    createdAt: Date
    updatedAt: Date
}

const MaddoxCharacterSchema = new Schema<IMaddoxCharacter>(
    {
        campaignId: { type: Schema.Types.ObjectId, ref: "MaddoxCampaign", required: true },
        memberId: { type: Schema.Types.ObjectId, ref: "MaddoxCampaignMember", required: true },
        userId: { type: String, required: true },
        name: { type: String, default: "", trim: true },
        portraitUrl: { type: String, default: null },
        portrait: {
            status: { type: String, enum: [...MADDOX_CHARACTER_PORTRAIT_STATUSES, null], default: null },
            error: { type: String, default: null },
            startedAt: { type: Date, default: null },
            completedAt: { type: Date, default: null },
        },
        profile: { type: Map, of: String, default: {} },
        sheetId: { type: Schema.Types.ObjectId, ref: "CharacterSheet", default: null },
        currentState: { type: String, default: "" },
        currentStatePublic: { type: Boolean, default: false },
        interview: {
            status: { type: String, enum: MADDOX_INTERVIEW_STATUSES, default: "pending" },
            scriptVersion: { type: Number, default: null },
        },
        status: { type: String, enum: MADDOX_CHARACTER_STATUSES, default: "active" },
        sheetRestore: {
            type: new Schema(
                { resetId: { type: String, required: true }, status: { type: String, enum: MADDOX_SHEET_RESTORE_STATUSES, required: true }, error: { type: String, default: null }, startedAt: { type: Date, required: true }, updatedAt: { type: Date, required: true } },
                { _id: false },
            ),
            default: null,
        },
    },
    { collection: "maddox_characters", timestamps: true, versionKey: false },
)

MaddoxCharacterSchema.index({ campaignId: 1, status: 1 })
MaddoxCharacterSchema.index({ userId: 1 })

export const MaddoxCharacterModel: Model<IMaddoxCharacter> = (mongoose.models.MaddoxCharacter as Model<IMaddoxCharacter>) || mongoose.model<IMaddoxCharacter>("MaddoxCharacter", MaddoxCharacterSchema)
