import Pusher from "pusher"
import { getIntegration, type IntegrationConfigMap } from "@/lib/integrations/config"
import { parsePusherUrl } from "./url"
import { integrationDebug } from "@/lib/integrations/debug"

/**
 * Cliente Pusher do servidor, montado a partir da integração "Pusher".
 *
 * A configuração vem de `getIntegration("pusher")` (banco → .env) e o cliente é
 * reconstruído quando a versão da configuração muda — editar a tela passa a valer sem
 * redeploy. `pusher` continua exportado como fachada com a mesma API usada pelas rotas.
 */

let cached: { version: string; client: Pusher } | null = null

export class PusherNotConfiguredError extends Error {
    constructor() {
        super("Pusher não configurado: informe App ID, Key, Secret e Cluster (ou URL do host próprio) em Integrações › Pusher")
        this.name = "PusherNotConfiguredError"
    }
}

/**
 * Opções do cliente do servidor. Modo `host` (ex.: Soketi): host/porta/TLS vêm da URL; modo
 * `cluster`: Pusher na nuvem com TLS. `null` quando falta algo para o modo escolhido.
 */
export function buildPusherServerOptions(values: IntegrationConfigMap["pusher"]): Pusher.Options | null {
    if (!values.appId || !values.key || !values.secret) return null
    const base = { appId: values.appId, key: values.key, secret: values.secret }
    if (values.mode === "host") {
        const endpoint = parsePusherUrl(values.url)
        if (!endpoint) return null
        return { ...base, host: endpoint.host, port: String(endpoint.port), useTLS: endpoint.useTLS }
    }
    if (!values.cluster) return null
    return { ...base, cluster: values.cluster, useTLS: true }
}

export async function isPusherServerConfigured(): Promise<boolean> {
    const { values } = await getIntegration("pusher")
    return buildPusherServerOptions(values) !== null
}

/** Cliente sem instrumentação de debug — usado pelo próprio debug para evitar recursão. */
export async function getRawPusherServer(): Promise<Pusher> {
    const { values, version } = await getIntegration("pusher")
    if (cached?.version === version) return cached.client
    const options = buildPusherServerOptions(values)
    if (!options) throw new PusherNotConfiguredError()
    const client = new Pusher(options)
    cached = { version, client }
    return client
}

export async function getPusherServer(): Promise<Pusher> {
    return getRawPusherServer()
}

const dbg = integrationDebug("pusher")

type TriggerArgs = Parameters<Pusher["trigger"]>
type TriggerResult = Awaited<ReturnType<Pusher["trigger"]>>

/** Fachada compatível com o antigo singleton `pusher`. */
export const pusher = {
    async trigger(...args: TriggerArgs): Promise<TriggerResult> {
        const [channel, event] = args
        dbg.request(`trigger ${String(event)}`, { channel })
        try {
            const client = await getRawPusherServer()
            const response = await client.trigger(...args)
            dbg.response(`trigger ${String(event)}: HTTP ${response.status}`, { channel })
            return response
        } catch (error) {
            dbg.error(`trigger ${String(event)} falhou`, error, { channel })
            throw error
        }
    },
}
