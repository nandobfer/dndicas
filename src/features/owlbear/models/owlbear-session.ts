import mongoose, { Document, Schema } from "mongoose"

export interface IOwlbearSession extends Document {
    _id: mongoose.Types.ObjectId
    tokenHash: string
    userId: string
    roomId: string
    owlbearPlayerId: string
    owlbearRole: "GM" | "PLAYER"
    expiresAt: Date
    lastUsedAt: Date | null
    revokedAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const OwlbearSessionSchema = new Schema<IOwlbearSession>(
    {
        tokenHash: { type: String, required: true, unique: true, index: true, trim: true },
        userId: { type: String, required: true, index: true, trim: true },
        roomId: { type: String, required: true, index: true, trim: true },
        owlbearPlayerId: { type: String, required: true, index: true, trim: true },
        owlbearRole: { type: String, required: true, enum: ["GM", "PLAYER"] },
        expiresAt: { type: Date, required: true, index: true },
        lastUsedAt: { type: Date, default: null },
        revokedAt: { type: Date, default: null, index: true },
    },
    { timestamps: true, collection: "owlbear_sessions" }
)

OwlbearSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
OwlbearSessionSchema.index({ userId: 1, roomId: 1, owlbearPlayerId: 1, revokedAt: 1 })

export const OwlbearSession =
    (mongoose.models.OwlbearSession as mongoose.Model<IOwlbearSession>) ||
    mongoose.model<IOwlbearSession>("OwlbearSession", OwlbearSessionSchema)
