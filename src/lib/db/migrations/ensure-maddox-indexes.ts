import {
    MaddoxCampaignMemberModel,
    MaddoxCampaignMessageModel,
    MaddoxCampaignMemoryModel,
    MaddoxCampaignModel,
    MaddoxCharacterModel,
    MaddoxInterviewModel,
    MaddoxInterviewScriptModel,
    MaddoxNpcModel,
    MaddoxOpencodeSessionModel,
} from "@/features/maddox/models"

/**
 * Índices das coleções das Campanhas Maddox (models carregados antes da conexão podem não receber
 * autoIndex). Os únicos sustentam regras: `{ kind, version }` dos roteiros (409 `VERSION_CONFLICT` em
 * gravações concorrentes), uma sessão `active` por campanha/finalidade/membro e `sessionId` das
 * sessões do OpenCode, `{ campaignId, userId }` dos membros e `{ campaignId, kind, memberId }` das
 * entrevistas (uma de cenário por campanha, uma de personagem por membro) e `{ campaignId, turnNumber,
 * memberId }` das declarações da mesa (uma por membro e turno). Idempotente.
 */
export async function ensureMaddoxIndexes(): Promise<void> {
    await Promise.all([
        MaddoxCampaignModel.createIndexes(),
        MaddoxCampaignMemberModel.createIndexes(),
        MaddoxCharacterModel.createIndexes(),
        MaddoxNpcModel.createIndexes(),
        MaddoxCampaignMemoryModel.createIndexes(),
        MaddoxInterviewScriptModel.createIndexes(),
        MaddoxInterviewModel.createIndexes(),
        MaddoxOpencodeSessionModel.createIndexes(),
        MaddoxCampaignMessageModel.createIndexes(),
    ])
}
