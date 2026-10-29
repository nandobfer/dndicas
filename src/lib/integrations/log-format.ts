/**
 * Formato das linhas de log das integrações. Módulo puro, compartilhado entre o
 * console do servidor e o terminal da tela, para que ambos mostrem exatamente a mesma linha.
 */

export type IntegrationLogLevel = "info" | "step" | "request" | "response" | "success" | "warn" | "error"

export interface IntegrationLogLine {
    integrationId: string
    level: IntegrationLogLevel
    message: string
    data?: unknown
    /** ISO 8601. */
    ts: string
    instance?: string
}

const ANSI = {
    reset: "\x1b[0m",
    dim: "\x1b[2m",
    bold: "\x1b[1m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    gray: "\x1b[90m",
} as const

const LEVEL_STYLE: Record<IntegrationLogLevel, { label: string; color: string }> = {
    info: { label: "INFO ", color: ANSI.blue },
    step: { label: "STEP ", color: ANSI.cyan },
    request: { label: "REQ →", color: ANSI.magenta },
    response: { label: "RES ←", color: ANSI.magenta },
    success: { label: "OK   ", color: ANSI.green },
    warn: { label: "WARN ", color: ANSI.yellow },
    error: { label: "ERROR", color: ANSI.red },
}

function pad(n: number, size = 2): string {
    return String(n).padStart(size, "0")
}

/** `2026-09-22 14:03:01.123` no fuso de Brasília (UTC-3, sem horário de verão desde 2019). */
export function formatLogTimestamp(iso: string): string {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return iso
    const local = new Date(date.getTime() - 3 * 60 * 60 * 1000)
    return (
        `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} ` +
        `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}.` +
        pad(local.getUTCMilliseconds(), 3)
    )
}

export function stringifyLogData(data: unknown, maxLength = 4000): string {
    if (data === undefined) return ""
    let text: string
    try {
        text = typeof data === "string" ? data : JSON.stringify(data)
    } catch {
        text = String(data)
    }
    return text.length > maxLength ? `${text.slice(0, maxLength)}… (+${text.length - maxLength} caracteres)` : text
}

export function formatLogLine(line: IntegrationLogLine, options: { color?: boolean; tag?: string } = {}): string {
    const color = options.color !== false
    const style = LEVEL_STYLE[line.level] ?? LEVEL_STYLE.info
    const c = (code: string, text: string) => (color ? `${code}${text}${ANSI.reset}` : text)
    const tag = options.tag ?? line.integrationId.toUpperCase()
    const data = stringifyLogData(line.data)
    return [
        c(ANSI.gray, `[${formatLogTimestamp(line.ts)}]`),
        c(`${ANSI.bold}${ANSI.cyan}`, `[${tag}]`),
        c(`${ANSI.bold}${style.color}`, style.label),
        line.level === "error" ? c(ANSI.red, line.message) : line.level === "success" ? c(ANSI.green, line.message) : line.message,
        data ? c(ANSI.dim, data) : "",
    ]
        .filter(Boolean)
        .join(" ")
}

// ---------------------------------------------------------------------------
// Mascaramento
// ---------------------------------------------------------------------------

const SENSITIVE_KEY_RE = /pass(word)?|senha|secret|token|authorization|api[-_]?key|access[-_]?key|credential|cookie/i
export const MASK = "••••••"

/**
 * Remove segredos de qualquer estrutura antes de logar: chaves com nome sensível viram
 * `••••••`, e valores conhecidos (os segredos da integração) são substituídos onde
 * aparecerem dentro de strings — inclusive embutidos em URLs ou cabeçalhos.
 */
export function maskSensitive(value: unknown, knownSecrets: readonly string[] = [], depth = 0): unknown {
    if (depth > 8) return "[profundidade máxima]"
    if (typeof value === "string") {
        let out = value
        for (const secret of knownSecrets) {
            if (secret && secret.length >= 4) out = out.split(secret).join(MASK)
        }
        return out
    }
    if (Array.isArray(value)) return value.slice(0, 50).map((item) => maskSensitive(item, knownSecrets, depth + 1))
    if (value instanceof Error) {
        return { name: value.name, message: maskSensitive(value.message, knownSecrets, depth + 1) }
    }
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {}
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            out[key] = SENSITIVE_KEY_RE.test(key) && item !== undefined && item !== null && item !== ""
                ? MASK
                : maskSensitive(item, knownSecrets, depth + 1)
        }
        return out
    }
    return value
}
