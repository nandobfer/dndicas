import type { MaddoxCampaignMemoryKind, MaddoxNpcStatus, MaddoxQuestStatus, MaddoxRigorLevel, MaddoxCampaignStatus } from "./constants"

/**
 * DTOs do Diário da campanha (Maddox 9). Só chegam aqui informações que os jogadores conhecem: nada com
 * `visibility: "master"` e nunca as notas exclusivas do mestre (`masterNotes`), que nem existem nestes tipos.
 */

export interface MaddoxJournalStateDto {
    scene: string
    location: string
    situation: string
    pendingDecision: string
    updatedTurn: number | null
}

export interface MaddoxJournalNpcDto {
    id: string
    name: string
    portraitUrl: string | null
    status: MaddoxNpcStatus
    publicDescription: string
    updatedAt: string
}

export interface MaddoxJournalMemoryDto {
    id: string
    kind: MaddoxCampaignMemoryKind
    title: string
    text: string
    tags: string[]
    /** Só nas missões. */
    status: MaddoxQuestStatus | null
    turnNumber: number | null
    updatedAt: string
}

export interface MaddoxJournalPartyMemberDto {
    memberId: string
    playerName: string
    characterId: string
    characterName: string
    portraitUrl: string | null
    /** Perfil narrativo da entrevista (seções de `MADDOX_PROFILE_SECTIONS`). */
    profile: Record<string, string>
    /** Condição atual na história (mantida pelo Maddox). */
    currentState: string
}

export interface MaddoxJournalSummaryDto {
    campaignId: string
    name: string
    rigor: MaddoxRigorLevel
    status: MaddoxCampaignStatus
    turnNumber: number
    /** Eu na campanha (as minhas falas ficam à direita no histórico). */
    myMemberId: string
    maddoxAvatarUrl: string | null
    setting: string
    openingSituation: string
    state: MaddoxJournalStateDto
    activeQuests: MaddoxJournalMemoryDto[]
    counts: { npcs: number; party: number; memories: Record<MaddoxCampaignMemoryKind, number> }
}

export interface MaddoxJournalPageDto<T> {
    items: T[]
    /** Cursor da próxima página (`null` = acabou). */
    nextCursor: string | null
}

export interface MaddoxJournalSearchGroup<T> {
    items: T[]
    hasMore: boolean
}

export interface MaddoxJournalSearchNpcHit {
    id: string
    name: string
    portraitUrl: string | null
    status: MaddoxNpcStatus
    excerpt: string
}

export interface MaddoxJournalSearchMemoryHit {
    id: string
    kind: MaddoxCampaignMemoryKind
    title: string
    status: MaddoxQuestStatus | null
    excerpt: string
}

export interface MaddoxJournalSearchMessageHit {
    id: string
    kind: "narration" | "declaration" | "question" | "answer"
    turnNumber: number
    /** Personagem autor (`null` nas falas do Maddox). */
    characterName: string | null
    excerpt: string
    createdAt: string
}

export interface MaddoxJournalSearchPartyHit {
    memberId: string
    characterName: string
    portraitUrl: string | null
    excerpt: string
}

export interface MaddoxJournalSearchDto {
    query: string
    npcs: MaddoxJournalSearchGroup<MaddoxJournalSearchNpcHit>
    memories: MaddoxJournalSearchGroup<MaddoxJournalSearchMemoryHit>
    messages: MaddoxJournalSearchGroup<MaddoxJournalSearchMessageHit>
    party: MaddoxJournalSearchGroup<MaddoxJournalSearchPartyHit>
    /** Trecho da situação atual, quando ela contém o termo. */
    state: { excerpt: string } | null
}
