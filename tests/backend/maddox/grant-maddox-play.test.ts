import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import { AccessAudit, AccessRole, PerfixSettings } from "@/features/perfix/server/models"
import { grantMaddoxPlay } from "@/lib/db/migrations/grant-maddox-play"
import { catalog } from "@/features/perfix/catalog"

let mongo: MongoMemoryServer

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "grant_maddox_play_test" })
}, 180_000)

afterAll(async () => {
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)

async function seed(defaultSlug: "user" | "mesa") {
    const admin = await AccessRole.create({ slug: "admin", nome: "Administrador", cor: "vermelho", permissoes: ["*"], ativo: true, version: 0 })
    const user = await AccessRole.create({ slug: "user", nome: "Usuário", cor: "azul", permissoes: [], ativo: true, version: 0 })
    const mesa = await AccessRole.create({ slug: "mesa", nome: "Mesa", cor: "verde", permissoes: ["users.view"], ativo: true, version: 3 })
    const other = await AccessRole.create({ slug: "outro", nome: "Outro", cor: "roxo", permissoes: [], ativo: true, version: 0 })
    await PerfixSettings.create({ _id: "global", defaultRoleId: String(defaultSlug === "user" ? user._id : mesa._id), version: 0 })
    return { admin, user, mesa, other }
}

const perms = async (id: unknown) => (await AccessRole.findById(id).lean())?.permissoes ?? []

describe("migração grant-maddox-play", () => {
    beforeEach(async () => {
        await Promise.all([AccessRole.deleteMany({}), PerfixSettings.deleteMany({}), AccessAudit.deleteMany({}), mongoose.connection.collection("migration_marks").deleteMany({})])
    })

    it("a chave existe no catálogo do Perfix", () => {
        expect(catalog.normalizePermissionDependencies(["maddox.play"])).toContain("maddox.play")
    })

    it("concede maddox.play ao perfil user e ao perfil padrão, sem tocar nos demais", async () => {
        const roles = await seed("mesa")
        await grantMaddoxPlay()
        expect(await perms(roles.user._id)).toEqual(["maddox.play"])
        expect(await perms(roles.mesa._id)).toEqual(["users.view", "maddox.play"])
        expect((await AccessRole.findById(roles.mesa._id).lean())?.version).toBe(4)
        expect(await perms(roles.other._id)).toEqual([])
        expect(await perms(roles.admin._id)).toEqual(["*"])
        expect(await AccessAudit.countDocuments({ action: "migration.grant-maddox-play" })).toBe(1)
    })

    it("roda uma vez só: depois que o admin retira a permissão, ela não volta", async () => {
        const roles = await seed("user")
        await grantMaddoxPlay()
        await AccessRole.updateOne({ _id: roles.user._id }, { $pull: { permissoes: "maddox.play" } })
        await grantMaddoxPlay()
        expect(await perms(roles.user._id)).toEqual([])
        expect(await AccessAudit.countDocuments({ action: "migration.grant-maddox-play" })).toBe(1)
    })
})
