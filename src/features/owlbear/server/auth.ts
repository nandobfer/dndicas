import { NextResponse } from "next/server"
import { auth } from "@/core/auth/server"
import { CharacterSheet } from "@/features/character-sheets/models/character-sheet"
import {
    buildAnonymousGmSessionUserId,
    buildAnonymousPlayerSessionUserId,
    getOwlbearSessionByToken,
    isAnonymousPlayerSessionUserId,
    toOwlbearAuthContext,
    touchOwlbearSession,
    type OwlbearSessionAuthContext,
} from "./session-service"

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

async function getOwlbearContextFromHeaders(request: Request): Promise<OwlbearSessionAuthContext | null> {
    const roomId = request.headers.get("x-owlbear-room-id")?.trim()
    const owlbearPlayerId = request.headers.get("x-owlbear-player-id")?.trim()
    const role = request.headers.get("x-owlbear-role")?.trim().toUpperCase()

    if (!roomId || !owlbearPlayerId || (role !== "GM" && role !== "PLAYER")) {
        return null
    }

    const { userId } = await auth()
    const fallbackUserId = role === "GM"
        ? buildAnonymousGmSessionUserId({ roomId, owlbearPlayerId })
        : buildAnonymousPlayerSessionUserId({ roomId, owlbearPlayerId })

    return {
        sessionId: `context:${roomId}:${owlbearPlayerId}`,
        userId: userId ?? fallbackUserId,
        roomId,
        owlbearPlayerId,
        owlbearRole: role,
        authMode: "context",
    }
}

export async function requireOwlbearSession(request: Request): Promise<OwlbearSessionAuthContext> {
    const token = getBearerToken(request)
    if (!token) {
        const context = await getOwlbearContextFromHeaders(request)
        if (context) return context
        throw new OwlbearHttpError(401, "Contexto Owlbear inválido ou ausente")
    }

    const session = await getOwlbearSessionByToken(token)
    if (!session) {
        const context = await getOwlbearContextFromHeaders(request)
        if (context) return context
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
    if (
        session.authMode === "token"
        && session.owlbearRole !== "GM"
        && !isAnonymousPlayerSessionUserId(session.userId)
        && ownerUserId !== session.userId
    ) {
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
