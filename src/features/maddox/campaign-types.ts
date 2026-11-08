import type { WorldCatalog } from "./world-catalog"
import type { MaddoxCampaignStatus, MaddoxCharacterPortraitStatus, MaddoxDensityLevel, MaddoxInterviewStatus, MaddoxMemberRole, MaddoxRigorLevel, MaddoxScenarioStatus, MaddoxTurnPhase } from "./constants"

/** DTOs das Campanhas Maddox (Maddox 1). */

export interface MaddoxCampaignCharacterDto {
    id: string
    /** Vazio até a entrevista combinar o nome (a tela mostra `MADDOX_CHARACTER_UNNAMED_LABEL`). */
    name: string
    portraitUrl: string | null
    /** Retrato gerado ao concluir a entrevista (DND-31): `null` = nunca pedido. */
    portraitStatus: MaddoxCharacterPortraitStatus | null
    interviewStatus: MaddoxInterviewStatus
    /** Perfil narrativo consolidado pela entrevista (seções de `MADDOX_PROFILE_SECTIONS`). */
    profile: Record<string, string>
    /** Ficha D&D criada pela entrevista (rigor Equilibrado ou acima): `/sheets/<slug>`. */
    sheetSlug: string | null
}

export interface MaddoxCampaignMemberDto {
    id: string
    userId: string
    name: string
    username: string | null
    avatarUrl: string | null
    role: MaddoxMemberRole
    joinedAt: string | null
    character: MaddoxCampaignCharacterDto | null
    /** Pronto para entrar no jogo: a entrevista de personagem foi concluída. */
    ready: boolean
}

export interface MaddoxCampaignListItemDto {
    id: string
    name: string
    rigor: MaddoxRigorLevel
    status: MaddoxCampaignStatus
    coverUrl: string | null
    /** Última imagem de cena concluída da campanha (DND-35), pela data do pedido; retrato de NPC não conta. Só na lista. */
    lastSceneImageUrl: string | null
    ownerId: string
    ownerName: string
    myRole: MaddoxMemberRole
    myCharacter: MaddoxCampaignCharacterDto | null
    members: MaddoxCampaignMemberDto[]
    turnNumber: number
    /** Fase do turno atual (Maddox 3; só tem sentido com a campanha em andamento). */
    turnPhase: MaddoxTurnPhase
    /** Título do combate narrativo em andamento (Maddox 6); `null` = fora de combate. */
    combatTitle?: string | null
    /** Quando o dono iniciou a campanha (Maddox 3). */
    startedAt: string | null
    /** Entrevista de cenário (Maddox 2). */
    scenarioStatus: MaddoxScenarioStatus
    /** CD dos testes visível aos jogadores (Maddox 5). */
    showCheckDc: boolean
    /** Imagens automáticas nas cenas (Maddox 10). */
    sceneImages: boolean
    /** Declarações dos outros jogadores ocultas no chat (DND-36). */
    hidePlayerActions: boolean
    /** Densidade das narrações (DND-22). */
    density: MaddoxDensityLevel
    /** Nível inicial da mesa (graus com ficha; `null` = cada personagem informa). */
    startingLevel: number | null
    /** Estágio de experiência inicial (graus narrativos). */
    startingStage: string
    /** Povos e classes do mundo (Maddox 8, Fiel ao D&D); listas vazias = todo o catálogo. */
    worldCatalog: WorldCatalog
    createdAt: string
    updatedAt: string
}

export interface MaddoxCampaignDetailDto extends Omit<MaddoxCampaignListItemDto, "lastSceneImageUrl"> {
    /** Id do meu registro de membro (sair da campanha). */
    myMemberId: string
    /** Convites abertos nesta fase (`false` em encerrada/arquivada). */
    inviteOpen: boolean
    /** Cenário consolidado e situação inicial (Markdown; vazios até concluir a entrevista de cenário). */
    setting: string
    openingSituation: string
    /** O rigor não muda mais (a entrevista de cenário já começou ou a campanha saiu do lobby). */
    rigorLocked: boolean
}

export interface MaddoxInviteLinkDto {
    token: string
    rotatedAt: string | null
}

export interface MaddoxInvitePreviewDto {
    campaignId: string
    name: string
    rigor: MaddoxRigorLevel
    status: MaddoxCampaignStatus
    coverUrl: string | null
    ownerName: string
    memberCount: number
    /** Já sou membro ativo: a tela leva direto para a campanha. */
    alreadyMember: boolean
    inviteOpen: boolean
}
