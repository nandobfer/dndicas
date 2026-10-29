/**
 * Leitura de respostas HTTP com limite de tamanho (explorador das integrações). Corta o corpo
 * no limite em vez de carregar tudo em memória.
 */

export async function readLimitedText(response: Response, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
    if (!response.body) return { text: "", truncated: false }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    let truncated = false
    for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        if (size + value.byteLength > maxBytes) {
            chunks.push(value.subarray(0, maxBytes - size))
            size = maxBytes
            truncated = true
            await reader.cancel().catch(() => undefined)
            break
        }
        chunks.push(value)
        size += value.byteLength
    }
    const merged = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
        merged.set(chunk, offset)
        offset += chunk.byteLength
    }
    return { text: new TextDecoder().decode(merged), truncated }
}

/** `fetch` com timeout próprio, respeitando também um sinal externo (cancelamento do cliente). */
export async function fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
    signal?: AbortSignal,
): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), timeoutMs)
    const onAbort = () => controller.abort(signal?.reason)
    signal?.addEventListener("abort", onAbort, { once: true })
    try {
        return await fetch(url, { ...init, signal: controller.signal, redirect: init.redirect ?? "follow" })
    } finally {
        clearTimeout(timer)
        signal?.removeEventListener("abort", onAbort)
    }
}

export function isTimeoutError(error: unknown): boolean {
    const name = (error as { name?: string } | null)?.name
    return name === "TimeoutError" || name === "AbortError"
}
