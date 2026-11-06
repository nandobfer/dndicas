import mongoose from "mongoose"
import { AccessRole, AccessAudit } from "@/features/perfix/server/models"
import { MEMORIES_EDIT_PERMISSION, MEMORIES_VIEW_PERMISSION } from "@/features/engramind/constants"

const MARK_ID = "grant-memories"
const KEYS = [MEMORIES_VIEW_PERMISSION, MEMORIES_EDIT_PERMISSION]

/**
 * Concessão inicial das permissões da rede de memórias (`memories.view` e `memories.edit`, DND-21) aos
 * perfis que têm `admin.access` (o curinga `*` já tem tudo). Roda UMA vez: a marca em `migration_marks`
 * impede que a permissão volte no próximo boot depois que um administrador a retirar de um perfil.
 */
export async function grantMemories(): Promise<void> {
    const marks = mongoose.connection.collection<{ _id: string; at: Date }>("migration_marks")
    if (await marks.findOne({ _id: MARK_ID })) return
    const roles = await AccessRole.find({ permissoes: "admin.access" }).select("_id permissoes").lean<{ _id: unknown; permissoes: string[] }[]>()
    const granted: string[] = []
    for (const role of roles) {
        if (role.permissoes.includes("*") || KEYS.every((key) => role.permissoes.includes(key))) continue
        const result = await AccessRole.updateOne({ _id: role._id }, { $addToSet: { permissoes: { $each: KEYS } }, $inc: { version: 1 } })
        if (result.modifiedCount > 0) granted.push(String(role._id))
    }
    if (granted.length > 0) await AccessAudit.create({ actorId: "system:migration", userId: "system", action: "migration.grant-memories", targetId: "roles", after: { roles: granted, permissions: KEYS } })
    await marks.updateOne({ _id: MARK_ID }, { $setOnInsert: { at: new Date() } }, { upsert: true })
}
