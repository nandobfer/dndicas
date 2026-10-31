import type { MaddoxCampaignStatus, MaddoxGameMessageKind, MaddoxRigorLevel, MaddoxTurnPhase } from "./constants"

/** DTOs da mesa (Maddox 3). Todos os membros recebem os mesmos dados; `me` é o que muda por usuário. */

export interface MaddoxGameMessageDto {
    id: string
    turnNumber: number
    phase: MaddoxTurnPhase
    kind: MaddoxGameMessageKind
    memberId: string | null
    characterName: string | null
    portraitUrl: string | null
    content: string
    replyToId: string | null
    /** Nome do dono que pulou o jogador ("não fez nada" registrado por ele). */
    skippedByName: string | null
    createdAt: string
}

export interface MaddoxGameParticipantDto {
    memberId: string
    userId: string
    name: string
    characterName: string | null
    portraitUrl: string | null
    role: "owner" | "player"
    /** Concluiu a entrevista de personagem. */
    ready: boolean
    /** Faz parte do turno dos jogadores atual (fixado ao abrir o turno). */
    eligible: boolean
    /** Já declarou ou passou neste turno. */
    declared: boolean
}

export interface MaddoxGameStateDto {
    campaignId: string
    name: string
    rigor: MaddoxRigorLevel
    status: MaddoxCampaignStatus
    ownerId: string
    maddoxAvatarUrl: string | null
    turn: { number: number; phase: MaddoxTurnPhase; startedAt: string | null; generating: boolean }
    participants: MaddoxGameParticipantDto[]
    me: { memberId: string | null; isOwner: boolean; ready: boolean; eligible: boolean; declared: boolean }
    /** Mensagens mais recentes, em ordem cronológica. */
    messages: MaddoxGameMessageDto[]
    /** Há mensagens anteriores (cursor = id da primeira). */
    hasMore: boolean
}

export interface MaddoxGameMessagesPageDto {
    messages: MaddoxGameMessageDto[]
    hasMore: boolean
}
