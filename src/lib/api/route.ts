import type { NextRequest } from "next/server"
import type { ZodType } from "zod"
import { logApiError } from "@/lib/logger"
import { fail, validationError } from "./responses"

/** Erro de regra de negócio com status HTTP (respondido como `ApiResponse` pelo `withRoute`). */
export class DomainError extends Error {
    constructor(
        readonly status: number,
        message: string,
        readonly code?: string,
        readonly details?: unknown,
    ) {
        super(message)
        this.name = "DomainError"
    }
}

export interface RouteArgs<P extends Record<string, string>> {
    req: NextRequest
    params: P
}

/**
 * Wrapper das rotas do app. O acesso é barrado pelo `middleware` (sessão de senha única);
 * `DomainError` vira a resposta padronizada; qualquer outro erro é logado e vira 500.
 */
export function withRoute<P extends Record<string, string> = Record<string, never>>(handler: (args: RouteArgs<P>) => Promise<Response>) {
    return async (req: NextRequest, context: { params: Promise<P> }) => {
        try {
            const params = context?.params ? await context.params : ({} as P)
            return await handler({ req, params })
        } catch (error) {
            if (error instanceof DomainError) return fail(error.status, error.message, error.code, error.details)
            logApiError({ route: req.nextUrl?.pathname ?? "", method: req.method, error })
            return fail(500, "Erro interno. Tente novamente.")
        }
    }
}

/** Lê e valida o corpo JSON com o schema Zod; devolve a resposta 400 pronta em caso de erro. */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
    let raw: unknown
    try {
        raw = await req.json()
    } catch {
        return { ok: false, response: fail(400, "Corpo da requisição inválido", "INVALID_JSON") }
    }
    const parsed = schema.safeParse(raw)
    if (!parsed.success) return { ok: false, response: validationError(parsed.error) }
    return { ok: true, data: parsed.data }
}
