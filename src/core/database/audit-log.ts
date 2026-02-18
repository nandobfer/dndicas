import mongoose, { Schema, Document } from 'mongoose';
import dbConnect from './db';

export interface IAuditLog extends Document {
    action: string;
    collectionName: string;
    documentId: string;
    userId?: string;
    details?: any;
    timestamp: Date;
}

const AuditLogSchema = new Schema<IAuditLog>({
    action: { type: String, required: true },
    collectionName: { type: String, required: true },
    documentId: { type: String, required: true },
    userId: { type: String },
    details: { type: Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now },
});

const AuditLog = mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

export async function logAction(action: string, collection: string, docId: string, userId?: string, details?: any) {
    try {
        await dbConnect();
        await AuditLog.create({
            action,
            collectionName: collection,
            documentId: docId,
            userId,
            details,
        });
    } catch (e) {
        console.error("Failed to write audit log:", e);
    }
}

export default AuditLog;
