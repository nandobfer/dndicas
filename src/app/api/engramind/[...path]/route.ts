import { handleProxy } from "@/features/engramind/server/proxy"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Proxy da rede de memórias (`/memorias`) no modo `app`: login + `memories.view` (leitura) ou
 * `memories.edit` (importação), conferidos no servidor; o resto recebe 403 `ENGRAMIND_READ_ONLY`.
 */
const handler = (request: Request) => handleProxy(request)

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE }
