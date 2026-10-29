import {
    HTTP_METHODS,
    UNTAGGED,
    type ExplorerOperation,
    type ExplorerTagGroup,
    type HttpMethod,
    type NormalizedSpec,
    type OperationParameter,
    type OperationRequestBody,
    type OperationResponse,
    type ParameterLocation,
    type SchemaNode,
} from "./types"

/**
 * Normaliza uma especificação OpenAPI 3.0/3.1 (JSON já parseado) para o explorador.
 *
 * - `$ref` para `#/components/schemas/X` vira `{ ref: "X" }` (resolução sob demanda no cliente,
 *   ciclos inofensivos); `$ref` locais de parâmetros, corpos e respostas são resolvidos aqui.
 * - `allOf` é mesclado (propriedades e obrigatórios); `oneOf`/`anyOf` viram alternativas.
 * - Operações sem `operationId` são identificadas por `"MÉTODO /caminho"` (a chave usada na
 *   execução é sempre esta, que é única por definição).
 * - Swagger 2.0 e qualquer coisa que não seja OpenAPI 3.x são recusados com mensagem em pt-BR.
 */

export class OpenApiSpecError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "OpenApiSpecError"
    }
}

type Json = Record<string, unknown>

const SCHEMA_REF_PREFIX = "#/components/schemas/"
const MAX_ALLOF_DEPTH = 8

