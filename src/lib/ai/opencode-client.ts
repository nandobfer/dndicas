import type { OpenCode } from "@opencode/client"
import { getOpencodeConnection } from "./opencode"

/**
 * Cliente oficial do OpenCode 2.x (`@opencode/client`) — SOMENTE servidor. Copiado do Opex: usado
 * pelas sessões longas (ex.: as do Agente Maddox), que precisam do que o `generateAiText` não oferece
 * — criar, retomar e excluir sessões. Gerações curtas continuam no `stream.ts`.
 *
 * O pacote é importado sob demanda (`await import()`), nunca no topo: quem só lê a configuração não
 * paga a SDK.
 */

export type OpencodeClient = ReturnType<typeof OpenCode.make>

export async function getOpencodeClient(): Promise<OpencodeClient> {
    const conn = await getOpencodeConnection()
    const { Accept: _accept, ...headers } = conn.headers
    void _accept
    const { OpenCode: client } = await import("@opencode/client")
    return client.make({ baseUrl: conn.baseUrl, headers })
}

/** A sessão já não existe no OpenCode (excluir conta como sucesso). */
export async function isOpencodeSessionNotFound(error: unknown): Promise<boolean> {
    const { isSessionNotFoundError } = await import("@opencode/client")
    return isSessionNotFoundError(error)
}
