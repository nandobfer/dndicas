import { OpexFile, OpexJob, OpexMessage, OpexPendingAction, OpexSession } from "@/lib/db/models/Opex"

/** Índices das coleções do Agente Opex (models carregados antes da conexão podem não receber autoIndex). Idempotente. */
export async function ensureOpexIndexes(): Promise<void> {
    await Promise.all([OpexSession.createIndexes(), OpexMessage.createIndexes(), OpexPendingAction.createIndexes(), OpexFile.createIndexes(), OpexJob.createIndexes()])
}
