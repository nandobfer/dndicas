import { randomBytes } from "node:crypto"
import { dbConnect, recordAudit, AcaoAuditoria } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import type { Actor } from "@/features/auth/server/actor"
import { User } from "@/features/users/models/user"
import { OpexFeedbackUserModel } from "../api/opex-feedback-user.model"
import { opexConnection, opexAdminSession } from "./config"
import { portalToken } from "./opex-client"

// Coalesce concurrent mounts per actor. Do not persist tokens or cache access across actors.
const inFlight = new Map<string, Promise<Awaited<ReturnType<typeof provision>>>>()

export async function ensureOpexAccess(actor: Actor) {
    const current = inFlight.get(actor.id)
    if (current) return current
    const pending = provision(actor)
    inFlight.set(actor.id, pending)
    try { return await pending } finally { if (inFlight.get(actor.id) === pending) inFlight.delete(actor.id) }
}

async function provision(actor: Actor) {
    await dbConnect()
    const local = await User.findById(actor.id).select("username email").lean<{ username: string; email?: string }>()
    if (!local) throw new DomainError(401, "Faça login para continuar.", "UNAUTHENTICATED")
    const connection = await opexConnection()
    const { cookie, session } = await opexAdminSession(connection)
    const scope = { opexOrigin: connection.baseUrl, opexClientId: session.clientId }
    const filter = { ...scope, dndicasUserId: actor.id }
    const binding = await OpexFeedbackUserModel.findOne(filter).lean()
    const users = await connection.client.users(cookie)
    const email = local.email?.trim().toLowerCase()
    const username = local.username.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 30).padEnd(3, "_")
    let user = binding ? users.find((item) => item.id === binding.opexUserId) : undefined
    if (!user) user = users.find((item) => !item.isDefault && item.email?.toLowerCase() === email && Boolean(email))
    if (!user) user = users.find((item) => !item.isDefault && item.username.toLowerCase() === username.toLowerCase() && (!item.email || item.email.toLowerCase() === email))
    let created = false
    if (user) {
        if (!user.active || user.isDefault) throw new DomainError(409, "O acesso individual no Opex está desativado. Peça ao administrador para revisá-lo.", "OPEX_USER_CONFLICT")
        const claimed = await OpexFeedbackUserModel.findOne({ ...scope, opexUserId: user.id }).lean()
        if (claimed && claimed.dndicasUserId !== actor.id) throw new DomainError(409, "Esse acesso do Opex já está vinculado a outro usuário.", "OPEX_USER_CONFLICT")
    } else {
        let useEmail = email
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                user = await connection.client.createUser(cookie, { username: attempt ? `${username}-${randomBytes(3).toString("hex")}` : username, ...(useEmail ? { email: useEmail } : {}), admin: false })
                created = true
                break
            } catch (error) {
                if (!(error instanceof DomainError) || !["USERNAME_IN_USE", "EMAIL_IN_USE", "USER_EXISTS"].includes(error.code ?? "")) throw error
                if (["EMAIL_IN_USE", "USER_EXISTS"].includes(error.code ?? "")) useEmail = undefined
            }
        }
    }
    if (!user) throw new DomainError(409, "Não foi possível criar o acesso no Opex. Peça ao administrador para verificar os usuários do cliente.", "OPEX_USER_CONFLICT")
    const token = portalToken(user.portalPath)
    try {
        await OpexFeedbackUserModel.updateOne(filter, { $set: { ...filter, opexUserId: user.id, username: user.username, email: user.email } }, { upsert: true })
    } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) throw new DomainError(409, "Esse acesso do Opex já foi vinculado. Atualize a página ou peça ao administrador para revisar o vínculo.", "OPEX_USER_CONFLICT")
        throw error
    }
    if (!binding || binding.opexUserId !== user.id || created) await recordAudit({ userId: actor.id, entidade: "AcessoOpex", entidadeId: user.id, acao: AcaoAuditoria.CRIAR, depois: { clientId: session.clientId, username: user.username, created } })
    return {
        access: { clientId: session.clientId, clientName: session.clientName, user: { id: user.id, username: user.username, email: user.email }, isAdmin: user.admin, portalUrl: `${connection.baseUrl}/cliente?t=${encodeURIComponent(token)}`, created },
        connection,
        token,
    }
}
