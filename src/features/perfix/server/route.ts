import { NextResponse, type NextRequest } from "next/server"
import { ZodError } from "zod"
import { DomainError } from "@/lib/api/route"
import { requireAccess, type AccessContext } from "./access"
import { logger } from "@/lib/logger"

export function protectedRoute<P extends Record<string, string> = Record<string, never>>(keys: string[], handler: (req: NextRequest, params: P, access: AccessContext) => Promise<unknown>, realOnly = false) {
    return async (req: NextRequest, context?: { params: Promise<P> }) => {
        try {
            if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
                const origin = req.headers.get("origin")
                if (origin && origin !== new URL(req.url).origin) throw new DomainError(403, "Origem da requisição não permitida")
            }
            const access = realOnly ? await (await import("./access")).requestAccess(true) : await requireAccess(...keys)
            if (!access) throw new DomainError(401, "Faça login para continuar.", "UNAUTHORIZED")
            const { requirePermissions } = await import("./access")
            requirePermissions(access, ...keys)
            const data = await handler(req, context ? await context.params : {} as P, access)
            return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } })
        } catch (error) {
            if (error instanceof ZodError) return NextResponse.json({ success: false, error: error.issues[0]?.message ?? "Dados inválidos", code: "VALIDATION_ERROR" }, { status: 400 })
            if (error instanceof SyntaxError) return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 })
            if (error instanceof DomainError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } })
            logger.error({ err: error }, "Falha na operação Perfix")
            return NextResponse.json({ success: false, error: "Não foi possível concluir a operação" }, { status: 500 })
        }
    }
}
