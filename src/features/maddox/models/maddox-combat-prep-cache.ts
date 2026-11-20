import mongoose, { Schema, type Model, type Types } from "mongoose"
import type { PrepFingerprint } from "../combat-prep-cache"
import type { CombatPrepOverlay, CombatPrepRider } from "../combat-types"

/**
 * Cache da preparação da mesa de combate (DND-78) — `maddox_combat_prep_caches`. Um por personagem na campanha
 * (`campaignId` + `characterId`, único): a última preparação pronta, com a impressão digital da ficha (já com as correções
 * que o Maddox gravou) e das entidades do catálogo que ela usa. Nunca vale para outra campanha, outro personagem ou outra
 * ficha (`sheetId`). `invalidatedAt` = o dono pediu "Repreparar ficha": o próximo combate prepara a ficha inteira.
 */
export interface IMaddoxCombatPrepCache {
    _id: Types.ObjectId
    campaignId: Types.ObjectId
    characterId: Types.ObjectId
    sheetId: Types.ObjectId
    characterName: string
    fingerprint: PrepFingerprint
    /** Entidades do catálogo citadas pela ficha ou lidas pelo Maddox (`Tipo:id`) e o hash do conteúdo delas. */
    catalog: { ref: string; hash: string }[]
    overlay: CombatPrepOverlay
    riders: CombatPrepRider[]
    preparedAt: Date
    sourcePrepId: Types.ObjectId | null
    sourceCombatId: Types.ObjectId | null
    invalidatedAt: Date | null
    invalidatedBy: string | null
    createdAt: Date
    updatedAt: Date
}

const CacheSchema = new Schema<IMaddoxCombatPrepCache>(
    {
        campaignId: { type: Schema.Types.ObjectId, required: true },
        characterId: { type: Schema.Types.ObjectId, required: true },
        sheetId: { type: Schema.Types.ObjectId, required: true },
        characterName: { type: String, default: "" },
        fingerprint: { type: Schema.Types.Mixed, required: true },
        catalog: { type: Schema.Types.Mixed, default: () => [] },
        overlay: { type: Schema.Types.Mixed, default: () => ({ modify: [], remove: [], add: [], suppress: [] }) },
        riders: { type: Schema.Types.Mixed, default: () => [] },
        preparedAt: { type: Date, required: true },
        sourcePrepId: { type: Schema.Types.ObjectId, default: null },
        sourceCombatId: { type: Schema.Types.ObjectId, default: null },
        invalidatedAt: { type: Date, default: null },
        invalidatedBy: { type: String, default: null },
    },
    { collection: "maddox_combat_prep_caches", timestamps: true, versionKey: false, minimize: false },
)

CacheSchema.index({ campaignId: 1, characterId: 1 }, { unique: true, name: "campaign_character_unique" })

export const MaddoxCombatPrepCacheModel: Model<IMaddoxCombatPrepCache> =
    (mongoose.models.MaddoxCombatPrepCache as Model<IMaddoxCombatPrepCache>) || mongoose.model<IMaddoxCombatPrepCache>("MaddoxCombatPrepCache", CacheSchema)
