import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import { vi } from "vitest"
import { createFakeEngramind, FAKE_APP_TOKEN, FAKE_BASE_URL, type FakeEngramind } from "../../helpers/fake-engramind"

/**
 * Mock de `@/lib/db` para os testes da integração: `dbConnect` não conecta (a conexão é a do banco em
 * memória, aberta por `startDb`) nem roda as migrações; o resto do módulo é o real.
 */
export async function libDbMock(importOriginal: () => Promise<unknown>) {
    return { ...((await importOriginal()) as object), dbConnect: vi.fn(async () => mongoose) }
}

/**
 * Banco em memória + Engramind falso (no `fetch` global) para os testes da integração. A integração
 * `engramind` é gravada no banco como a tela grava (segredos cifrados com uma chave de teste).
 */

export const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64")

export async function startDb(dbName: string): Promise<MongoMemoryServer> {
    const mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName })
    return mongo
}

export async function stopDb(mongo: MongoMemoryServer | undefined): Promise<void> {
    await mongoose.disconnect()
    await mongo?.stop()
}

export async function clearDb(): Promise<void> {
    const db = mongoose.connection.db
    if (!db) return
    for (const collection of await db.collections()) await collection.deleteMany({})
}

/** Grava a integração configurada (URL + token do app) e liga o Engramind falso. */
export async function configureEngramind(options: { fake?: FakeEngramind; appToken?: string; publicAppUrl?: string | null } = {}): Promise<FakeEngramind> {
    vi.stubEnv("INTEGRATIONS_ENCRYPTION_KEY", TEST_ENCRYPTION_KEY)
    const fake = options.fake ?? createFakeEngramind()
    vi.stubGlobal("fetch", fake.fetch)
    const [{ Integration }, { encryptSecret }, { invalidateStoredIntegrations }] = await Promise.all([import("@/lib/db/models/Integration"), import("@/lib/crypto/secretBox"), import("@/lib/integrations/store")])
    await Integration.updateOne(
        { integrationId: "engramind" },
        {
            $set: {
                environment: "externo",
                debugMode: false,
                publicValues: { baseUrl: FAKE_BASE_URL, ...(options.publicAppUrl === null ? {} : { publicAppUrl: options.publicAppUrl ?? "https://dndicas.test" }) },
                secretValues: { appToken: encryptSecret(options.appToken ?? FAKE_APP_TOKEN) },
                createdBy: "test",
                updatedBy: "test",
            },
        },
        { upsert: true },
    )
    invalidateStoredIntegrations()
    return fake
}

export async function resetEngramindRuntime(): Promise<void> {
    const [{ resetEngramindLazyForTests }, { invalidateCategoryCache }, { resetCampaignNetworksForTests }, { invalidateStoredIntegrations }, { resetCampaignMemoriesForTests }] = await Promise.all([
        import("@/features/engramind/server/client"),
        import("@/features/engramind/server/categories"),
        import("@/features/engramind/server/campaign-channels"),
        import("@/lib/integrations/store"),
        import("@/features/engramind/server/campaign-memories"),
    ])
    resetCampaignMemoriesForTests()
    resetEngramindLazyForTests({ waitMs: 3000 })
    invalidateCategoryCache()
    resetCampaignNetworksForTests()
    invalidateStoredIntegrations()
}
