import {
    MaddoxCampaignMemberModel,
    MaddoxCampaignMemoryModel,
    MaddoxCampaignModel,
    MaddoxCharacterModel,
    MaddoxInterviewScriptModel,
    MaddoxNpcModel,
    MaddoxOpencodeSessionModel,
} from "@/features/maddox/models"

/**
 * Índices das coleções das Campanhas Maddox (models carregados antes da conexão podem não receber
 * autoIndex). Os únicos sustentam regras: `{ kind, version }` dos roteiros (409 `VERSION_CONFLICT` em
 * gravações concorrentes), uma sessão `active` por campanha/finalidade/membro e `sessionId` das
 * sessões do OpenCode, e `{ campaignId, userId }` dos membros. Idempotente.
 */
export async function ensureMaddoxIndexes(): Promise<void> {
    await Promise.all([
        MaddoxCampaignModel.createIndexes(),
        MaddoxCampaignMemberModel.createIndexes(),
        MaddoxCharacterModel.createIndexes(),
        MaddoxNpcModel.createIndexes(),
        MaddoxCampaignMemoryModel.createIndexes(),
        MaddoxInterviewScriptModel.createIndexes(),
        MaddoxOpencodeSessionModel.createIndexes(),
    ])
}
