import type { CalcPart } from "@/features/character-sheets/utils/dnd-calculations"
import type { AttributeType, SkillName } from "@/features/character-sheets/types/character-sheet.types"
import type { DiceRollResponse } from "@/features/dice-roller/types"
import type {
    MaddoxCampaignStatus,
    MaddoxCheckKind,
    MaddoxCheckMode,
    MaddoxCheckStatus,
    MaddoxCombatOutcome,
    MaddoxCombatantOutcome,
    MaddoxCombatantSide,
    MaddoxGameMessageKind,
    MaddoxRigorLevel,
    MaddoxTurnPhase,
} from "./constants"

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
    /** Teste pedido pelo Maddox (`kind: "check"`, Maddox 5). Pendente só chega ao jogador indicado. */
    check: MaddoxGameCheckDto | null
    /** Card de início ou fim de combate (`kind: "combat"`, Maddox 6). */
    combat: MaddoxGameCombatEventDto | null
    createdAt: string
}

/** Adversário ou aliado do combate, como os jogadores o percebem. */
export interface MaddoxCombatantDto {
    name: string
    side: MaddoxCombatantSide
    quantity: number
    condition: string
    outcome: MaddoxCombatantOutcome | null
}

/** Combate em andamento (Maddox 6). Notas do mestre e a cena final nunca chegam à tela. */
export interface MaddoxGameCombatDto {
    id: string
    title: string
    location: string
    startedTurn: number
    masterTurns: number
    combatants: MaddoxCombatantDto[]
}

export interface MaddoxCombatRewardDto {
    kind: "moedas" | "item" | "outro"
    description: string
    characterName: string | null
    /** Entrou na ficha do personagem (Equilibrado). */
    applied: boolean
    warning: string | null
}

/** Card de início ou fim de combate. No fim, traz o desfecho, os NPCs e as recompensas. */
export interface MaddoxGameCombatEventDto extends MaddoxGameCombatDto {
    event: "start" | "end"
    outcome: MaddoxCombatOutcome | null
    summary: string
    rewards: MaddoxCombatRewardDto[]
    endedTurn: number | null
}

/** Teste pedido pelo Maddox (Maddox 5). A CD só vem quando a campanha a deixa visível. */
export interface MaddoxGameCheckDto {
    status: MaddoxCheckStatus
    round: number
    kind: MaddoxCheckKind
    ability: AttributeType
    skill: SkillName | null
    mode: MaddoxCheckMode
    reason: string
    /** `null` = CD secreta. */
    dc: number | null
    /** Ficha do personagem (prévia do modificador na tela do jogador indicado). */
    sheetId: string | null
    /** Rolado: resultado oficial do motor de dados, com as partes do modificador usado. */
    roll: DiceRollResponse | null
    modifierParts: CalcPart[]
    /** Nome de quem rolou no lugar do jogador (o dono); `null` = o próprio jogador. */
    rolledByName: string | null
    /** Sucesso ou falha (só com a CD visível). */
    success: boolean | null
    cancelReason: string | null
}

/** Teste pendente do turno do mestre, sem detalhes (para a faixa, o painel e o "Rolar no lugar"). */
export interface MaddoxPendingCheckDto {
    checkId: string
    memberId: string
    characterName: string
}

/** NPC que os jogadores conhecem (nome e foto). */
export interface MaddoxGameNpcDto {
    id: string
    name: string
    portraitUrl: string | null
    /** Situação do NPC (morto aparece esmaecido; Maddox 6). */
    status: "active" | "inactive" | "dead" | "unknown"
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
    turn: {
        number: number
        phase: MaddoxTurnPhase
        startedAt: string | null
        generating: boolean
        failed: boolean
        /** O turno do mestre espera as rolagens dos testes pedidos (Maddox 5). */
        awaitingChecks: boolean
        pendingChecks: MaddoxPendingCheckDto[]
    }
    /** Mostra a CD dos testes aos jogadores. */
    showCheckDc: boolean
    /** NPCs que os jogadores conhecem. */
    npcs: MaddoxGameNpcDto[]
    /** Combate narrativo em andamento (Maddox 6). */
    combat: MaddoxGameCombatDto | null
    participants: MaddoxGameParticipantDto[]
    me: {
        memberId: string | null
        isOwner: boolean
        ready: boolean
        eligible: boolean
        declared: boolean
        /** Minha ficha D&D (só a minha; graus com ficha). */
        sheet: { id: string; slug: string } | null
    }
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
    | { type: "check-rolled"; messageId: string; roll: DiceRollResponse }
    | { type: "ping" }
