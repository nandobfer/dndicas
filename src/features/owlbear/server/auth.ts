import { NextResponse } from "next/server"
import { CharacterSheet } from "@/features/character-sheets/models/character-sheet"
import { getOwlbearSessionByToken, toOwlbearAuthContext, touchOwlbearSession, type OwlbearSessionAuthContext } from "./session-service"

export class OwlbearHttpError extends Error {
    status: number

    constructor(status: number, message: string) {
        super(message)
        this.status = status
    }
}

function getBearerToken(request: Request) {
    const authorization = request.headers.get("authorization") ?? request.headers.get("Authorization")
    if (!authorization) return null

    const [scheme, token] = authorization.split(" ")
    if (scheme !== "Bearer" || !token) return null
    return token
}

export async function requireOwlbearSession(request: Request): Promise<OwlbearSessionAuthContext> {
    const token = getBearerToken(request)
    if (!token) {
        throw new OwlbearHttpError(401, "Sessão Owlbear inválida ou ausente")
    }

    const session = await getOwlbearSessionByToken(token)
    if (!session) {
        throw new OwlbearHttpError(401, "Sessão Owlbear inválida ou expirada")
    }

    void touchOwlbearSession(session.id, session.lastUsedAt)

    return toOwlbearAuthContext(session)
}

export async function requireOwlbearSheetAccess(request: Request, sheetId: string) {
    const session = await requireOwlbearSession(request)
    const sheet = await CharacterSheet.findById(sheetId, { userId: 1, username: 1 }).lean()

    if (!sheet) {
        throw new OwlbearHttpError(404, "Ficha não encontrada")
    }

    const ownerUserId = String((sheet as { userId: string }).userId)
    if (session.owlbearRole !== "GM" && ownerUserId !== session.userId) {
        throw new OwlbearHttpError(403, "Acesso Owlbear não autorizado para esta ficha")
    }

    return {
        session,
        sheet: {
            id: sheetId,
            userId: ownerUserId,
            username: (sheet as { username?: string }).username ?? "",
        },
    }
}

export function owlbearErrorResponse(error: unknown, context: string) {
    if (error instanceof OwlbearHttpError) {
        return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error(context, error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
}
