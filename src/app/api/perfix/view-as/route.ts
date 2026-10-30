import { z } from "zod"
import { requestAccess, denied, roleRows, auditAccess } from "@/features/perfix/server/access"
import { protectedRoute } from "@/features/perfix/server/route"
import { User } from "@/features/users/models/user"
import { encodeViewAs } from "@nandobfer/perfix"
import { resolveAccess } from "@/features/perfix/server/access"
import { objectId } from "@/features/perfix/schemas"
const targetSchema = z.discriminatedUnion("tipo", [z.strictObject({ tipo: z.literal("cargo"), roleId: objectId }), z.strictObject({ tipo: z.literal("usuario"), userId: objectId })]).nullable()
/** Este endpoint ignora o alvo atual para permitir sair mesmo após revogação do alvo. */
export const GET = protectedRoute([], async _req => {
    const real = await requestAccess(true)
    if (!real?.realEffective.has("*")) throw denied()
    const roles = await roleRows()
    const search = new URL(_req.url).searchParams.get("q")?.slice(0, 100) ?? ""
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const rows = await User.find({ status: "active", deleted: { $ne: true }, ...(escaped ? { $or: [{ name: { $regex: escaped, $options: "i" } }, { email: { $regex: escaped, $options: "i" } }, { username: { $regex: escaped, $options: "i" } }] } : {}) }).select("name username email roles _id").sort({ name: 1, _id: 1 }).limit(100).lean()
    return { roles: roles.filter(role => role.ativo).map(role => ({ ...role, coringa: role.permissoes.includes("*") })), users: rows.map(user => ({ id: String(user._id), nome: user.name || user.username, email: user.email, cargos: roles.filter(role => user.roles.includes(role.id)) })) }
}, true)
export const POST = protectedRoute([], async req => {
    const real = await requestAccess(true)
    if (!real?.realEffective.has("*")) throw denied()
    const body = z.strictObject({ kind: z.enum(["inicio", "troca", "fim"]), previous: targetSchema, next: targetSchema }).parse(await req.json())
    if (body.next) await resolveAccess(real.realUserId, encodeViewAs(body.next))
    await auditAccess(real, `view-as.${body.kind}`, real.realUserId, body.previous, body.next)
    return { ok: true }
}, true)
