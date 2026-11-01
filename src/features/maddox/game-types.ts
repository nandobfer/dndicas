import type { CalcPart } from "@/features/character-sheets/utils/dnd-calculations"
import type { AttributeType, SkillName } from "@/features/character-sheets/types/character-sheet.types"
import type { DiceRollResponse } from "@/features/dice-roller/types"
import type { CombatEconomy, HpBand } from "./combat-rules"
import type { CombatOption } from "./combat-options"
import type { CombatActionStep, IMaddoxCombatReaction } from "./combat-types"
import type {
    MaddoxCampaignStatus,
    MaddoxConditionKey,
    MaddoxReactionTrigger,
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
    /** Card de início ou fim de combate (`kind: "combat"`, Maddox 6) ou a ordem de iniciativa (Maddox 7). */
    combat: MaddoxGameCombatEventDto | null
    /** Combate tático (Maddox 7): ação de um combatente, rolagem avulsa e janela de reação (pendente só para o indicado). */
    combatAction?: MaddoxCombatActionDto | null
    combatRoll?: MaddoxCombatRollDto | null
    combatReaction?: MaddoxCombatReactionDto | null
    /** "Não fez nada" porque o jogador estava offline na própria vez. */
    offlineSkip?: boolean
    /** Imagem da cena (Maddox 10) ligada à narração ou ao card de fim de combate. */
    sceneImage?: MaddoxGameSceneImageDto | null
    createdAt: string
}

/** Imagem gerada pelo Maddox numa cena (Maddox 10). A descrição enviada ao gerador nunca chega à tela. */
export interface MaddoxGameSceneImageDto {
    id: string
    /** `skipped` nunca chega: imagem descartada não aparece. */
    status: "pending" | "generating" | "done" | "failed"
    url: string | null
    caption: string
    /** Rótulo da situação ("Novo local ou cenário"); `null` no pedido manual. */
    situationLabel: string | null
    source: "tool" | "combat-end" | "manual" | "npc-portrait"
    error: string | null
}

/** Botão "Gerar imagem da cena" e "Gerar retrato" (só o dono): pode pedir agora ou por que não. */
export interface MaddoxSceneImageControlDto {
    /** O usuário é o dono (só ele vê os botões). */
    owner: boolean
    canRequest: boolean
    /** Motivo em pt-BR quando não pode pedir. */
    reason: string | null
    /** Há uma imagem manual sendo gerada. */
    generating: boolean
    /** Imagens que ainda cabem no teto das últimas 24 h. */
    remainingToday: number
    /** Imagens automáticas ligadas nesta campanha (chave do dono). */
    campaignEnabled: boolean
    /** Pode pedir retrato de NPC agora (Gerador disponível e teto do dia com folga). */
    canRequestPortrait: boolean
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
    /** Narrativo (Maddox 6) ou tático (Maddox 7). */
    mode?: "narrative" | "tactical"
    /** Ordem de iniciativa, rodada e quem age (combate tático). */
    tactical?: MaddoxTacticalCombatDto | null
}

// ── Combate tático (Maddox 7) ─────────────────────────────────────────────────

/** Posição na ordem de iniciativa, como todos a veem. CA e PV dos adversários ficam com o mestre (só a faixa). */
export interface MaddoxTacticalSlotDto {
    actorKey: string
    kind: "character" | "combatant"
    side: "personagem" | "inimigo" | "aliado"
    name: string
    portraitUrl: string | null
    memberId: string | null
    /** `null` = ainda não rolou. */
    initiative: number | null
    active: boolean
    /** PV dos personagens (o grupo vê). */
    hp: { current: number; max: number; temp: number } | null
    /** Faixa de PV dos adversários. */
    band: HpBand | null
    conditions: { key: MaddoxConditionKey; label: string }[]
    concentration: string | null
    defeated: boolean
    dead: boolean
    stable: boolean
    dying: boolean
}

export interface MaddoxTacticalCombatDto {
    phase: "initiative" | "running"
    round: number
    activeKey: string | null
    order: MaddoxTacticalSlotDto[]
}

export interface MaddoxCombatActionDto {
    actorKey: string
    actorName: string
    actorKind: "character" | "combatant"
    economy: "action" | "bonus" | "reaction"
    category: string
    label: string
    targets: { actorKey: string; name: string }[]
    spellLevel: number | null
    freeText: string | null
    status: "pending" | "resolved" | "cancelled"
    steps: CombatActionStep[]
    summary: string
    cancellable: boolean
    round: number
}

export interface MaddoxCombatRollDto {
    kind: "initiative" | "death-save" | "concentration" | "save" | "damage"
    status: "pending" | "rolled" | "cancelled"
    reason: string
    dice: string
    mode: "normal" | "advantage" | "disadvantage"
    dc: number | null
    roll: DiceRollResponse | null
    total: number | null
    success: boolean | null
    outcome: string | null
    rolledByName: string | null
}

export interface MaddoxCombatReactionDto {
    status: IMaddoxCombatReaction["status"]
    trigger: MaddoxReactionTrigger
    description: string
    /** Só chegam ao jogador indicado (pendente). */
    options: Pick<CombatOption, "id" | "label" | "detail">[]
    choice: string | null
    deadline: string
    outcome: string | null
}

/** A minha vez no combate tático: economia e o que posso usar (recalculado da ficha a cada leitura). */
export interface MaddoxMyCombatDto {
    myTurn: boolean
    actorKey: string | null
    economy: CombatEconomy | null
    attacksPerAction: number
    options: { action: CombatOption[]; bonus: CombatOption[] } | null
    dying: boolean
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
    event: "start" | "end" | "order"
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
    /** Retrato sendo gerado (Maddox 10). */
    portraitGenerating?: boolean
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
        /** Combate tático: de quem é a vez neste turno dos jogadores. */
        combatActor?: { actorKey: string; memberId: string; characterName: string } | null
        /** Combate tático: rolagens e reações que o turno do mestre espera (para a faixa e o "no lugar" do dono). */
        pendingCombat?: { id: string; kind: "roll" | "reaction"; memberId: string; characterName: string; label: string }[]
    }
    /** Mostra a CD dos testes aos jogadores. */
    showCheckDc: boolean
    /** NPCs que os jogadores conhecem. */
    npcs: MaddoxGameNpcDto[]
    /** Imagens nas cenas (Maddox 10): situação do pedido manual e do retrato para o dono. */
    sceneImages?: MaddoxSceneImageControlDto
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
        /** Combate tático (Maddox 7). */
        combat?: MaddoxMyCombatDto | null
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
    | { type: "combat-rolled"; messageId: string; roll: DiceRollResponse }
    | { type: "ping" }
