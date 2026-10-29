import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ updateOne: vi.fn() }))

vi.mock("@/lib/db/models/Integration", () => ({ Integration: { collection: { updateOne: mocks.updateOne } } }))

import { seedIntegrationsFromEnv } from "@/lib/db/migrations/seed-integrations-from-env"
import { decryptSecret } from "@/lib/crypto/secretBox"

const KEY = Buffer.alloc(32, 8).toString("base64")
const callFor = (id: string) => mocks.updateOne.mock.calls.find(([filter]) => filter.integrationId === id && !Object.keys(filter).some((key) => key.startsWith("secretValues")))

describe("migração única do .env para as integrações", () => {
    beforeEach(() => {
        vi.stubEnv("INTEGRATIONS_ENCRYPTION_KEY", KEY)
        vi.stubEnv("S3_ENDPOINT", "http://minio:9000")
        vi.stubEnv("S3_ACCESS_KEY", "chave-s3")
        mocks.updateOne.mockResolvedValue({ upsertedCount: 1, modifiedCount: 0 })
    })

    it("cria cada integração com $setOnInsert (nunca sobrescreve o que o admin editou) e cifra os segredos", async () => {
        await seedIntegrationsFromEnv()
        const [, update, options] = callFor("storage_s3")!
        expect(options).toEqual({ upsert: true })
        expect(Object.keys(update)).toEqual(["$setOnInsert"])
        expect(update.$setOnInsert.publicValues.endpoint).toBe("http://minio:9000")
        expect(JSON.stringify(update.$setOnInsert.secretValues)).not.toContain("chave-s3")
        expect(decryptSecret(update.$setOnInsert.secretValues.accessKey)).toBe("chave-s3")
    })

    it("documento existente só ganha os segredos que nunca foram gravados", async () => {
        mocks.updateOne.mockResolvedValue({ upsertedCount: 0, modifiedCount: 1 })
        await seedIntegrationsFromEnv()
        const backfill = mocks.updateOne.mock.calls.find(([filter]) => filter.integrationId === "storage_s3" && "secretValues.accessKey" in filter)
        expect(backfill![0]["secretValues.accessKey"]).toEqual({ $exists: false })
        expect(decryptSecret(backfill![1].$set["secretValues.accessKey"])).toBe("chave-s3")
    })

    it("sem chave de criptografia não grava segredos (continuam vindo do .env)", async () => {
        vi.stubEnv("INTEGRATIONS_ENCRYPTION_KEY", "")
        await seedIntegrationsFromEnv()
        expect(callFor("storage_s3")![1].$setOnInsert.secretValues).toEqual({})
    })
})
