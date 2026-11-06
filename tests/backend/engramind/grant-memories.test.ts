import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import { AccessAudit, AccessRole } from "@/features/perfix/server/models"
import { grantMemories } from "@/lib/db/migrations/grant-memories"
import { catalog } from "@/features/perfix/catalog"
import { NAV_PERMISSIONS } from "@/features/perfix/navigation"

let mongo: MongoMemoryServer

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "grant_memories_test" })
}, 180_000)

afterAll(async () => {
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)

const perms = async (id: unknown) => (await AccessRole.findById(id).lean())?.permissoes ?? []

describe("permissões da rede de memórias", () => {
    beforeEach(async () => {
        await Promise.all([AccessRole.deleteMany({}), AccessAudit.deleteMany({}), mongoose.connection.collection("migration_marks").deleteMany({})])
    })

    it("as chaves existem no catálogo e /memorias exige memories.view", () => {
        expect(catalog.normalizePermissionDependencies(["memories.view", "memories.edit"])).toEqual(expect.arrayContaining(["memories.view", "memories.edit"]))
        expect(NAV_PERMISSIONS["/memorias"]).toBe("memories.view")
    })

    it("concede memories.view e memories.edit uma vez aos perfis com admin.access; o marcador impede reaplicar", async () => {
        const root = await AccessRole.create({ slug: "admin", nome: "Administrador", cor: "vermelho", permissoes: ["*"], ativo: true, version: 0 })
        const staff = await AccessRole.create({ slug: "staff", nome: "Equipe", cor: "azul", permissoes: ["admin.access"], ativo: true, version: 1 })
        const user = await AccessRole.create({ slug: "user", nome: "Usuário", cor: "verde", permissoes: ["maddox.play"], ativo: true, version: 0 })
        await grantMemories()
        expect(await perms(root._id)).toEqual(["*"])
        expect(await perms(staff._id)).toEqual(expect.arrayContaining(["admin.access", "memories.view", "memories.edit"]))
        expect(await perms(user._id)).toEqual(["maddox.play"])
        expect(await AccessAudit.countDocuments({ action: "migration.grant-memories" })).toBe(1)

        await AccessRole.updateOne({ _id: staff._id }, { $set: { permissoes: ["admin.access"] } })
        await grantMemories()
        expect(await perms(staff._id)).toEqual(["admin.access"])
    })
})
