import type { MaddoxCampaignStatus, MaddoxInterviewStatus, MaddoxMemberRole, MaddoxRigorLevel } from "./constants"

/** DTOs das Campanhas Maddox (Maddox 1). */

export interface MaddoxCampaignCharacterDto {
    id: string
    name: string
    portraitUrl: string | null
    interviewStatus: MaddoxInterviewStatus
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
}

export interface MaddoxCampaignListItemDto {
    id: string
    name: string
    rigor: MaddoxRigorLevel
    status: MaddoxCampaignStatus
    coverUrl: string | null
    ownerId: string
    ownerName: string
    myRole: MaddoxMemberRole
    myCharacter: MaddoxCampaignCharacterDto | null
    members: MaddoxCampaignMemberDto[]
    turnNumber: number
    createdAt: string
    updatedAt: string
}

export interface MaddoxCampaignDetailDto extends MaddoxCampaignListItemDto {
    /** Id do meu registro de membro (sair da campanha). */
    myMemberId: string
    /** Convites abertos nesta fase (`false` em encerrada/arquivada). */
    inviteOpen: boolean
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
