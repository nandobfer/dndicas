import mongoose from "mongoose"
import { AccessRole, AccessAudit, PerfixSettings } from "@/features/perfix/server/models"
import { MADDOX_OPEX_PERMISSION } from "@/features/maddox/constants"

const MARK_ID = "grant-maddox-opex"

/**
 * Concessão inicial da permissão `maddox.opex` (Campanhas Maddox › Adicionar Personagens Opex, DND-26) ao perfil
 * `user` e ao perfil padrão dos novos usuários. Roda UMA vez: a marca em `migration_marks` impede que a permissão volte
 * no próximo boot depois que um administrador a retirar de um perfil.
 */
export async function grantMaddoxOpex(): Promise<void> {
    const marks = mongoose.connection.collection<{ _id: string; at: Date }>("migration_marks")
    if (await marks.findOne({ _id: MARK_ID })) return
    const settings = await PerfixSettings.findById("global").lean()
    const common = await AccessRole.findOne({ slug: "user" }).select("_id").lean()
    const ids = [...new Set([common?._id ? String(common._id) : null, settings?.defaultRoleId ?? null].filter((id): id is string => Boolean(id)))]
    const granted: string[] = []
    for (const id of ids) {
        if (!mongoose.isValidObjectId(id)) continue
        const result = await AccessRole.updateOne({ _id: id, permissoes: { $nin: ["*", MADDOX_OPEX_PERMISSION] } }, { $addToSet: { permissoes: MADDOX_OPEX_PERMISSION }, $inc: { version: 1 } })
        if (result.modifiedCount > 0) granted.push(id)
    }
    if (granted.length > 0) await AccessAudit.create({ actorId: "system:migration", userId: "system", action: "migration.grant-maddox-opex", targetId: "roles", after: { roles: granted, permission: MADDOX_OPEX_PERMISSION } })
    await marks.updateOne({ _id: MARK_ID }, { $setOnInsert: { at: new Date() } }, { upsert: true })
}
