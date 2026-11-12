import type { WorldCatalog } from "./world-catalog"
import type { MaddoxCampaignStatus, MaddoxCombatDifficultyLevel, MaddoxCharacterPortraitStatus, MaddoxDensityLevel, MaddoxInterviewStatus, MaddoxMemberKind, MaddoxMemberRole, MaddoxOpexInterviewMode, MaddoxRigorLevel, MaddoxScenarioStatus, MaddoxTurnPhase } from "./constants"

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

/** Situação do Personagem Opex no lobby (DND-26). */
export type MaddoxOpexStatus = "interviewing" | "awaiting-approval" | "failed" | "ready"

export interface MaddoxOpexMemberDto {
    interviewMode: MaddoxOpexInterviewMode
    status: MaddoxOpexStatus
    /** Motivo da falha (entrevista ou mesa), em pt-BR. */
    error: string | null
    /** Prompt base: só o dono da campanha recebe. */
    prompt: string | null
}

export interface MaddoxCampaignMemberDto {
    id: string
    userId: string
    /** Pessoa ou Personagem Opex (DND-26). */
    kind?: MaddoxMemberKind
    opex?: MaddoxOpexMemberDto | null
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
    /** PV dos inimigos em números no combate tático (DND-53). */
    showEnemyHp: boolean
    /** PV dos aliados NPC em números no combate tático (DND-53). */
    showAllyHp: boolean
    /** Densidade das narrações (DND-22). */
    density: MaddoxDensityLevel
    /** Dificuldade dos combates (DND-42; só vale nos graus táticos). */
    combatDifficulty: MaddoxCombatDifficultyLevel
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
    /** O usuário pode adicionar Personagens Opex (dono com a permissão `maddox.opex`; só no GET do detalhe). */
    canAddOpex?: boolean
    /** Reiniciar a campanha (DND-50): só o dono, com a campanha ativa, pausada, encerrada ou arquivada. */
    canReset?: boolean
    /** A limpeza do reinício ainda roda: "Iniciar campanha" fica bloqueado. */
    resetting?: boolean
    /** Ajustes de ficha pelo Maddox depois do reinício, ainda em andamento ou com falha (só o dono recebe). */
    sheetRestores?: MaddoxSheetRestoreDto[]
}

/** Ajuste da ficha de um personagem pelo Maddox depois do reinício (DND-50). */
export interface MaddoxSheetRestoreDto {
    characterId: string
    characterName: string
    status: "pending" | "failed"
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
