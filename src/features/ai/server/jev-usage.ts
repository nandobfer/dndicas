import { dbConnect } from "@/lib/db"
import { AiUsageLog } from "@/lib/db/models/Ai"
import { aiConsumptionOriginLabel } from "../opencode-usage"
import type { JevUsageFeatureRow, JevUsageQuery, JevUsageSummary } from "../jev-usage"

const missing = (field: string) => ({ $eq: [{ $ifNull: [`$${field}`, null] }, null] })
const countMissing = (field: string) => ({ $sum: { $cond: [missing(field), 1, 0] } })

interface TotalRow {
    requests: number
    failedRequests: number
    inputTokens: number
    outputTokens: number
    totalTokens: number
    costUsd: number
    reconstructedRequests: number
    missingInput: number
    missingOutput: number
    missingTokenRequests: number
    missingCostRequests: number
}

interface FeatureRow {
    _id: string | null
    requests: number
    inputTokens: number
    outputTokens: number
    totalTokens: number
    costUsd: number
    missingInput: number
    missingOutput: number
    missingTotal: number
    missingCost: number
}

/** Métrica desconhecida quando todos os registros do recurso não a informam; senão a soma dos informados. */
const metric = (sum: number, missingCount: number, requests: number): number | null =>
    requests > 0 && missingCount === requests ? null : sum

/** Rótulo da feature; registros sem feature aparecem como não identificados. */
function featureLabel(feature: string): string {
    return feature === "unknown" ? "Não identificado" : aiConsumptionOriginLabel(feature)
}

/** Agrega apenas logs JEV retidos; métricas desconhecidas não viram zeros medidos. */
export async function getJevUsage(query: JevUsageQuery): Promise<JevUsageSummary> {
    await dbConnect()
    const filter = {
        provider: "jev",
        ...(query.from || query.to ? { createdAt: {
            ...(query.from ? { $gte: new Date(query.from) } : {}),
            ...(query.to ? { $lte: new Date(query.to) } : {}),
        } } : {}),
    }
    const [result] = await AiUsageLog.aggregate<{ summary: TotalRow[]; features: FeatureRow[] }>([
        { $match: filter },
        { $facet: {
            summary: [
                { $group: {
                    _id: null,
                    requests: { $sum: 1 },
                    failedRequests: { $sum: { $cond: [{ $eq: ["$ok", false] }, 1, 0] } },
                    inputTokens: { $sum: "$inputTokens" },
                    outputTokens: { $sum: "$outputTokens" },
                    totalTokens: { $sum: "$totalTokens" },
                    costUsd: { $sum: "$costUsd" },
                    reconstructedRequests: { $sum: { $cond: [{ $eq: ["$usageSource", "historical-allocation"] }, 1, 0] } },
                    missingInput: countMissing("inputTokens"),
                    missingOutput: countMissing("outputTokens"),
                    missingTokenRequests: countMissing("totalTokens"),
                    missingCostRequests: countMissing("costUsd"),
                } },
            ],
            features: [
                { $group: {
                    _id: "$feature",
                    requests: { $sum: 1 },
                    inputTokens: { $sum: "$inputTokens" },
                    outputTokens: { $sum: "$outputTokens" },
                    totalTokens: { $sum: "$totalTokens" },
                    costUsd: { $sum: "$costUsd" },
                    missingInput: countMissing("inputTokens"),
                    missingOutput: countMissing("outputTokens"),
                    missingTotal: countMissing("totalTokens"),
                    missingCost: countMissing("costUsd"),
                } },
                { $sort: { costUsd: -1, requests: -1 } },
            ],
        } },
    ])
    const summary = result?.summary[0]
    const features: JevUsageFeatureRow[] = (result?.features ?? []).map((row) => {
        const feature = row._id ?? "unknown"
        return {
            feature,
            label: featureLabel(feature),
            requests: row.requests,
            inputTokens: metric(row.inputTokens, row.missingInput, row.requests),
            outputTokens: metric(row.outputTokens, row.missingOutput, row.requests),
            totalTokens: metric(row.totalTokens, row.missingTotal, row.requests),
            costUsd: metric(row.costUsd, row.missingCost, row.requests),
        }
    })
    return {
        requests: summary?.requests ?? 0,
        failedRequests: summary?.failedRequests ?? 0,
        inputTokens: !summary ? 0 : summary.missingInput === summary.requests ? null : summary.inputTokens,
        outputTokens: !summary ? 0 : summary.missingOutput === summary.requests ? null : summary.outputTokens,
        totalTokens: !summary ? 0 : summary.missingTokenRequests === summary.requests ? null : summary.totalTokens,
        costUsd: !summary ? 0 : summary.missingCostRequests === summary.requests ? null : summary.costUsd,
        reconstructedRequests: summary?.reconstructedRequests ?? 0,
        missingTokenRequests: summary?.missingTokenRequests ?? 0,
        missingCostRequests: summary?.missingCostRequests ?? 0,
        features,
    }
}
