import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

/**
 * Consulta ao catálogo do Maddox (entrevistador e narrador): o serviço real do catálogo sobre o MongoDB em memória,
 * só entidades ativas, retornos compactos e em texto puro.
 */

vi.mock("@/core/database/db", () => ({ default: vi.fn(async () => undefined) }))

const { BackgroundModel } = await import("@/features/backgrounds/models/background")
const { MADDOX_CATALOG_TOOLS, runCatalogTool, catalogPlainText, compactCatalogEntity, MaddoxCatalogToolError } = await import("@/features/maddox/server/catalog-tools")

const search = MADDOX_CATALOG_TOOLS.find((tool) => tool.name === "search_catalog")!
const get = MADDOX_CATALOG_TOOLS.find((tool) => tool.name === "get_catalog_entity")!

let mongo: MongoMemoryServer

const origin = (name: string, over: Record<string, unknown> = {}) => ({
    name,
    originalName: `${name} (en)`,
    description: `<p>Origem <strong>${name}</strong>.</p>`,
    source: "Livro do Jogador 2024",
    status: "active",
    suggestedAttributes: ["Força", "Destreza", "Constituição"],
    skillProficiencies: ["Atletismo", "Intimidação"],
    image: "/x.png",
    ...over,
})

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_catalog_tools_test" })
})

afterAll(async () => {
    await mongoose.disconnect()
    await mongo.stop()
})

beforeEach(async () => {
    await BackgroundModel.collection.deleteMany({})
})

describe("search_catalog", () => {
    it("só com o tipo lista as origens ativas (sem as inativas), com resumo em texto puro", async () => {
        await BackgroundModel.collection.insertMany([origin("Soldado"), origin("Acólito"), origin("Herói do Povo", { status: "inactive" })])
        const result = (await runCatalogTool(search, { tipos: ["Origem"] })) as { itens: { nome: string; tipo: string; resumo: string; id: string; fonte?: string }[] }
        expect(result.itens.map((item) => item.nome).sort()).toEqual(["Acólito", "Soldado"])
        const soldier = result.itens.find((item) => item.nome === "Soldado")!
        expect(soldier).toMatchObject({ tipo: "Origem", fonte: "Livro do Jogador 2024", resumo: "Origem Soldado ." })
        expect(soldier.resumo).not.toContain("<")
        expect(soldier.id).toEqual(expect.any(String))
    })

    it("busca pelo nome ignorando acento; nada encontrado traz a nota para não citar", async () => {
        await BackgroundModel.collection.insertMany([origin("Soldado"), origin("Acólito")])
        const found = (await runCatalogTool(search, { consulta: "acolito", tipos: ["Origem"] })) as { itens: { nome: string }[] }
        expect(found.itens[0]!.nome).toBe("Acólito")
        const none = (await runCatalogTool(search, { consulta: "Herói do Povo", tipos: ["Origem"] })) as { itens: unknown[]; nota?: string }
        expect(none.itens).toEqual([])
        expect(none.nota).toContain("não cite")
    })

    it("respeita o limite e corta o resumo em 300 caracteres", async () => {
        await BackgroundModel.collection.insertMany(Array.from({ length: 6 }, (_, index) => origin(`Origem ${index}`, { description: `<p>${"a".repeat(800)}</p>` })))
        const result = (await runCatalogTool(search, { tipos: ["Origem"], limite: 4 })) as { itens: { resumo: string }[] }
        expect(result.itens).toHaveLength(4)
        expect(result.itens[0]!.resumo.length).toBe(300)
        expect(result.itens[0]!.resumo.endsWith("…")).toBe(true)
    })

    it("sem consulta nem tipo, ou com entrada inválida, responde erro em pt-BR", async () => {
        await expect(runCatalogTool(search, {})).rejects.toThrow("Envie `consulta`")
        await expect(runCatalogTool(search, { tipos: ["Planeta"] })).rejects.toBeInstanceOf(MaddoxCatalogToolError)
        await expect(runCatalogTool(search, { tipos: ["Origem"], limite: 99 })).rejects.toThrow("Entrada inválida para search_catalog")
    })
})

describe("get_catalog_entity", () => {
    it("Origem: atributos sugeridos e perícias, sem HTML nem campos internos", async () => {
        const { insertedId } = await BackgroundModel.collection.insertOne(origin("Soldado"))
        const result = (await runCatalogTool(get, { tipo: "Origem", id: String(insertedId) })) as { entidade: Record<string, unknown>; truncated?: string[] }
        expect(result.entidade).toMatchObject({ name: "Soldado", suggestedAttributes: ["Força", "Destreza", "Constituição"], skillProficiencies: ["Atletismo", "Intimidação"], description: "Origem Soldado ." })
        for (const key of ["_id", "image", "status", "createdAt"]) expect(result.entidade).not.toHaveProperty(key)
        expect(result.truncated).toBeUndefined()
    })

    it("id inexistente, inválido ou de entidade inativa: erro em pt-BR que manda buscar o id", async () => {
        const { insertedId } = await BackgroundModel.collection.insertOne(origin("Velho", { status: "inactive" }))
        await expect(runCatalogTool(get, { tipo: "Origem", id: String(insertedId) })).rejects.toThrow(`Origem "${String(insertedId)}" não está no catálogo (ou está inativa). Use search_catalog`)
        await expect(runCatalogTool(get, { tipo: "Origem", id: "nao-e-um-id" })).rejects.toThrow("não está no catálogo")
    })

    it("descrição longa sai cortada com `truncated`", async () => {
        const { insertedId } = await BackgroundModel.collection.insertOne(origin("Longa", { description: "b".repeat(5000) }))
        const result = (await runCatalogTool(get, { tipo: "Origem", id: String(insertedId) })) as { entidade: { description: string }; truncated?: string[] }
        expect(result.entidade.description.length).toBe(4000)
        expect(result.truncated).toEqual(["description"])
    })
})

describe("texto compacto", () => {
    it("tira tags, quebra linhas em blocos e decodifica entidades", () => {
        expect(catalogPlainText("<p>Força &amp; Destreza</p><p>Linha&nbsp;2</p>")).toBe("Força & Destreza\nLinha 2")
    })

    it("limita listas longas e marca o caminho cortado", () => {
        const { entity, truncated } = compactCatalogEntity({ traits: Array.from({ length: 50 }, (_, index) => ({ name: `T${index}`, _id: "x" })) })
        expect((entity.traits as unknown[]).length).toBe(40)
        expect((entity.traits as Record<string, unknown>[])[0]).toEqual({ name: "T0" })
        expect(truncated).toEqual(["traits"])
    })
})
