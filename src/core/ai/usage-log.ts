import mongoose, { Schema, Document } from 'mongoose';
import dbConnect from '../database/db';

export interface IUsageLog extends Document {
    modelName: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    userId?: string;
    timestamp: Date;
}

const UsageLogSchema = new Schema<IUsageLog>({
    modelName: { type: String, required: true },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    userId: { type: String },
    timestamp: { type: Date, default: Date.now },
});

const UsageLog = mongoose.models.UsageLog || mongoose.model<IUsageLog>('UsageLog', UsageLogSchema);

/**
 * Registra uso de IA no banco de dados
 * @param model - Nome do modelo utilizado
 * @param inputTokens - Tokens de entrada
 * @param outputTokens - Tokens de saída
 * @param totalTokens - Total de tokens (geralmente inputTokens + outputTokens)
 * @param userId - ID do usuário que realizou a operação (opcional)
 */
export async function logUsage(
    model: string,
    inputTokens: number,
    outputTokens: number,
    totalTokens?: number,
    userId?: string
) {
    try {
        await dbConnect();
        await UsageLog.create({
            modelName: model,
            inputTokens,
            outputTokens,
            totalTokens: totalTokens || (inputTokens + outputTokens),
            userId,
        });
    } catch (e) {
        console.error("Failed to log AI usage:", e);
    }
}
