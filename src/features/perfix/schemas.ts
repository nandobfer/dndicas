import { z } from "zod"
import { catalog } from "./catalog"
export const objectId = z.string().regex(/^[a-f\d]{24}$/i, "ID inválido")
export const ids = z.array(objectId).max(500).refine(values => new Set(values).size === values.length, "IDs repetidos")
export const versionSchema = z.strictObject({ version: z.number().int().nonnegative() })
export const roleSchema = z.strictObject({
    nome: z.string().trim().min(1, "Informe o nome").max(60), descricao: z.string().trim().max(500),
    cor: z.string().regex(/^[a-z]+$/).max(20), ativo: z.boolean(),
    permissoes: z.array(z.string().refine(key => key !== "*" && catalog.isKnownKey(key), "Permissão desconhecida ou reservada")).max(200),
})
export const roleUpdateSchema = roleSchema.partial().extend({ version: z.number().int().nonnegative(), membros: ids.optional() }).strict()
export const reorderSchema = versionSchema.extend({ ordem: ids.min(1) }).strict()
export const settingsSchema = versionSchema.extend({ defaultRoleId: objectId.nullable() }).strict()
