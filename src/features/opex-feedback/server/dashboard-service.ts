import type { Actor } from "@/features/auth/server/actor"
import { DomainError } from "@/lib/api/route"
import { dashboardRangeSchema, dashboardSchema } from "../schemas"
import { ensureOpexAccess } from "./access-service"

export async function getOpexDashboard(actor: Actor, input: unknown) {
    const range = dashboardRangeSchema.safeParse(input)
    if (!range.success) throw new DomainError(400, "Período ou fuso horário inválido.", "INVALID_RANGE")
    const { connection, token, access } = await ensureOpexAccess(actor)
    let cookie = await connection.client.login(token)
    cookie = await connection.client.selectClient(cookie, access.clientId)
    // Never fall back to the admin session: errors must not widen permissions.
    const session = await connection.client.session(cookie)
    if (session.clientId !== access.clientId || session.user.id !== access.user.id) throw new DomainError(502, "O Opex retornou uma sessão diferente da solicitada.", "OPEX_UNAVAILABLE")
    const data = await connection.client.request(`/api/cliente/dashboard?${new URLSearchParams(range.data)}`, cookie, dashboardSchema)
    if (!session.isAdmin) data.finance = null
    return data
}
