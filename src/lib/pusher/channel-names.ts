/**
 * Nomes dos canais privados do Pusher. Módulo PURO (sem dependências de servidor): pode ser
 * importado por hooks de cliente. A publicação fica em `./channels` (somente servidor).
 */

/** Canal administrativo do app (configurações de IA, jobs, memórias) — só administradores assinam. */
export const appChannel = () => "private-app"
export const integrationChannel = (id: string) => `private-integration-${id}`

/**
 * Dono de uma sessão do **Agente Opex**: usuário logado (`u-{userId}`) ou visitante anônimo
 * (`a-{anonymousId}`). Cada um só assina o próprio canal.
 */
export type OpexOwnerKey = `u-${string}` | `a-${string}`

export const opexOwnerKey = (owner: { userId: string } | { anonymousId: string }): OpexOwnerKey =>
    "userId" in owner ? `u-${owner.userId}` : `a-${owner.anonymousId}`

/** Canal do **Agente Opex** de um dono (sessões do chat e jobs). */
export const opexChannel = (ownerKey: OpexOwnerKey) => `private-opex-${ownerKey}`

export const OPEX_CHANNEL_PREFIX = "private-opex-"

export const MADDOX_USER_CHANNEL_PREFIX = "private-maddox-u-"

/** Canal das **Campanhas Maddox** de um usuário: avisa que uma campanha da qual ele participa mudou. */
export const maddoxUserChannel = (userId: string) => `${MADDOX_USER_CHANNEL_PREFIX}${userId}`
