import { Types } from "mongoose"
import { dbConnect } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { MADDOX_OPEX_USER_PREFIX } from "../constants"
import { MaddoxCampaignMemberModel, MaddoxCampaignModel, MaddoxCharacterModel, type IMaddoxCampaign, type IMaddoxCampaignMember, type IMaddoxCharacter } from "../models"

/**
 * Personagens Opex (DND-26): identidade e carga dos membros controlados por IA — SOMENTE servidor.
 *
 * O membro Opex tem `kind: "opex"` e o `userId` sintético `opex:<memberId>`. Com ele, os serviços de jogo que acham o
 * membro pelo `userId` (`loadMembership`, `assertMemberCanPlay`, entrevistas, testes, combate) funcionam sem regra nova.
 * A ficha D&D fica com o dono da campanha (`opex.ownerUserId`), para aparecer em "Minhas fichas".
 */

type MemberDoc = IMaddoxCampaignMember
type CampaignDoc = IMaddoxCampaign
type CharacterDoc = IMaddoxCharacter

export const opexUserIdFor = (memberId: Types.ObjectId | string) => `${MADDOX_OPEX_USER_PREFIX}${String(memberId)}`
export const isOpexUserId = (userId: string | null | undefined) => typeof userId === "string" && userId.startsWith(MADDOX_OPEX_USER_PREFIX)
export const isOpexMember = (member: Pick<MemberDoc, "kind"> | null | undefined) => member?.kind === "opex"

/** Só os usuários de verdade (canais do Pusher, busca de nomes): os ids sintéticos dos Opex ficam de fora. */
export const realUserIds = (ids: readonly (string | null | undefined)[]) => ids.filter((id): id is string => typeof id === "string" && id.length > 0 && !isOpexUserId(id))

/** Dono da ficha D&D do membro: o dono da campanha para o Personagem Opex, o próprio usuário para os demais. */
export const sheetOwnerUserId = (member: Pick<MemberDoc, "userId" | "kind" | "opex">) => (isOpexMember(member) && member.opex?.ownerUserId ? member.opex.ownerUserId : member.userId)

/** Personagens Opex ativos da campanha, na ordem em que foram adicionados. */
export async function opexMembersOf(campaignId: Types.ObjectId): Promise<MemberDoc[]> {
    return MaddoxCampaignMemberModel.find({ campaignId, kind: "opex", status: "joined" }).sort({ "opex.addedAt": 1, createdAt: 1 }).lean<MemberDoc[]>()
}

/** `userId` sintéticos dos Opex ativos (presença: o Opex sempre conta como presente). */
export async function opexUserIdsOf(campaignId: string): Promise<string[]> {
    if (!Types.ObjectId.isValid(campaignId)) return []
    const rows = await MaddoxCampaignMemberModel.find({ campaignId: new Types.ObjectId(campaignId), kind: "opex", status: "joined" }).select("userId").lean<{ userId: string }[]>()
    return rows.map((row) => row.userId)
}

/**
 * Campanha + Personagem Opex para uma ação do dono: quem não participa recebe 404, um jogador 403 e um membro que não é
 * Opex (ou já saiu) 404.
 */
export async function loadOpexAsOwner(campaignId: string, memberId: string, userId: string): Promise<{ campaign: CampaignDoc; member: MemberDoc; character: CharacterDoc | null }> {
    if (!Types.ObjectId.isValid(campaignId)) throw new DomainError(404, "Campanha não encontrada", "NOT_FOUND")
    await dbConnect()
    const campaign = await MaddoxCampaignModel.findById(campaignId).lean<CampaignDoc>()
    if (!campaign) throw new DomainError(404, "Campanha não encontrada", "NOT_FOUND")
    if (campaign.ownerId !== userId) {
        const isMember = await MaddoxCampaignMemberModel.exists({ campaignId: campaign._id, userId, status: "joined" })
        if (!isMember) throw new DomainError(404, "Campanha não encontrada", "NOT_FOUND")
        throw new DomainError(403, "Só o dono da campanha pode cuidar dos Personagens Opex.", "FORBIDDEN")
    }
    if (!Types.ObjectId.isValid(memberId)) throw new DomainError(404, "Personagem Opex não encontrado", "NOT_FOUND")
    const member = await MaddoxCampaignMemberModel.findOne({ _id: new Types.ObjectId(memberId), campaignId: campaign._id, kind: "opex", status: "joined" }).lean<MemberDoc>()
    if (!member) throw new DomainError(404, "Personagem Opex não encontrado", "NOT_FOUND")
    const character = member.characterId ? await MaddoxCharacterModel.findById(member.characterId).lean<CharacterDoc>() : null
    return { campaign, member, character }
}
