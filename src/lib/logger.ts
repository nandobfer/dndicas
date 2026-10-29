import pino from "pino"

/** Logger estruturado do app. Nunca use `console.log` em código de produção. */
export const logger = pino({
    level: process.env.LOG_LEVEL || "info",
    base: {
        service: "dndicas",
    },
})

export interface LogBindings {
    userId?: string
    [key: string]: unknown
}

/** Logger filho com contexto (ex.: `userId`, `integrationId`). */
export function loggerFor(bindings: LogBindings) {
    const clean = Object.fromEntries(Object.entries(bindings).filter(([, value]) => value !== undefined))
    return logger.child(clean)
}

export interface ApiErrorLogContext {
    route: string
    method: string
    error: unknown
    userId?: string
    requestId?: string
}

export const logApiError = (context: ApiErrorLogContext) => {
    const err = context.error instanceof Error ? context.error : new Error("Erro desconhecido")
    const errorDetails = context.error instanceof Error ? undefined : context.error

    logger.error(
        {
            err,
            route: context.route,
            method: context.method,
            userId: context.userId,
            requestId: context.requestId,
            errorDetails,
        },
        "API error",
    )
}
