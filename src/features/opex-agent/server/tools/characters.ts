import { z } from "zod"
import { Types } from "mongoose"
import dbConnect from "@/core/database/db"
import { createBlankSheet, getAllUserSheets, getSheetById, patchSheet } from "@/features/character-sheets/api/character-sheets-service"
import type { PatchSheetBody } from "@/features/character-sheets/types/character-sheet.types"
import { UserNpcModel } from "@/features/monsters/models/user-npc"
import { User } from "@/features/users/models/user"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import type { OpexServerScope } from "../scope"
import { defineTool, OpexToolError } from "./define"
import { isObjectId, parseJsonObject } from "./json"

/**
 * Fichas de personagem e NPCs do **próprio usuário** (logado). O dono é sempre o usuário do turno,
 * revalidado no banco: nunca há acesso às fichas ou NPCs de outra pessoa.
 */

function userIdOf(scope: OpexServerScope): string {
    if (scope.kind !== "user") throw new OpexToolError("Faça login para usar fichas e NPCs.")
    return scope.actor.id
}

const sheetId = z.string().trim().regex(/^[a-f0-9]{24}$/i, "Id inválido").describe("Id da ficha (de list_my_sheets)")

/** Campos que o agente não pode alterar numa ficha (dono, identificação e datas). */
const PROTECTED_SHEET_FIELDS = new Set(["_id", "id", "userId", "username", "slug", "createdAt", "updatedAt", "__v"])

const slimSheet = (sheet: Record<string, unknown>) => ({
    id: String(sheet._id ?? sheet.id),
    name: sheet.name ?? null,
    slug: sheet.slug ?? null,
    class: sheet.class ?? null,
    subclass: sheet.subclass ?? null,
    race: sheet.race ?? null,
    level: sheet.level ?? null,
    armorClass: sheet.armorClass ?? null,
    updatedAt: sheet.updatedAt ?? null,
})

export const characterTools = [
    defineTool({
        name: "list_my_sheets",
        group: "characters",
        label: "Listar minhas fichas",
        risk: "read",
        minRole: "user",
        description: "Fichas de personagem do usuário logado (nome, classe, raça, nível), com busca e paginação.",
        input: z.object({ search: z.string().trim().max(120).optional(), page: z.number().int().min(1).optional() }),
        execute: async (input, context) => {
            const result = await getAllUserSheets(userIdOf(context.scope), input.search, input.page ?? 1, 20)
            return { ...result, sheets: result.sheets.map((sheet) => slimSheet(sheet as unknown as Record<string, unknown>)) }
        },
    }),
    defineTool({
        name: "get_my_sheet",
        group: "characters",
        label: "Ler ficha",
        risk: "read",
        minRole: "user",
        description: "Ficha completa do usuário logado: atributos, perícias, itens, magias, habilidades, talentos e ataques.",
        input: z.object({ id: sheetId }),
        execute: async (input, context) => {
            const userId = userIdOf(context.scope)
            const sheet = await getSheetById(input.id)
            if (!sheet || String((sheet as { userId?: string }).userId) !== userId) throw new OpexToolError("Ficha não encontrada entre as suas. Use list_my_sheets.")
            return sheet
        },
    }),
    defineTool({
        name: "create_sheet",
        group: "characters",
        label: "Criar ficha",
        risk: "write",
        minRole: "user",
        description: "Cria uma ficha de personagem em branco para o usuário logado (depois preencha com update_sheet).",
        input: z.object({ name: z.string().trim().min(1).max(120).optional().describe("Nome do personagem") }),
        summarize: (input) => `Criar a ficha "${input.name ?? "Nova Ficha"}"`,
        execute: async (input, context) => {
            const userId = userIdOf(context.scope)
            await dbConnect()
            const user = await User.findById(userId).select("username").lean<{ username?: string }>()
            const sheet = await createBlankSheet(userId, user?.username ?? "", input.name)
            await recordAudit({ userId, entidade: "CharacterSheet", entidadeId: String(sheet._id), acao: AcaoAuditoria.CRIAR, depois: { nome: sheet.name, origem: "agente-opex" } })
            return { ok: true, ...slimSheet(sheet as unknown as Record<string, unknown>) }
        },
    }),
    defineTool({
        name: "update_sheet",
        group: "characters",
        label: "Editar ficha",
        risk: "write",
        minRole: "user",
        description:
            "Altera campos da ficha do usuário logado (os mesmos de get_my_sheet: name, class, race, level, atributos, perícias, notas...). Itens, magias, habilidades e ataques não são alterados por aqui.",
        input: z.object({
            id: sheetId,
            fieldsJson: z.string().trim().min(2).max(20_000).describe('Objeto JSON com os campos a alterar, ex.: {"level": 5, "notes": "..."}'),
        }),
        summarize: (input) => `Editar a ficha ${input.id}`,
        execute: async (input, context) => {
            const userId = userIdOf(context.scope)
            const fields = parseJsonObject(input.fieldsJson, "fieldsJson")
            const blocked = Object.keys(fields).filter((key) => PROTECTED_SHEET_FIELDS.has(key) || key.startsWith("$"))
            if (blocked.length) throw new OpexToolError(`Campos que não podem ser alterados: ${blocked.join(", ")}`)
            const updated = await patchSheet(input.id, userId, fields as PatchSheetBody)
            if (!updated) throw new OpexToolError("Ficha não encontrada entre as suas. Use list_my_sheets.")
            await recordAudit({ userId, entidade: "CharacterSheet", entidadeId: input.id, acao: AcaoAuditoria.ATUALIZAR, depois: { campos: Object.keys(fields), origem: "agente-opex" } })
            return { ok: true, ...slimSheet(updated as unknown as Record<string, unknown>) }
        },
    }),
    defineTool({
        name: "list_my_npcs",
        group: "characters",
        label: "Listar meus NPCs",
        risk: "read",
        minRole: "user",
        description: "NPCs (criaturas próprias) do usuário logado, com nome, tipo, tamanho e nível de desafio.",
        input: z.object({ search: z.string().trim().max(120).optional() }),
        execute: async (input, context) => {
            const userId = userIdOf(context.scope)
            await dbConnect()
            const query: Record<string, unknown> = { userId }
            if (input.search) query.name = { $regex: input.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" }
            const npcs = await UserNpcModel.find(query).sort({ name: 1 }).limit(100).select("name type size challengeRating source").lean<Array<Record<string, unknown>>>()
            return { items: npcs.map((npc) => ({ id: String(npc._id), name: npc.name, type: npc.type ?? null, size: npc.size ?? null, challengeRating: npc.challengeRating ?? null })), total: npcs.length }
        },
    }),
    defineTool({
        name: "get_my_npc",
        group: "characters",
        label: "Ler NPC",
        risk: "read",
        minRole: "user",
        description: "NPC completo do usuário logado (bloco de estatísticas).",
        input: z.object({ id: z.string().trim().describe("Id do NPC (de list_my_npcs)") }),
        execute: async (input, context) => {
            const userId = userIdOf(context.scope)
            if (!isObjectId(input.id)) throw new OpexToolError("Id inválido")
            await dbConnect()
            const npc = await UserNpcModel.findOne({ _id: new Types.ObjectId(input.id), userId }).lean<Record<string, unknown>>()
            if (!npc) throw new OpexToolError("NPC não encontrado entre os seus. Use list_my_npcs.")
            return { ...npc, id: String(npc._id), _id: String(npc._id) }
        },
    }),
]
