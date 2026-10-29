import type { IntegrationLogLevel } from "@/lib/integrations/log-format"

export type TestEmit = (level: IntegrationLogLevel, message: string) => void

export interface TesterContext {
    emit: TestEmit
    signal: AbortSignal
}

/** Resultado "acessível com restrição": o teste passa, mas o status fica amarelo (`warn`). */
export interface TesterWarning {
    status: "warn"
    message: string
}

export type TesterResult = string | TesterWarning

/**
 * Teste de conexão de uma integração. Resolve com a mensagem de sucesso (ou com
 * {@link warnResult} quando está acessível com restrição); lança com uma mensagem acionável em
 * pt-BR quando falha.
 */
export type IntegrationTester = (ctx: TesterContext) => Promise<TesterResult>

export function warnResult(message: string): TesterWarning {
    return { status: "warn", message }
}

export class IntegrationTestError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "IntegrationTestError"
    }
}

export function fail(message: string): never {
    throw new IntegrationTestError(message)
}

/** Timeout por etapa, combinado ao sinal geral do teste. */
export function stepSignal(signal: AbortSignal, ms = 10_000): AbortSignal {
    return AbortSignal.any([signal, AbortSignal.timeout(ms)])
}

export function describeFetchError(error: unknown): string {
    if (error instanceof Error) {
        if (error.name === "TimeoutError" || error.name === "AbortError") return "tempo limite excedido"
        const cause = (error as { cause?: { code?: string; message?: string } }).cause
        if (cause?.code) return `${cause.code}${cause.message ? ` (${cause.message})` : ""}`
        return error.message
    }
    return String(error)
}
