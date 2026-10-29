/**
 * Modelo normalizado de uma especificação OpenAPI 3.x para o explorador das integrações.
 *
 * O servidor baixa e normaliza a especificação (`parser.ts`); o cliente só recebe este modelo.
 * `$ref` para `#/components/schemas/*` vira um nó `{ ref }` resolvido sob demanda em `schemas`,
 * o que torna ciclos inofensivos (a árvore expande um nível por vez).
 */

export const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const
export type HttpMethod = (typeof HTTP_METHODS)[number]

/** Métodos que podem alterar dados: pedem confirmação e geram auditoria. */
export const MUTATING_METHODS: readonly HttpMethod[] = ["post", "put", "patch", "delete"]

export function isMutatingMethod(method: HttpMethod): boolean {
    return MUTATING_METHODS.includes(method)
}

export interface SchemaNode {
    /** Nome do schema em `components.schemas` — os demais campos ficam vazios. */
    ref?: string
    /** `$ref` externo ou fora de `components.schemas`, não resolvido. */
    unresolved?: string
    /** Referência circular cortada durante o `allOf`. */
    circular?: boolean
    title?: string
    type?: string
    format?: string
    description?: string
    nullable?: boolean
    enum?: unknown[]
    default?: unknown
    example?: unknown
    deprecated?: boolean
    readOnly?: boolean
    writeOnly?: boolean
    minimum?: number
    maximum?: number
    minLength?: number
    maxLength?: number
    pattern?: string
    properties?: Record<string, SchemaNode>
    required?: string[]
    items?: SchemaNode
    additionalProperties?: SchemaNode | boolean
    oneOf?: SchemaNode[]
    anyOf?: SchemaNode[]
}

export type ParameterLocation = "path" | "query" | "header"

export interface OperationParameter {
    name: string
    in: ParameterLocation
    required: boolean
    description?: string
    deprecated?: boolean
    schema: SchemaNode
    example?: unknown
}

export interface OperationRequestBody {
    required: boolean
    description?: string
    /** Tipo escolhido para envio (JSON quando existir). */
    contentType: string
    contentTypes: string[]
    schema?: SchemaNode
    example?: unknown
}

export interface OperationResponse {
    status: string
    description?: string
    contentType?: string
    schema?: SchemaNode
}

export interface ExplorerOperation {
    /** `"POST /api/v1/x"` — único na especificação; é o que o cliente envia para executar. */
    key: string
    operationId?: string
    method: HttpMethod
    path: string
    summary?: string
    description?: string
    deprecated: boolean
    tags: string[]
    parameters: OperationParameter[]
    requestBody?: OperationRequestBody
    responses: OperationResponse[]
    /** Exige autenticação segundo `security`. */
    secured: boolean
}

export interface ExplorerTagGroup {
    name: string
    description?: string
    /** Chaves das operações, na ordem da especificação. */
    operations: string[]
}

export interface NormalizedSpec {
    openapi: string
    info: { title: string; version: string; description?: string }
    servers: string[]
    tags: ExplorerTagGroup[]
    operations: ExplorerOperation[]
    schemas: Record<string, SchemaNode>
}

/** Tag das operações sem tag. */
export const UNTAGGED = "Outros"

/** `GET /api/integrations/[id]/openapi`. */
export interface ExplorerSpecDto {
    spec: NormalizedSpec
    /** URL de onde a especificação JSON foi lida (pode diferir da cadastrada, ex.: `/docs`). */
    specUrl: string
    /** URL base usada nas execuções. */
    baseUrl: string | null
    /** Resumo da autenticação injetada pelo servidor; `null` = sem adaptador. */
    auth: string | null
    /** Credenciais do adaptador configuradas. */
    authReady: boolean
    /** O explorador pede o token e o envia como `Authorization` (adaptador sem credencial própria). */
    clientAuthorization: boolean
    fetchedAt: string
}

/** Corpo de `POST /api/integrations/[id]/explore`. */
export interface ExplorerExecuteInput {
    operation: string
    path?: Record<string, string>
    query?: Record<string, string | string[]>
    headers?: Record<string, string>
    /** Corpo cru (texto); o cliente já validou o JSON. */
    body?: string
}

export interface ExplorerExecuteResult {
    status: number
    statusText: string
    headers: Record<string, string>
    contentType: string | null
    body: string
    truncated: boolean
    latencyMs: number
    /** URL chamada, sem query string de credenciais (não há). */
    url: string
}
