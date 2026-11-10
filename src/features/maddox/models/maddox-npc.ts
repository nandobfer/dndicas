import mongoose, { Schema, type Model, type Types } from "mongoose"
import type { EncryptedSecret } from "@/lib/crypto/secretBox"
import { MADDOX_NPC_STATUSES, MADDOX_OPEX_NPC_RETIRE_REASONS, MADDOX_VISIBILITIES, type MaddoxNpcStatus, type MaddoxOpexNpcRetireReason, type MaddoxVisibility } from "../constants"

/**
 * NPC Opex (DND-27): NPC com agente de IA próprio, que decide as falas e ações dele. Desfazer (ou a morte) só desliga a
 * marca (`active: false`): o canal individual fica arquivado e volta numa nova promoção. `engramind` guarda o agente e o
 * token cifrado (`tokenBox`, `select: false`).
 */
export interface IMaddoxNpcOpex {
    active: boolean
    promotedAt: Date | null
    /** `system:maddox` (ferramenta do narrador) ou o id do dono. */
    promotedBy: string
    retiredAt: Date | null
    retiredReason: MaddoxOpexNpcRetireReason | null
    engramind: { agentSlug: string | null; channel: string | null; tokenId: string | null; tokenBox?: EncryptedSecret | null; provisionedAt: Date | null; error: string | null } | null
}

/** NPC de uma campanha — `maddox_npcs`. `masterNotes` é conhecimento exclusivo do Maddox. */
export interface IMaddoxNpc {
    _id: Types.ObjectId
    campaignId: Types.ObjectId
    name: string
    /** Nome normalizado (sem acento e sem caixa) para a gravação pelo nome (Maddox 4). */
    nameKey: string
    portraitUrl: string | null
    publicDescription: string
    masterNotes: string
    visibility: MaddoxVisibility
    status: MaddoxNpcStatus
    opex?: IMaddoxNpcOpex | null
    createdAt: Date
    updatedAt: Date
}

const MaddoxNpcSchema = new Schema<IMaddoxNpc>(
    {
        campaignId: { type: Schema.Types.ObjectId, ref: "MaddoxCampaign", required: true },
        name: { type: String, required: true, trim: true },
        nameKey: { type: String, default: "" },
        portraitUrl: { type: String, default: null },
        publicDescription: { type: String, default: "" },
        masterNotes: { type: String, default: "" },
        visibility: { type: String, enum: MADDOX_VISIBILITIES, default: "players" },
        status: { type: String, enum: MADDOX_NPC_STATUSES, default: "active" },
        opex: {
            type: new Schema(
                {
                    active: { type: Boolean, default: false },
                    promotedAt: { type: Date, default: null },
                    promotedBy: { type: String, default: "" },
                    retiredAt: { type: Date, default: null },
                    retiredReason: { type: String, enum: [...MADDOX_OPEX_NPC_RETIRE_REASONS, null], default: null },
                    engramind: {
                        type: new Schema(
                            {
                                agentSlug: { type: String, default: null },
                                channel: { type: String, default: null },
                                tokenId: { type: String, default: null },
                                tokenBox: { type: Schema.Types.Mixed, default: null, select: false },
                                provisionedAt: { type: Date, default: null },
                                error: { type: String, default: null },
                            },
                            { _id: false },
                        ),
                        default: null,
                    },
                },
                { _id: false },
            ),
            default: null,
        },
    },
    { collection: "maddox_npcs", timestamps: true, versionKey: false },
)

MaddoxNpcSchema.index({ campaignId: 1, name: 1 })
MaddoxNpcSchema.index({ campaignId: 1, nameKey: 1 })
// Diário da campanha (Maddox 9): NPCs que os jogadores conhecem, do mais recente (cursor `_id`).
MaddoxNpcSchema.index({ campaignId: 1, visibility: 1, _id: -1 })
// NPCs Opex ativos da campanha (limite, ciclo de vida e prompt do narrador, DND-27).
MaddoxNpcSchema.index({ campaignId: 1, "opex.active": 1 })

export const MaddoxNpcModel: Model<IMaddoxNpc> = (mongoose.models.MaddoxNpc as Model<IMaddoxNpc>) || mongoose.model<IMaddoxNpc>("MaddoxNpc", MaddoxNpcSchema)
