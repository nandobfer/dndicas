import dbConnect from "../../../../core/database/db"
import { FeedbackOpenCodeModelCacheModel } from "../../api/feedback-opencode-model-cache.model"
import type { OpenCodeModelOption } from "../../types/feedback.types"
import { listOpenCodeModelsWithRawOutput } from "./opencode-cli-service"

const OPENCODE_MODEL_CACHE_KEY = "default"

export interface CachedOpenCodeModels {
    models: OpenCodeModelOption[]
    refreshedAt?: Date
    errorMessage?: string
}

export async function getCachedOpenCodeModels(): Promise<CachedOpenCodeModels | null> {
    await dbConnect()
    const cache = await FeedbackOpenCodeModelCacheModel.findOne({ key: OPENCODE_MODEL_CACHE_KEY }).lean()
    if (!cache) return null

    return {
        models: cache.models ?? [],
        refreshedAt: cache.refreshedAt,
        errorMessage: cache.errorMessage,
    }
}

export async function refreshOpenCodeModelCache(): Promise<CachedOpenCodeModels> {
    await dbConnect()

    try {
        const result = await listOpenCodeModelsWithRawOutput()
        const refreshedAt = new Date()
        const cache = await FeedbackOpenCodeModelCacheModel.findOneAndUpdate(
            { key: OPENCODE_MODEL_CACHE_KEY },
            {
                $set: {
                    key: OPENCODE_MODEL_CACHE_KEY,
                    models: result.models,
                    rawOutput: result.rawOutput,
                    refreshedAt,
                },
                $unset: { errorMessage: "" },
            },
            { new: true, upsert: true },
        ).lean()

        return {
            models: cache?.models ?? result.models,
            refreshedAt: cache?.refreshedAt ?? refreshedAt,
            errorMessage: cache?.errorMessage,
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        await FeedbackOpenCodeModelCacheModel.findOneAndUpdate(
            { key: OPENCODE_MODEL_CACHE_KEY },
            {
                $set: {
                    key: OPENCODE_MODEL_CACHE_KEY,
                    errorMessage,
                },
            },
            { upsert: true },
        )
        throw error
    }
}
