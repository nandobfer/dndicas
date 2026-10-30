import mongoose, { Schema } from "mongoose"

const roleSchema = new Schema({
    slug: { type: String, required: true, unique: true }, nome: { type: String, required: true },
    descricao: { type: String, default: "" }, cor: { type: String, default: "roxo" },
    permissoes: { type: [String], default: [] }, ativo: { type: Boolean, default: true },
    version: { type: Number, default: 0 }, createdBy: String, updatedBy: String,
}, { timestamps: true, collection: "roles" })
const hierarchySchema = new Schema({ _id: String, ordem: { type: [String], default: [] }, version: { type: Number, default: 0 }, fence: { type: Number, default: 0 } }, { collection: "role_hierarchy" })
const settingsSchema = new Schema({ _id: String, defaultRoleId: { type: String, default: null }, version: { type: Number, default: 0 }, updatedBy: String }, { timestamps: true, collection: "perfix_settings" })
const auditSchema = new Schema({ actorId: String, userId: String, action: String, targetId: String, before: Schema.Types.Mixed, after: Schema.Types.Mixed, simulation: Schema.Types.Mixed }, { timestamps: true, collection: "perfix_audits" })
export const AccessRole = mongoose.models.AccessRole as mongoose.Model<mongoose.InferSchemaType<typeof roleSchema>> || mongoose.model("AccessRole", roleSchema)
export const RoleHierarchy = mongoose.models.RoleHierarchy as mongoose.Model<mongoose.InferSchemaType<typeof hierarchySchema>> || mongoose.model("RoleHierarchy", hierarchySchema)
export const PerfixSettings = mongoose.models.PerfixSettings as mongoose.Model<mongoose.InferSchemaType<typeof settingsSchema>> || mongoose.model("PerfixSettings", settingsSchema)
export const AccessAudit = mongoose.models.AccessAudit as mongoose.Model<mongoose.InferSchemaType<typeof auditSchema>> || mongoose.model("AccessAudit", auditSchema)
