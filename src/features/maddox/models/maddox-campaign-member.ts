import mongoose, { Schema, type Model, type Types } from "mongoose"
import type { EncryptedSecret } from "@/lib/crypto/secretBox"
import {
    MADDOX_MEMBER_KINDS,
    MADDOX_MEMBER_ROLES,
    MADDOX_MEMBER_STATUSES,
    MADDOX_OPEX_INTERVIEW_MODES,
    MADDOX_OPEX_RUN_STATUSES,
    type MaddoxMemberKind,
    type MaddoxMemberRole,
    type MaddoxMemberStatus,
    type MaddoxOpexInterviewMode,
    type MaddoxOpexRunStatus,
} from "../constants"

/**
 * Personagem Opex (DND-26): membro controlado por IA, adicionado pelo dono. `run` é a situação do trabalho do Opex
 * fora da mesa (entrevista) ou a falha que trava a mesa; `engramind` guarda o agente próprio e o token cifrado.
 */
export interface IMaddoxOpexMember {
    ownerUserId: string
    prompt: string
    interviewMode: MaddoxOpexInterviewMode
    addedAt: Date
    run: { status: MaddoxOpexRunStatus; stage: "interview" | "table" | null; error: string | null; updatedAt: Date | null } | null
    engramind: { agentSlug: string | null; channel: string | null; tokenId: string | null; tokenBox?: EncryptedSecret | null; provisionedAt: Date | null; error: string | null } | null
}

/** Membro de uma campanha (dono, jogador convidado ou Personagem Opex) — `maddox_campaign_members`. */
export interface IMaddoxCampaignMember {
    _id: Types.ObjectId
    campaignId: Types.ObjectId
    /** Personagem Opex: `opex:<memberId>` (sintético). */
    userId: string
    /** Ausente nos membros antigos = `human`. */
    kind?: MaddoxMemberKind
    opex?: IMaddoxOpexMember | null
    role: MaddoxMemberRole
    status: MaddoxMemberStatus
    invitedBy: string | null
    joinedAt: Date | null
    characterId: Types.ObjectId | null
    createdAt: Date
    updatedAt: Date
}

const MaddoxCampaignMemberSchema = new Schema<IMaddoxCampaignMember>(
    {
        campaignId: { type: Schema.Types.ObjectId, ref: "MaddoxCampaign", required: true },
        userId: { type: String, required: true },
        kind: { type: String, enum: MADDOX_MEMBER_KINDS, default: "human" },
        opex: {
            type: new Schema(
                {
                    ownerUserId: { type: String, required: true },
                    prompt: { type: String, default: "" },
                    interviewMode: { type: String, enum: MADDOX_OPEX_INTERVIEW_MODES, default: "autonomous" },
                    addedAt: { type: Date, default: () => new Date() },
                    run: {
                        type: new Schema({ status: { type: String, enum: MADDOX_OPEX_RUN_STATUSES }, stage: { type: String, default: null }, error: { type: String, default: null }, updatedAt: { type: Date, default: null } }, { _id: false }),
                        default: null,
                    },
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
        role: { type: String, enum: MADDOX_MEMBER_ROLES, default: "player" },
        status: { type: String, enum: MADDOX_MEMBER_STATUSES, default: "invited" },
        invitedBy: { type: String, default: null },
        joinedAt: { type: Date, default: null },
        characterId: { type: Schema.Types.ObjectId, ref: "MaddoxCharacter", default: null },
    },
    { collection: "maddox_campaign_members", timestamps: true, versionKey: false },
)

MaddoxCampaignMemberSchema.index({ campaignId: 1, userId: 1 }, { unique: true })
// Lista "campanhas em que sou dono ou participante".
MaddoxCampaignMemberSchema.index({ userId: 1, status: 1 })
// Personagens Opex da campanha, na ordem de adição (DND-26).
MaddoxCampaignMemberSchema.index({ campaignId: 1, kind: 1, status: 1 })

export const MaddoxCampaignMemberModel: Model<IMaddoxCampaignMember> =
    (mongoose.models.MaddoxCampaignMember as Model<IMaddoxCampaignMember>) || mongoose.model<IMaddoxCampaignMember>("MaddoxCampaignMember", MaddoxCampaignMemberSchema)
