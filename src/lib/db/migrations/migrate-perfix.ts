import mongoose from "mongoose"
import { AccessRole, RoleHierarchy, PerfixSettings, AccessAudit } from "@/features/perfix/server/models"

/** Idempotente: copia antes de remover o legado; nunca altera atribuições já migradas. */
export async function migratePerfix() {
    await Promise.all([AccessRole.init(), RoleHierarchy.init(), PerfixSettings.init(), AccessAudit.init()])
    const admin = await AccessRole.findOneAndUpdate({ slug: "admin" }, { $setOnInsert: { nome: "Administrador", descricao: "Acesso completo", cor: "vermelho", permissoes: ["*"], ativo: true, version: 0, createdBy: "system:migration" } }, { upsert: true, returnDocument: "after" })
    const common = await AccessRole.findOneAndUpdate({ slug: "user" }, { $setOnInsert: { nome: "Usuário", descricao: "Usuário comum", cor: "azul", permissoes: [], ativo: true, version: 0, createdBy: "system:migration" } }, { upsert: true, returnDocument: "after" })
    await RoleHierarchy.updateOne({ _id: "global" }, { $setOnInsert: { ordem: [String(admin!._id), String(common!._id)], version: 0, fence: 0 } }, { upsert: true })
    await PerfixSettings.updateOne({ _id: "global" }, { $setOnInsert: { defaultRoleId: String(common!._id), version: 0, updatedBy: "system:migration" } }, { upsert: true })
    const users = mongoose.connection.collection("users")
    const legacyIndex = (await users.indexes().catch(() => [])).find(index => index.key.status === 1 && index.key.role === 1)
    if (legacyIndex?.name) await users.dropIndex(legacyIndex.name)
    // Inclui legados que um save() do Mongoose antes da migração gravou com `roles: []`.
    await users.updateMany({ $or: [{ roles: { $exists: false } }, { roles: { $size: 0 }, role: { $exists: true } }] }, [{ $set: { roles: { $cond: [{ $eq: ["$role", "admin"] }, [String(admin!._id)], [String(common!._id)]] }, accessVersion: { $ifNull: ["$accessVersion", 0] } } }])
    // O registro de auditoria é persistido antes do unset para permitir retomar após falhas.
    if (await users.countDocuments({ role: { $exists: true } })) {
        await AccessAudit.create({ actorId: "system:migration", userId: "system", action: "migration.perfix", targetId: "users", after: { admin: String(admin!._id), user: String(common!._id) } })
        await users.updateMany({ "roles.0": { $exists: true }, role: { $exists: true } }, { $unset: { role: "" } })
    }
}
