import crypto from "node:crypto"
import dbConnect from "@/core/database/db"
import { OwlbearSession } from "../models/owlbear-session"
import type { OwlbearRole } from "../types"

const DEFAULT_SESSION_TTL_MS = 15 * 60 * 1000
const LAST_USED_TOUCH_WINDOW_MS = 60 * 1000

export function buildAnonymousGmSessionUserId(input: {
    roomId: string
    owlbearPlayerId: string
}) {
    return `owlbear-gm:${input.roomId}:${input.owlbearPlayerId}`
}

export interface OwlbearSessionRecord {
    id: string
    userId: string
    roomId: string
    owlbearPlayerId: string
    owlbearRole: OwlbearRole
    expiresAt: string
    revokedAt: string | null
    lastUsedAt: string | null
}

export interface OwlbearSessionAuthContext {
    sessionId: string
    userId: string
    roomId: string
    owlbearPlayerId: string
    owlbearRole: OwlbearRole
}

function hashToken(token: string) {
    return crypto.createHash("sha256").update(token).digest("hex")
}

function toPlainSession(doc: {
    _id: { toString(): string } | string
    userId: string
    roomId: string
    owlbearPlayerId: string
    owlbearRole: OwlbearRole
    expiresAt: Date
    revokedAt?: Date | null
    lastUsedAt?: Date | null
}): OwlbearSessionRecord {
    return {
        id: String(doc._id),
        userId: doc.userId,
        roomId: doc.roomId,
        owlbearPlayerId: doc.owlbearPlayerId,
        owlbearRole: doc.owlbearRole,
        expiresAt: doc.expiresAt.toISOString(),
        revokedAt: doc.revokedAt ? doc.revokedAt.toISOString() : null,
        lastUsedAt: doc.lastUsedAt ? doc.lastUsedAt.toISOString() : null,
    }
}

export async function createOwlbearSession(input: {
    userId: string
    roomId: string
    owlbearPlayerId: string
    owlbearRole: OwlbearRole
    ttlMs?: number
}) {
    await dbConnect()

    const now = new Date()
    const expiresAt = new Date(now.getTime() + (input.ttlMs ?? DEFAULT_SESSION_TTL_MS))
    const token = crypto.randomBytes(32).toString("base64url")
    const tokenHash = hashToken(token)

    await OwlbearSession.updateMany(
        {
            userId: input.userId,
            roomId: input.roomId,
            owlbearPlayerId: input.owlbearPlayerId,
            revokedAt: null,
            expiresAt: { $gt: now },
        },
        {
            $set: {
                revokedAt: now,
                updatedAt: now,
            },
        }
    )

    const session = await OwlbearSession.create({
        tokenHash,
        userId: input.userId,
        roomId: input.roomId,
        owlbearPlayerId: input.owlbearPlayerId,
        owlbearRole: input.owlbearRole,
        expiresAt,
        lastUsedAt: now,
        revokedAt: null,
    })

    return {
        token,
        expiresAt: expiresAt.toISOString(),
        session: toPlainSession(session),
    }
}

export async function getOwlbearSessionByToken(token: string) {
    await dbConnect()

    const now = new Date()
    const session = await OwlbearSession.findOne({
        tokenHash: hashToken(token),
        revokedAt: null,
        expiresAt: { $gt: now },
    }).lean()

    if (!session) return null

    return toPlainSession(session)
}

export async function touchOwlbearSession(sessionId: string, currentLastUsedAt: string | null) {
    await dbConnect()

    const now = new Date()
    const lastUsedAt = currentLastUsedAt ? new Date(currentLastUsedAt) : null
    if (lastUsedAt && now.getTime() - lastUsedAt.getTime() < LAST_USED_TOUCH_WINDOW_MS) {
        return
    }

    await OwlbearSession.updateOne(
        { _id: sessionId, revokedAt: null },
        {
            $set: {
                lastUsedAt: now,
                updatedAt: now,
            },
        }
    )
}

export function toOwlbearAuthContext(session: OwlbearSessionRecord): OwlbearSessionAuthContext {
    return {
        sessionId: session.id,
        userId: session.userId,
        roomId: session.roomId,
        owlbearPlayerId: session.owlbearPlayerId,
        owlbearRole: session.owlbearRole,
    }
}