function isObject(value: unknown): value is Json {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

function str(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() !== "" ? value : undefined
}

/** Resolve um JSON Pointer local (`#/a/b~1c`). */
export function resolvePointer(doc: Json, ref: string): unknown {
    if (!ref.startsWith("#/")) return undefined
    let current: unknown = doc
    for (const raw of ref.slice(2).split("/")) {
        const key = decodeURIComponent(raw).replace(/~1/g, "/").replace(/~0/g, "~")
        if (!isObject(current) && !Array.isArray(current)) return undefined
        current = (current as Json)[key]
        if (current === undefined) return undefined
    }
    return current
}

/** Segue `$ref` locais (não-schema) até o objeto concreto, com proteção contra laços. */
function deref(doc: Json, value: unknown, seen = new Set<string>()): Json | undefined {
    let current = value
    while (isObject(current) && typeof current.$ref === "string") {
        const ref = current.$ref
        if (seen.has(ref)) return undefined
        seen.add(ref)
        current = resolvePointer(doc, ref)
    }
    return isObject(current) ? current : undefined
}

export function schemaNameFromRef(ref: string): string | undefined {
    return ref.startsWith(SCHEMA_REF_PREFIX) ? decodeURIComponent(ref.slice(SCHEMA_REF_PREFIX.length)).replace(/~1/g, "/").replace(/~0/g, "~") : undefined
}

function typeOf(raw: Json): { type?: string; nullable?: boolean } {
    // 3.1: `type` pode ser lista (ex.: ["string", "null"]).
    if (Array.isArray(raw.type)) {
        const types = raw.type.filter((t): t is string => typeof t === "string")
        const nonNull = types.filter((t) => t !== "null")
        return { type: nonNull.length === 1 ? nonNull[0] : nonNull.join(" | ") || undefined, nullable: types.includes("null") || undefined }
    }
    return { type: str(raw.type), nullable: raw.nullable === true || undefined }
}

function numberOr(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

/** Converte um schema cru em `SchemaNode`. */
export function normalizeSchema(doc: Json, raw: unknown, depth = 0, allOfSeen: Set<string> = new Set()): SchemaNode {
    if (!isObject(raw)) return {}
    if (typeof raw.$ref === "string") {
        const name = schemaNameFromRef(raw.$ref)
        if (name) return { ref: name }
        const target = raw.$ref.startsWith("#/") ? resolvePointer(doc, raw.$ref) : undefined
        if (target === undefined || depth > MAX_ALLOF_DEPTH) return { unresolved: raw.$ref }
        return normalizeSchema(doc, target, depth + 1, allOfSeen)
    }

    const { type, nullable } = typeOf(raw)
    const node: SchemaNode = {
        title: str(raw.title),
        type,
        format: str(raw.format),
        description: str(raw.description),
        nullable,
        enum: Array.isArray(raw.enum) ? raw.enum : undefined,
        default: raw.default,
        example: raw.example !== undefined ? raw.example : Array.isArray(raw.examples) ? raw.examples[0] : undefined,
        deprecated: raw.deprecated === true || undefined,
        readOnly: raw.readOnly === true || undefined,
        writeOnly: raw.writeOnly === true || undefined,
        minimum: numberOr(raw.minimum),
        maximum: numberOr(raw.maximum),
        minLength: numberOr(raw.minLength),
        maxLength: numberOr(raw.maxLength),
        pattern: str(raw.pattern),
    }
    if (raw.const !== undefined && node.enum === undefined) node.enum = [raw.const]

    if (isObject(raw.properties)) {
        node.properties = {}
        for (const [key, value] of Object.entries(raw.properties)) node.properties[key] = normalizeSchema(doc, value, depth + 1, allOfSeen)
    }
    if (Array.isArray(raw.required)) node.required = raw.required.filter((r): r is string => typeof r === "string")
    if (raw.items !== undefined) node.items = normalizeSchema(doc, raw.items, depth + 1, allOfSeen)
    if (typeof raw.additionalProperties === "boolean") node.additionalProperties = raw.additionalProperties
    else if (isObject(raw.additionalProperties)) node.additionalProperties = normalizeSchema(doc, raw.additionalProperties, depth + 1, allOfSeen)
    if (Array.isArray(raw.oneOf)) node.oneOf = raw.oneOf.map((s) => normalizeSchema(doc, s, depth + 1, allOfSeen))
    if (Array.isArray(raw.anyOf)) {
        // `anyOf: [X, {type: null}]` (padrão do Pydantic/FastAPI para opcionais) = X anulável.
        const alternatives = raw.anyOf.filter((s) => !(isObject(s) && s.type === "null"))
        if (alternatives.length < raw.anyOf.length) node.nullable = true
        if (alternatives.length === 1 && !node.type && !node.properties) {
            const single = normalizeSchema(doc, alternatives[0], depth + 1, allOfSeen)
            Object.assign(node, { ...single, ...stripUndefined(node), ref: single.ref })
        } else if (alternatives.length > 0) {
            node.anyOf = alternatives.map((s) => normalizeSchema(doc, s, depth + 1, allOfSeen))
        }
    }
    if (Array.isArray(raw.allOf)) mergeAllOf(doc, node, raw.allOf, depth, allOfSeen)
    return stripUndefined(node)
}

function stripUndefined<T extends object>(value: T): T {
    for (const key of Object.keys(value) as (keyof T)[]) if (value[key] === undefined) delete value[key]
    return value
}

/** Mescla os membros do `allOf` no próprio nó (propriedades, obrigatórios e metadados). */
function mergeAllOf(doc: Json, node: SchemaNode, members: unknown[], depth: number, seen: Set<string>): void {
    for (const member of members) {
        let raw: unknown = member
        if (isObject(member) && typeof member.$ref === "string") {
            if (seen.has(member.$ref) || depth > MAX_ALLOF_DEPTH) {
                node.circular = true
                continue
            }
            raw = resolvePointer(doc, member.$ref)
            if (raw === undefined) {
                node.unresolved = member.$ref
                continue
            }
            seen = new Set(seen).add(member.$ref)
        }
        const part = normalizeSchema(doc, raw, depth + 1, seen)
        if (part.properties) node.properties = { ...(node.properties ?? {}), ...part.properties }
        if (part.required) node.required = Array.from(new Set([...(node.required ?? []), ...part.required]))
        node.type ??= part.type ?? (part.properties ? "object" : undefined)
        node.description ??= part.description
        node.title ??= part.title
        node.format ??= part.format
        node.enum ??= part.enum
        node.items ??= part.items
        if (part.ref && !part.properties && members.length === 1) node.ref = part.ref
    }
}

function normalizeParameter(doc: Json, raw: unknown): OperationParameter | null {
    const param = deref(doc, raw)
    if (!param) return null
    const name = str(param.name)
    const location = param.in
    // Cookies não são enviados pelo explorador.
    if (!name || (location !== "path" && location !== "query" && location !== "header")) return null
    let schema = normalizeSchema(doc, param.schema)
    if (!param.schema && isObject(param.content)) {
        const first = Object.values(param.content)[0]
        if (isObject(first)) schema = normalizeSchema(doc, first.schema)
    }
    return stripUndefined({
        name,
        in: location as ParameterLocation,
        required: location === "path" ? true : param.required === true,
        description: str(param.description),
        deprecated: param.deprecated === true || undefined,
        schema,
        example: param.example !== undefined ? param.example : firstExampleValue(doc, param.examples),
    })
}

function firstExampleValue(doc: Json, examples: unknown): unknown {
    if (!isObject(examples)) return undefined
    const first = deref(doc, Object.values(examples)[0])
    return first?.value
}

/** Prefere JSON (`application/json` ou `*+json`); senão o primeiro tipo declarado. */
export function pickContentType(types: string[]): string | undefined {
    return (
        types.find((t) => t.toLowerCase().split(";")[0].trim() === "application/json") ??
        types.find((t) => /\+json\b/i.test(t)) ??
        types[0]
    )
}

function normalizeRequestBody(doc: Json, raw: unknown): OperationRequestBody | undefined {
    const body = deref(doc, raw)
    if (!body || !isObject(body.content)) return undefined
    const contentTypes = Object.keys(body.content)
    const contentType = pickContentType(contentTypes)
    if (!contentType) return undefined
    const media = body.content[contentType]
    const mediaObj = isObject(media) ? media : {}
    return stripUndefined({
        required: body.required === true,
        description: str(body.description),
        contentType,
        contentTypes,
        schema: mediaObj.schema !== undefined ? normalizeSchema(doc, mediaObj.schema) : undefined,
        example: mediaObj.example !== undefined ? mediaObj.example : firstExampleValue(doc, mediaObj.examples),
    })
}

function normalizeResponses(doc: Json, raw: unknown): OperationResponse[] {
    if (!isObject(raw)) return []
    return Object.entries(raw)
        .map(([status, value]) => {
            const response = deref(doc, value)
            if (!response) return { status }
            const types = isObject(response.content) ? Object.keys(response.content) : []
            const contentType = pickContentType(types)
            const media = contentType && isObject(response.content) ? response.content[contentType] : undefined
            return stripUndefined({
                status,
                description: str(response.description),
                contentType,
                schema: isObject(media) && media.schema !== undefined ? normalizeSchema(doc, media.schema) : undefined,
            })
        })
        .sort((a, b) => a.status.localeCompare(b.status))
}

function isSecured(security: unknown): boolean {
    // `[]` desliga; `[{}]` = opcional/anônimo.
    return Array.isArray(security) && security.some((req) => isObject(req) && Object.keys(req).length > 0)
}

export function operationKey(method: HttpMethod, path: string): string {
    return `${method.toUpperCase()} ${path}`
}

export function parseOpenApiSpec(input: unknown): NormalizedSpec {
    if (!isObject(input)) throw new OpenApiSpecError("A URL não publica uma especificação OpenAPI 3.x (JSON inválido)")
    if (typeof input.swagger === "string") {
        throw new OpenApiSpecError(`A especificação é Swagger ${input.swagger}; apenas OpenAPI 3.x é aceito`)
    }
    const version = str(input.openapi)
    if (!version || !/^3\.\d+/.test(version)) {
        throw new OpenApiSpecError("A URL não publica uma especificação OpenAPI 3.x")
    }
    const doc = input
    const info = isObject(doc.info) ? doc.info : {}
    const paths = isObject(doc.paths) ? doc.paths : {}
    const operations: ExplorerOperation[] = []

    for (const [path, rawItem] of Object.entries(paths)) {
        const item = deref(doc, rawItem)
        if (!item) continue
        const shared = Array.isArray(item.parameters) ? item.parameters : []
        for (const method of HTTP_METHODS) {
            const op = item[method]
            if (!isObject(op)) continue
            // Parâmetros da operação sobrescrevem os do caminho (mesmo nome + local).
            const byKey = new Map<string, OperationParameter>()
            for (const raw of [...shared, ...(Array.isArray(op.parameters) ? op.parameters : [])]) {
                const param = normalizeParameter(doc, raw)
                if (param) byKey.set(`${param.in}:${param.name}`, param)
            }
            const tags = Array.isArray(op.tags) ? op.tags.filter((t): t is string => typeof t === "string" && t.trim() !== "") : []
            operations.push(
                stripUndefined({
                    key: operationKey(method, path),
                    operationId: str(op.operationId),
                    method,
                    path,
                    summary: str(op.summary),
                    description: str(op.description),
                    deprecated: op.deprecated === true,
                    tags: tags.length > 0 ? tags : [UNTAGGED],
                    parameters: Array.from(byKey.values()),
                    requestBody: normalizeRequestBody(doc, op.requestBody),
                    responses: normalizeResponses(doc, op.responses),
                    secured: isSecured(op.security !== undefined ? op.security : doc.security),
                }),
            )
        }
    }

    const declared = Array.isArray(doc.tags) ? doc.tags.filter(isObject) : []
    const groups = new Map<string, ExplorerTagGroup>()
    for (const tag of declared) {
        const name = str(tag.name)
        if (name && !groups.has(name)) groups.set(name, stripUndefined({ name, description: str(tag.description), operations: [] }))
    }
    for (const op of operations) {
        for (const tag of op.tags) {
            if (!groups.has(tag)) groups.set(tag, { name: tag, operations: [] })
            groups.get(tag)!.operations.push(op.key)
        }
    }
    const tags = Array.from(groups.values()).filter((group) => group.operations.length > 0)
    // "Outros" sempre por último.
    tags.sort((a, b) => Number(a.name === UNTAGGED) - Number(b.name === UNTAGGED))

    const schemas: Record<string, SchemaNode> = {}
    const components = isObject(doc.components) ? doc.components : {}
    if (isObject(components.schemas)) {
        for (const [name, raw] of Object.entries(components.schemas)) {
            schemas[name] = normalizeSchema(doc, raw, 0, new Set([`${SCHEMA_REF_PREFIX}${name}`]))
        }
    }

    const servers = Array.isArray(doc.servers)
        ? doc.servers.map((s) => (isObject(s) ? str(s.url) : undefined)).filter((u): u is string => Boolean(u))
        : []

    return {
        openapi: version,
        info: stripUndefined({
            title: str(info.title) ?? "API",
            version: str(info.version) ?? "",
            description: str(info.description),
        }),
        servers,
        tags,
        operations,
        schemas,
    }
}
