/** Tarifa oficial TypeSafe: entrada US$ 0,042/MTok; saída gratuita. */
export const JEV_INPUT_PRICE_PER_MILLION_USD = 0.042
export const JEV_USAGE_UPDATED_EVENT = "jev-usage-updated"

export interface JevUsage {
    inputTokens: number | null
    outputTokens: number | null
    totalTokens: number | null
    costUsd: number | null
    inputPricePerMillionUsd: number
    usageSource: "api"
}

const tokensOrNull = (value: unknown): number | null =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null

/** Ausência de métricas não significa consumo zero. Não arredonda o custo por chamada. */
export function normalizeJevUsage(usage?: { input_tokens?: unknown; output_tokens?: unknown } | null): JevUsage {
    const inputTokens = tokensOrNull(usage?.input_tokens)
    const outputTokens = tokensOrNull(usage?.output_tokens)
    return {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null,
        costUsd: inputTokens !== null ? inputTokens * JEV_INPUT_PRICE_PER_MILLION_USD / 1_000_000 : null,
        inputPricePerMillionUsd: JEV_INPUT_PRICE_PER_MILLION_USD,
        usageSource: "api",
    }
}

/** Rateio em tokens inteiros e nano-USD; ordem dos IDs deve estar congelada antes da escrita. */
export function allocateJevHistoricalUsage(ids: readonly string[], totalTokens: number, costNanoUsd: number) {
    if (!ids.length || new Set(ids).size !== ids.length) throw new Error("Informe IDs únicos para o rateio")
    if (![totalTokens, costNanoUsd].every((value) => Number.isSafeInteger(value) && value >= 0)) throw new Error("Totais inválidos para o rateio")
    return ids.map((id, index) => ({
        id,
        totalTokens: Math.floor(totalTokens / ids.length) + (index < totalTokens % ids.length ? 1 : 0),
        costUsd: (Math.floor(costNanoUsd / ids.length) + (index < costNanoUsd % ids.length ? 1 : 0)) / 1_000_000_000,
        inputTokens: null,
        outputTokens: null,
        inputPricePerMillionUsd: null,
        usageSource: "historical-allocation" as const,
    }))
}
