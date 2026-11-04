import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import { dropLegacyClerkIndex } from "@/lib/db/migrations/drop-legacy-clerk-index"

let mongo: MongoMemoryServer

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "drop_legacy_clerk_index_test" })
}, 180_000)

afterAll(async () => {
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)

const users = () => mongoose.connection.collection("users")

beforeEach(async () => {
    await users().drop().catch(() => undefined)
})

describe("migração drop-legacy-clerk-index", () => {
    it("reproduz o E11000 do cadastro e libera novos usuários depois de remover o índice", async () => {
        await users().createIndex({ clerkId: 1 }, { unique: true, name: "clerkId_1" })
        await users().insertOne({ email: "legado@example.com", username: "legado" })

        // O usuário novo é gravado sem `clerkId`: num índice único sem `sparse` ele conta como null.
        await expect(users().insertOne({ email: "novo@example.com", username: "novo" })).rejects.toMatchObject({ code: 11000 })

        await dropLegacyClerkIndex()

        await expect(users().insertOne({ email: "novo@example.com", username: "novo" })).resolves.toMatchObject({ acknowledged: true })
        await expect(users().insertOne({ email: "outro@example.com", username: "outro" })).resolves.toMatchObject({ acknowledged: true })
    })

    it("preserva os demais índices e o clerkId dos usuários legados", async () => {
        await users().createIndex({ clerkId: 1 }, { unique: true, name: "clerkId_1" })
        await users().createIndex({ email: 1 }, { unique: true, name: "email_1" })
        await users().createIndex({ legacyClerkId: 1 }, { unique: true, sparse: true, name: "legacyClerkId_1" })
        await users().insertOne({ email: "legado@example.com", clerkId: "clerk_123", legacyClerkId: "clerk_123" })

        await dropLegacyClerkIndex()

        const names = (await users().indexes()).map((index) => index.name)
        expect(names).toEqual(expect.arrayContaining(["email_1", "legacyClerkId_1"]))
        expect(names).not.toContain("clerkId_1")
        expect(await users().countDocuments({ clerkId: "clerk_123" })).toBe(1)
    })

    it("encontra o índice pela chave, não pelo nome", async () => {
        await users().createIndex({ clerkId: 1 }, { unique: true, name: "legacy_clerk_unique" })

        await dropLegacyClerkIndex()

        expect((await users().indexes()).map((index) => index.name)).not.toContain("legacy_clerk_unique")
    })

    it("é idempotente e não falha quando a coleção ainda não existe", async () => {
        await expect(dropLegacyClerkIndex()).resolves.toBeUndefined()

        await users().createIndex({ clerkId: 1 }, { unique: true, name: "clerkId_1" })
        await dropLegacyClerkIndex()
        await expect(dropLegacyClerkIndex()).resolves.toBeUndefined()
        expect((await users().indexes()).map((index) => index.name)).not.toContain("clerkId_1")
    })

    it("está registrada antes das migrações que gravam usuários", async () => {
        const { readFile } = await import("node:fs/promises")
        const registry = await readFile("src/lib/db/migrations/registry.ts", "utf8")
        const dropIndex = registry.indexOf('{ name: "drop-legacy-clerk-index"')
        const perfixIndex = registry.indexOf('{ name: "migrate-perfix"')

        expect(dropIndex).toBeGreaterThan(-1)
        expect(dropIndex).toBeLessThan(perfixIndex)
    })
})
