import { OpexToolError } from "./define"

/** Lê um objeto JSON enviado pelo modelo como texto (entradas livres funcionam em todos os provedores). */
export function parseJsonObject(value: string, field: string): Record<string, unknown> {
    let parsed: unknown
    try {
        parsed = JSON.parse(value)
    } catch {
        throw new OpexToolError(`${field} não é um JSON válido`)
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new OpexToolError(`${field} deve ser um objeto JSON`)
    return parsed as Record<string, unknown>
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value)

/** Mescla `patch` sobre `base` em profundidade (arrays e valores simples substituem). */
export function deepMerge<T>(base: T, patch: Record<string, unknown>): T {
    if (!isPlainObject(base)) return patch as T
    const result: Record<string, unknown> = { ...base }
    for (const [key, value] of Object.entries(patch)) {
        result[key] = isPlainObject(value) && isPlainObject(result[key]) ? deepMerge(result[key], value) : value
    }
    return result as T
}

/** Texto longo cortado para não estourar o contexto do modelo. */
export function clipText(value: string | null | undefined, max: number): string | null {
    if (value == null) return null
    return value.length > max ? `${value.slice(0, max)}…(+${(value.length - max).toLocaleString("pt-BR")} caracteres)` : value
}

const OBJECT_ID = /^[a-f0-9]{24}$/i

export const isObjectId = (value: string) => OBJECT_ID.test(value)
