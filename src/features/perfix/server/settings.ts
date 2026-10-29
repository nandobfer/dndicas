import type { ClientSession } from "mongoose"
import { dbConnect } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { PerfixSettings } from "./models"
import { evaluateRoleAssignment, getUngrantableKeys } from "@nandobfer/perfix"
import { catalog } from "../catalog"
import { authorityTransaction, auditAccess, conflict, denied, roleRows, type AccessContext } from "./access"
import { settingsSchema } from "../schemas"
import { logger } from "@/lib/logger"

export async function getDefaultRoleId(session: ClientSession | null = null): Promise<string> {
    const setting = await PerfixSettings.findById("global").session(session)
    const roles = await roleRows(session)
    const role = roles.find(role => role.id === setting?.defaultRoleId)
    if (!role || !role.ativo || role.slug === "admin" || role.permissoes.includes("*")) {
        logger.warn({ defaultRoleId: setting?.defaultRoleId ?? null, code: "SIGNUP_UNAVAILABLE" }, "Cadastro bloqueado: perfil padrão Perfix indisponível")
        throw new DomainError(503, "Cadastro indisponível: configure um perfil padrão válido na integração Perfix.", "SIGNUP_UNAVAILABLE")
    }
    return role.id
}
export async function signupRoleIds(): Promise<string[]> {
    await dbConnect()
    return [await getDefaultRoleId()]
}
export async function getSettings() {
    const settings = await PerfixSettings.findById("global").lean()
    return { defaultRoleId: settings?.defaultRoleId ?? null, version: settings?.version ?? 0, roleOptions: await roleRows() }
}
export async function updateSettings(context: AccessContext, raw: unknown) {
    const data = settingsSchema.parse(raw)
    return authorityTransaction(context, ["integrations.perfix.edit"], async (current, session) => {
        const roles = await roleRows(session)
        const role = roles.find(role => role.id === data.defaultRoleId)
        if (data.defaultRoleId && (!role?.ativo || role.slug === "admin" || role.permissoes.includes("*"))) throw new DomainError(400, "Selecione um perfil ativo que não seja administrador.")
        // O padrão é concedido a toda conta nova: o chamador só escolhe perfis que ele próprio poderia atribuir.
        if (role && (evaluateRoleAssignment({ catalog, callerCargos: current.roles, requested: [role.id], current: [], loaded: roles }).status !== "ok" || getUngrantableKeys(current.effective, role.permissoes).length)) throw denied("Você não pode definir como padrão um perfil com permissões que não pode conceder.")
        const before = await PerfixSettings.findById("global").session(session)
        const result = await PerfixSettings.updateOne({ _id: "global", version: data.version }, { $set: { defaultRoleId: data.defaultRoleId, updatedBy: current.realUserId }, $inc: { version: 1 } }, { session })
        if (!result.matchedCount) throw conflict()
        await auditAccess(current, "settings.update", "global", before?.toObject(), data, session)
        return { defaultRoleId: data.defaultRoleId, version: data.version + 1 }
    })
}
