import mongoose, { Schema, type Model, type Types } from "mongoose"
import {
    MADDOX_SCENE_IMAGE_SLOTS,
    MADDOX_SCENE_IMAGE_SOURCES,
    MADDOX_SCENE_IMAGE_STATUSES,
    type MaddoxSceneImageSlot,
    type MaddoxSceneImageSource,
    type MaddoxSceneImageStatus,
} from "../constants"

/** Entidade do catálogo citada na imagem (tipo da marcação `{{Tipo:Nome}}` e id). */
export interface IMaddoxSceneImageCatalogRef {
    type: string
    id: string
}

/**
 * Imagem gerada pelo Maddox (Maddox 10) — `maddox_scene_images`. Uma por pedido: cena da narração (ferramenta), fim de
 * batalha, pedido manual do dono ou retrato de NPC. `counts` marca se ela ocupa a cota (frequência e teto diário):
 * `failed` e `skipped` liberam a vaga. `description` (pedido ao gerador) nunca chega à tela.
 */
export interface IMaddoxSceneImage {
    _id: Types.ObjectId
    campaignId: Types.ObjectId
    turnNumber: number
    segment: number
    /** Mensagem a que a imagem pertence (narração ou card de fim de combate); `null` no retrato. */
    messageId: Types.ObjectId | null
    /** NPC do retrato (`source: "npc-portrait"`). */
    npcId: Types.ObjectId | null
    source: MaddoxSceneImageSource
    slot: MaddoxSceneImageSlot
    /** Situação fixa ou id da personalizada; `null` no pedido manual. */
    situation: string | null
    description: string
    caption: string
    references: { characters: string[]; npcs: string[]; catalog: IMaddoxSceneImageCatalogRef[] }
    referencesUsed: number
    status: MaddoxSceneImageStatus
    counts: boolean
    url: string | null
    key: string | null
    error: string | null
    /** Motivo interno de `skipped` (log e testes). */
    skipReason: string | null
    jevScore: number | null
    requestedBy: string | null
    startedAt: Date | null
    completedAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const MaddoxSceneImageSchema = new Schema<IMaddoxSceneImage>(
    {
        campaignId: { type: Schema.Types.ObjectId, ref: "MaddoxCampaign", required: true },
        turnNumber: { type: Number, default: 0 },
        segment: { type: Number, default: 0 },
        messageId: { type: Schema.Types.ObjectId, default: null },
        npcId: { type: Schema.Types.ObjectId, ref: "MaddoxNpc", default: null },
        source: { type: String, enum: MADDOX_SCENE_IMAGE_SOURCES, required: true },
        slot: { type: String, enum: MADDOX_SCENE_IMAGE_SLOTS, required: true },
        situation: { type: String, default: null },
        description: { type: String, default: "" },
        caption: { type: String, default: "" },
        references: {
            characters: { type: [String], default: [] },
            npcs: { type: [String], default: [] },
            catalog: { type: [new Schema<IMaddoxSceneImageCatalogRef>({ type: String, id: String }, { _id: false })], default: [] },
        },
        referencesUsed: { type: Number, default: 0 },
        status: { type: String, enum: MADDOX_SCENE_IMAGE_STATUSES, default: "pending" },
        counts: { type: Boolean, default: true },
        url: { type: String, default: null },
        key: { type: String, default: null },
        error: { type: String, default: null },
        skipReason: { type: String, default: null },
        jevScore: { type: Number, default: null },
        requestedBy: { type: String, default: null },
        startedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null },
    },
    { collection: "maddox_scene_images", timestamps: true, versionKey: false },
)

// Teto diário e intervalo: imagens da campanha por data.
MaddoxSceneImageSchema.index({ campaignId: 1, createdAt: -1 })
// DTO da mesa: imagens das mensagens da página.
MaddoxSceneImageSchema.index({ messageId: 1 })
MaddoxSceneImageSchema.index({ npcId: 1 })
// Uma imagem automática (ferramenta ou fim de combate) por turno do mestre: resolve pedidos concorrentes.
MaddoxSceneImageSchema.index({ campaignId: 1, turnNumber: 1, slot: 1 }, { unique: true, partialFilterExpression: { counts: true, slot: "auto" }, name: "scene_image_auto_per_turn" })

export const MaddoxSceneImageModel: Model<IMaddoxSceneImage> =
    (mongoose.models.MaddoxSceneImage as Model<IMaddoxSceneImage>) || mongoose.model<IMaddoxSceneImage>("MaddoxSceneImage", MaddoxSceneImageSchema)
