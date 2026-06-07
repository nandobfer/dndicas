import mongoose, { Schema, Document, Model } from "mongoose"

export type OwlbearRoomNpcSourceKind = "userNpc" | "monster"

export interface IOwlbearRoomNpc extends Document {
    _id: mongoose.Types.ObjectId
    roomId: string
    userId: string
    sourceKind: OwlbearRoomNpcSourceKind
    sourceId: string
    hpCurrent: number
    hpMax: number
    createdAt: Date
    updatedAt: Date
}

const OwlbearRoomNpcSchema = new Schema<IOwlbearRoomNpc>(
    {
        roomId: { type: String, required: true, index: true, trim: true },
        userId: { type: String, required: true, index: true },
        sourceKind: { type: String, required: true, enum: ["userNpc", "monster"] },
        sourceId: { type: String, required: true, trim: true },
        hpCurrent: { type: Number, required: true, min: 0, default: 0 },
        hpMax: { type: Number, required: true, min: 0, default: 0 },
    },
    {
        timestamps: true,
        collection: "owlbear_room_npcs",
    },
)

OwlbearRoomNpcSchema.index({ roomId: 1, userId: 1, updatedAt: -1 })
OwlbearRoomNpcSchema.index({ roomId: 1, sourceKind: 1, sourceId: 1 })

export const OwlbearRoomNpc: Model<IOwlbearRoomNpc> =
    (mongoose.models.OwlbearRoomNpc as Model<IOwlbearRoomNpc>)
    || mongoose.model<IOwlbearRoomNpc>("OwlbearRoomNpc", OwlbearRoomNpcSchema)
