/**
 * @fileoverview Progress store backed by MongoDB.
 *
 * Tracks the last processed index for each provider so that runs can be
 * resumed after interruptions.  Replaces the previous `progress.json` file.
 *
 * Collection: `seed_progress`
 * Document:   `{ providerName: string, lastIndex: number }`
 */

import mongoose, { Schema, Document, Model } from 'mongoose';

// ─── Schema ───────────────────────────────────────────────────────────────────

export interface ProgressRecord {
    providerName: string;
    lastIndex: number;
}

interface ProgressDocument extends ProgressRecord, Document {}

const ProgressSchema = new Schema<ProgressDocument>(
    {
        providerName: { type: String, required: true, unique: true },
        lastIndex: { type: Number, required: true, default: -1 },
    },
    {
        timestamps: true,
        collection: 'seed_progress',
    },
);

let ProgressModel: Model<ProgressDocument> | null = null;

function getModel(): Model<ProgressDocument> {
    if (!ProgressModel) {
        ProgressModel = mongoose.models['seed_progress']
            ? (mongoose.models['seed_progress'] as Model<ProgressDocument>)
            : mongoose.model<ProgressDocument>('seed_progress', ProgressSchema);
    }
    return ProgressModel;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Read the last processed index for a provider.
 * Returns -1 if no progress has been saved yet.
 */
export async function readProgress(providerName: string): Promise<number> {
    const doc = await getModel().findOne({ providerName }).lean();
    return doc?.lastIndex ?? -1;
}

/**
 * Save (upsert) the last processed index for a provider.
 */
export async function saveProgress(providerName: string, index: number): Promise<void> {
    await getModel().updateOne(
        { providerName },
        { $set: { lastIndex: index } },
        { upsert: true },
    );
}

/**
 * Reset progress for a provider (removes its document).
 */
export async function resetProgress(providerName: string): Promise<void> {
    await getModel().deleteOne({ providerName });
}

/**
 * List all saved progress records.
 */
export async function listAllProgress(): Promise<ProgressRecord[]> {
    const docs = await getModel().find({}).lean();
    return docs.map((d) => ({ providerName: d.providerName, lastIndex: d.lastIndex }));
}
