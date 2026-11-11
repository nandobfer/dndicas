import {
    MaddoxCampaignMemberModel,
    MaddoxCampaignMessageModel,
    MaddoxCampaignModel,
    MaddoxCharacterModel,
    MaddoxCombatModel,
    MaddoxCombatOptionProfileModel,
    MaddoxInterviewModel,
    MaddoxInterviewScriptModel,
    MaddoxNpcModel,
    MaddoxOpencodeSessionModel,
    MaddoxSceneImageModel,
    MaddoxCampaignSnapshotModel,
    MaddoxMemoryRepairModel,
} from "@/features/maddox/models"

/**
 * Índices das coleções das Campanhas Maddox (models carregados antes da conexão podem não receber
 * autoIndex). Os únicos sustentam regras: `{ kind, version }` dos roteiros (409 `VERSION_CONFLICT` em
 * gravações concorrentes), uma sessão `active` por campanha/finalidade/membro e `sessionId` das
 * sessões do OpenCode, `{ campaignId, userId }` dos membros e `{ campaignId, kind, memberId }` das
 * entrevistas (uma de cenário por campanha, uma de personagem por membro) e `{ campaignId, turnNumber,
 * memberId }` das declarações da mesa (uma por membro e turno) e `{ campaignId, turnNumber, check.round,
 * memberId }` dos testes pedidos pelo Maddox (um por personagem em cada rodada) e `{ campaignId }` do combate
 * ativo (Maddox 6: um por campanha), a janela de reação pendente por personagem e o cache do classificador de custo
 * (Maddox 7), uma imagem automática por turno do mestre (Maddox 10) e um retrato por turno jogado (DND-44) e uma cópia das fichas do início por campanha (DND-50). Idempotente.
 */
export async function ensureMaddoxIndexes(): Promise<void> {
    await Promise.all([
        MaddoxCampaignModel.createIndexes(),
        MaddoxCampaignMemberModel.createIndexes(),
        MaddoxCharacterModel.createIndexes(),
        MaddoxNpcModel.createIndexes(),
        MaddoxInterviewScriptModel.createIndexes(),
        MaddoxInterviewModel.createIndexes(),
        MaddoxOpencodeSessionModel.createIndexes(),
        MaddoxCampaignMessageModel.createIndexes(),
        MaddoxCombatModel.createIndexes(),
        MaddoxCombatOptionProfileModel.createIndexes(),
        MaddoxSceneImageModel.createIndexes(),
        MaddoxCampaignSnapshotModel.createIndexes(),
        MaddoxMemoryRepairModel.createIndexes(),
    ])
}
