import { dbConnect } from "@/lib/db"
import { MEMORY_IDENTITIES } from "../constants"
import type { EngramindConnectionDto } from "../types"
import { engramindConnection, webhookUrlOf } from "./client"
import { memoryContextHealth } from "./memory-context"
import { ENGRAMIND_STATE_ID, EngramindState } from "./models"

/** Estado da conexão para a aba Conexão (sem segredos: só se cada token existe). */
export async function getConnectionState(): Promise<EngramindConnectionDto> {
    await dbConnect()
    const [connection, state, health] = await Promise.all([engramindConnection(), EngramindState.findById(ENGRAMIND_STATE_ID).lean(), memoryContextHealth()])
    const bootstrap = state?.bootstrap
    return {
        configured: Boolean(connection),
        webhookUrl: connection?.publicAppUrl ? webhookUrlOf(connection.publicAppUrl) : null,
        bootstrap: bootstrap?.steps
            ? {
                  ok: Boolean(bootstrap.ok),
                  ranAt: new Date(bootstrap.ranAt).toISOString(),
                  steps: bootstrap.steps.map((step) => ({ id: step.id, label: step.label, status: step.status, message: step.message, at: new Date(step.at).toISOString() })),
              }
            : null,
        agentTokens: Object.fromEntries(MEMORY_IDENTITIES.map((identity) => [identity, Boolean(connection?.agentTokens[identity])])),
        webhookSecretConfigured: Boolean(connection?.webhookSecret),
        categoryWarnings: state?.categoryWarnings ?? [],
        memoryContext: health,
    }
}
