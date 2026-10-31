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
    /** Resposta do mestre que falhou (Maddox 4): aviso em pt-BR; `content` vem vazio. */
    error: string | null
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
    /** `failed`: a última geração do mestre falhou e a nova tentativa acontece em instantes (Maddox 4). */
    turn: { number: number; phase: MaddoxTurnPhase; startedAt: string | null; generating: boolean; failed: boolean }
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

// ── Streaming da mesa (Maddox 4) ──────────────────────────────────────────────

/** Geração do Maddox em andamento (narração do turno ou resposta a uma pergunta), igual para todos. */
export interface MaddoxLiveGenerationDto {
    liveId: string
    kind: "narration" | "answer"
    turnNumber: number
    /** Resposta: a pergunta respondida. */
    replyToId: string | null
    /** Texto já transmitido (citações do catálogo em negrito até a gravação). */
    text: string
    /** O Maddox está usando uma ferramenta (consultando ou gravando as anotações da campanha). */
    tool: boolean
    startedAt: string
}

/** Linhas do stream NDJSON da mesa (`GET …/game/stream`). Reconectar recomeça pelo `snapshot`. */
export type MaddoxGameStreamLine =
    | { type: "snapshot"; live: MaddoxLiveGenerationDto[] }
    | { type: "live-start"; live: MaddoxLiveGenerationDto }
    | { type: "delta"; liveId: string; text: string }
    | { type: "tool"; liveId: string; running: boolean }
    | { type: "live-end"; liveId: string; messageId: string | null; error: string | null }
    | { type: "ping" }
