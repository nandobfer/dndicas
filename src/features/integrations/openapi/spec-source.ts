import { fetchWithTimeout, isTimeoutError, readLimitedText } from "./http"
import { OpenApiSpecError, parseOpenApiSpec } from "./parser"
import type { NormalizedSpec } from "./types"

/**
 * Localiza e baixa a especificação OpenAPI 3.x a partir da URL cadastrada na integração.
 *
 * A URL pode ser o próprio JSON (`/openapi.json`) ou a página do Swagger UI (FastAPI `/docs`,
 * `swagger-ui`). Para HTML, procura a URL da especificação no próprio HTML (`url:` do
 * `SwaggerUIBundle`), no `swagger-initializer.js` e, por fim, tenta `openapi.json` ao lado.
 */

export const SPEC_FETCH_TIMEOUT_MS = 10_000
export const SPEC_MAX_BYTES = 5 * 1024 * 1024
const SPEC_CACHE_TTL_MS = 10 * 60_000
const HTML_MAX_BYTES = 512 * 1024

export interface LoadedSpec {
    spec: NormalizedSpec
    specUrl: string
    fetchedAt: string
}

const cache = new Map<string, { at: number; value: LoadedSpec }>()

export function clearSpecCache(): void {
    cache.clear()
}

/** Candidatas a URL da especificação encontradas num HTML/JS do Swagger UI. */
export function findSpecUrlCandidates(text: string, pageUrl: string): string[] {
    const found: string[] = []
    const patterns = [
        /\burl\s*:\s*["'`]([^"'`]+)["'`]/g, // SwaggerUIBundle({ url: "/openapi.json" })
        /\bspec-url\s*=\s*["']([^"']+)["']/g, // <redoc spec-url="...">
        /\bdata-url\s*=\s*["']([^"']+)["']/g,
    ]
    for (const pattern of patterns) {
        for (const match of text.matchAll(pattern)) {
            const raw = match[1].trim()
            if (!raw || raw.startsWith("javascript:")) continue
            try {
                found.push(new URL(raw, pageUrl).toString())
            } catch {
                /* ignora */
            }
        }
    }
    return Array.from(new Set(found))
}

/** `https://h/x/docs` → `https://h/x/openapi.json`, `https://h/openapi.json`. */
function siblingSpecUrls(pageUrl: string): string[] {
    const url = new URL(pageUrl)
    const dir = url.pathname.replace(/\/[^/]*$/, "/")
    const out = new Set<string>()
    for (const base of [dir, "/"]) {
        for (const name of ["openapi.json", "swagger.json", "v3/api-docs"]) out.add(new URL(`${base}${name}`, url.origin).toString())
    }
    return Array.from(out)
}

interface Fetched {
    url: string
    contentType: string
    text: string
}

async function fetchText(url: string, maxBytes: number): Promise<Fetched> {
    let response: Response
    try {
        response = await fetchWithTimeout(url, { headers: { Accept: "application/json, text/html;q=0.9, */*;q=0.5" } }, SPEC_FETCH_TIMEOUT_MS)
    } catch (error) {
        if (isTimeoutError(error)) throw new OpenApiSpecError("A documentação não respondeu em 10 segundos")
        throw new OpenApiSpecError("Não foi possível acessar a documentação (falha de rede)")
    }
    if (!response.ok) throw new OpenApiSpecError(`A documentação respondeu HTTP ${response.status}`)
    const { text, truncated } = await readLimitedText(response, maxBytes)
    if (truncated) throw new OpenApiSpecError("A especificação excede o limite de 5 MB")
    return { url: response.url || url, contentType: response.headers.get("content-type") ?? "", text }
}

function tryParseJson(text: string): unknown {
    const trimmed = text.trimStart()
    if (!trimmed.startsWith("{")) return undefined
    try {
        return JSON.parse(trimmed)
    } catch {
        return undefined
    }
}

async function trySpecAt(url: string): Promise<LoadedSpec | null> {
    try {
        const fetched = await fetchText(url, SPEC_MAX_BYTES)
        const json = tryParseJson(fetched.text)
        if (json === undefined) return null
        return { spec: parseOpenApiSpec(json), specUrl: fetched.url, fetchedAt: new Date().toISOString() }
    } catch (error) {
        // Swagger 2.0 encontrado: a mensagem é mais útil que "não encontrado".
        if (error instanceof OpenApiSpecError && /Swagger/.test(error.message)) throw error
        return null
    }
}

export async function loadOpenApiSpec(swaggerUrl: string, options: { refresh?: boolean } = {}): Promise<LoadedSpec> {
    const cached = cache.get(swaggerUrl)
    if (!options.refresh && cached && Date.now() - cached.at < SPEC_CACHE_TTL_MS) return cached.value

    const first = await fetchText(swaggerUrl, SPEC_MAX_BYTES)
    const json = tryParseJson(first.text)
    let loaded: LoadedSpec | null = null

    if (json !== undefined) {
        loaded = { spec: parseOpenApiSpec(json), specUrl: first.url, fetchedAt: new Date().toISOString() }
    } else if (/html|javascript/i.test(first.contentType) || /<html|SwaggerUIBundle/i.test(first.text.slice(0, HTML_MAX_BYTES))) {
        const html = first.text.slice(0, HTML_MAX_BYTES)
        const candidates = findSpecUrlCandidates(html, first.url)
        // swagger-ui moderno: a URL fica no swagger-initializer.js.
        if (/swagger-initializer\.js/.test(html)) {
            try {
                const initializer = await fetchText(new URL("swagger-initializer.js", first.url).toString(), HTML_MAX_BYTES)
                candidates.push(...findSpecUrlCandidates(initializer.text, initializer.url))
            } catch {
                /* segue para as candidatas vizinhas */
            }
        }
        candidates.push(...siblingSpecUrls(first.url))
        for (const candidate of Array.from(new Set(candidates))) {
            loaded = await trySpecAt(candidate)
            if (loaded) break
        }
    }

    if (!loaded) throw new OpenApiSpecError("A URL não publica uma especificação OpenAPI 3.x")
    cache.set(swaggerUrl, { at: Date.now(), value: loaded })
    return loaded
}
