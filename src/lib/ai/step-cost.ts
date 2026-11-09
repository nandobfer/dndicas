/**
 * Custo dos passos de geração (módulo PURO, sem SDK): fica fora do `stream.ts` para que os loops
 * próprios das features (Agente Opex, Maddox, Entender com IA) somem o custo mesmo quando os testes
 * mockam o ponto de entrada de streaming.
 */

function finiteOrNull(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null
}

/** Custo em USD de um passo: `opencode.cost` (sessão no host) ou `opencode-go.costUsd` (cobrado + allowance do Go). */
export function stepCostUsd(providerMetadata: unknown): number | null {
    if (!providerMetadata || typeof providerMetadata !== "object") return null
    const meta = providerMetadata as Record<string, { cost?: unknown; costUsd?: unknown } | undefined>
    const costs = [meta.opencode?.cost, meta["opencode-go"]?.costUsd].map(finiteOrNull).filter((value): value is number => value !== null)
    return costs.length ? costs.reduce((total, value) => total + value, 0) : null
}
