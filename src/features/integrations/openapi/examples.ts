import type { NormalizedSpec, OperationParameter, SchemaNode } from "./types"

/**
 * Utilitários puros do explorador (cliente): exemplo de corpo gerado a partir do schema,
 * resolução de `{ ref }` e montagem/validação dos valores dos parâmetros.
 */

const MAX_DEPTH = 6

export function resolveSchema(node: SchemaNode | undefined, schemas: NormalizedSpec["schemas"]): SchemaNode | undefined {
    let current = node
    const seen = new Set<string>()
    while (current?.ref) {
        if (seen.has(current.ref)) return undefined
        seen.add(current.ref)
        const target = schemas[current.ref]
        if (!target) return undefined
        // Metadados locais (descrição do campo) prevalecem sobre os do schema referenciado.
        const { ref: _ref, ...local } = current
        void _ref
        current = { ...target, ...local }
    }
    return current
}

function exampleForFormat(format: string | undefined): string {
    switch (format) {
        case "date":
            return "2026-01-31"
        case "date-time":
            return "2026-01-31T12:00:00Z"
        case "time":
            return "12:00:00"
        case "email":
            return "usuario@exemplo.com"
        case "uuid":
            return "00000000-0000-4000-8000-000000000000"
        case "uri":
        case "url":
            return "https://exemplo.com"
        default:
            return "string"
    }
}

/**
 * Exemplo para um schema: `example` → `default` → primeiro `enum` → gerado pelo tipo. Campos
 * `readOnly` ficam fora (não se enviam). Refs circulares param na profundidade máxima.
 */
export function buildExample(
    node: SchemaNode | undefined,
    schemas: NormalizedSpec["schemas"],
    depth = 0,
    seen: ReadonlySet<string> = new Set(),
): unknown {
    if (!node || depth > MAX_DEPTH) return undefined
    if (node.ref) {
        if (seen.has(node.ref)) return undefined
        return buildExample(resolveSchema(node, schemas), schemas, depth + 1, new Set(seen).add(node.ref))
    }
    if (node.example !== undefined) return node.example
    if (node.default !== undefined) return node.default
    if (node.enum && node.enum.length > 0) return node.enum[0]
    const alternative = node.oneOf?.[0] ?? node.anyOf?.[0]
    if (alternative && !node.properties) return buildExample(alternative, schemas, depth + 1, seen)

    const type = node.type?.split(" | ")[0]
    if (type === "object" || node.properties) {
        const result: Record<string, unknown> = {}
        for (const [key, child] of Object.entries(node.properties ?? {})) {
            const resolved = resolveSchema(child, schemas)
            if (resolved?.readOnly) continue
            const value = buildExample(child, schemas, depth + 1, seen)
            if (value !== undefined) result[key] = value
        }
        return result
    }
    if (type === "array") {
        const item = buildExample(node.items, schemas, depth + 1, seen)
        return item === undefined ? [] : [item]
    }
    if (type === "integer") return node.minimum ?? 0
    if (type === "number") return node.minimum ?? 0
    if (type === "boolean") return false
    if (type === "string") return exampleForFormat(node.format)
    if (type === "null") return null
    return undefined
}

/** Corpo inicial do editor: exemplo declarado na operação ou gerado pelo schema. */
export function initialBodyText(example: unknown, schema: SchemaNode | undefined, schemas: NormalizedSpec["schemas"]): string {
    const value = example !== undefined ? example : buildExample(schema, schemas)
    if (value === undefined) return ""
    return typeof value === "string" ? value : JSON.stringify(value, null, 2)
}

/** Valor inicial de um parâmetro no formulário (texto). */
export function initialParameterValue(param: OperationParameter, schemas: NormalizedSpec["schemas"]): string {
    const schema = resolveSchema(param.schema, schemas)
    const value = param.example ?? schema?.default
    if (value === undefined || value === null) return ""
    return typeof value === "string" ? value : JSON.stringify(value)
}

export type ParameterValues = Record<string, string>

export function parameterKey(param: Pick<OperationParameter, "in" | "name">): string {
    return `${param.in}:${param.name}`
}

/** Erros por parâmetro (obrigatório vazio, número inválido, fora do enum). */
export function validateParameters(
    params: OperationParameter[],
    values: ParameterValues,
    schemas: NormalizedSpec["schemas"],
): Record<string, string> {
    const errors: Record<string, string> = {}
    for (const param of params) {
        const key = parameterKey(param)
        const value = (values[key] ?? "").trim()
        if (value === "") {
            if (param.required) errors[key] = "Obrigatório"
            continue
        }
        const schema = resolveSchema(param.schema, schemas)
        const type = schema?.type?.split(" | ")[0]
        if ((type === "integer" || type === "number") && !Number.isFinite(Number(value))) errors[key] = "Informe um número"
        else if (type === "integer" && !Number.isInteger(Number(value))) errors[key] = "Informe um número inteiro"
        else if (schema?.enum && schema.enum.length > 0 && !schema.enum.map(String).includes(value)) errors[key] = "Valor fora da lista permitida"
    }
    return errors
}

/** Separa os valores preenchidos por local (path/query/header) para a execução. */
export function splitParameterValues(
    params: OperationParameter[],
    values: ParameterValues,
): { path: Record<string, string>; query: Record<string, string>; headers: Record<string, string> } {
    const out = { path: {} as Record<string, string>, query: {} as Record<string, string>, headers: {} as Record<string, string> }
    for (const param of params) {
        const value = (values[parameterKey(param)] ?? "").trim()
        if (value === "") continue
        if (param.in === "path") out.path[param.name] = value
        else if (param.in === "query") out.query[param.name] = value
        else out.headers[param.name] = value
    }
    return out
}

/** `null` quando o texto é JSON válido (ou vazio); senão a mensagem de erro. */
export function jsonError(text: string): string | null {
    if (text.trim() === "") return null
    try {
        JSON.parse(text)
        return null
    } catch (error) {
        return error instanceof Error ? `JSON inválido: ${error.message}` : "JSON inválido"
    }
}

/** Texto curto do tipo de um schema (ex.: `string (date)`, `array<Pedido>`). */
export function describeSchemaType(node: SchemaNode | undefined): string {
    if (!node) return "—"
    if (node.ref) return node.ref
    if (node.unresolved) return node.unresolved
    const nullable = node.nullable ? " | null" : ""
    if (node.type === "array") return `array<${describeSchemaType(node.items)}>${nullable}`
    if (node.oneOf) return `${node.oneOf.map(describeSchemaType).join(" | ")}${nullable}`
    if (node.anyOf) return `${node.anyOf.map(describeSchemaType).join(" | ")}${nullable}`
    const base = node.type ?? (node.properties ? "object" : "any")
    return `${base}${node.format ? ` (${node.format})` : ""}${nullable}`
}
