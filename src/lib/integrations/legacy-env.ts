/**
 * Leitura das variáveis legadas do `.env` (migração inicial e fallback do resolvedor).
 *
 * O DnDicas configurava o Pusher/Soketi por host, porta e esquema separados
 * (`PUSHER_HOST`/`PUSHER_PORT`/`PUSHER_SCHEME` e as `NEXT_PUBLIC_PUSHER_*`), enquanto a
 * integração copiada do Opex usa modo + URL. As variáveis derivadas abaixo traduzem o formato
 * antigo para o novo, sem exigir que o `.env` seja reescrito antes da migração.
 */

type Env = Record<string, string | undefined>

function value(env: Env, name: string): string | undefined {
    const raw = env[name]?.trim()
    return raw ? raw : undefined
}

function first(env: Env, names: readonly string[]): string | undefined {
    for (const name of names) {
        const found = value(env, name)
        if (found) return found
    }
    return undefined
}

function origin(scheme: string | undefined, host: string | undefined, port: string | undefined, tls: string, plain: string): string | undefined {
    if (!host) return undefined
    const secure = scheme === "https" || scheme === "wss"
    const protocol = secure ? tls : plain
    const defaultPort = secure ? "443" : "80"
    return port && port !== defaultPort ? `${protocol}://${host}:${port}` : `${protocol}://${host}`
}

const DERIVED: Readonly<Record<string, (env: Env) => string | undefined>> = {
    PUSHER_MODE: (env) => (value(env, "PUSHER_HOST") ? "host" : undefined),
    PUSHER_URL: (env) => origin(value(env, "PUSHER_SCHEME") ?? "http", value(env, "PUSHER_HOST"), value(env, "PUSHER_PORT"), "https", "http"),
    NEXT_PUBLIC_PUSHER_URL: (env) =>
        origin(
            first(env, ["PUSHER_PUBLIC_SCHEME", "NEXT_PUBLIC_PUSHER_SCHEME"]) ?? "https",
            first(env, ["PUSHER_PUBLIC_HOST", "NEXT_PUBLIC_PUSHER_HOST"]),
            first(env, ["PUSHER_PUBLIC_PORT", "NEXT_PUBLIC_PUSHER_PORT"]),
            "wss",
            "ws",
        ),
}

/** Valor da variável legada: a própria variável ou, sem ela, a derivada do formato antigo. */
export function readLegacyEnvVar(name: string, env: Env = process.env): string | undefined {
    return value(env, name) ?? DERIVED[name]?.(env)
}

/** Primeira variável preenchida, em ordem de preferência. */
export function readLegacyEnv(names: readonly string[] | undefined, env: Env = process.env): string | undefined {
    for (const name of names ?? []) {
        const found = readLegacyEnvVar(name, env)
        if (found) return found
    }
    return undefined
}
