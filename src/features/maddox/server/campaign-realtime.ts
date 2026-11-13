import { maddoxUserChannel } from "@/lib/pusher/channel-names"
import { publishToChannels } from "@/lib/pusher/channels"
import { MADDOX_CAMPAIGN_CHANGED_EVENT, MADDOX_INTERVIEW_CHANGED_EVENT, MADDOX_OPEX_USER_PREFIX, type MaddoxScriptKind } from "../constants"

/**
 * Avisa, no canal de cada usuário (`private-maddox-u-{userId}`), que a campanha mudou. Payload mínimo:
 * a tela recarrega a lista e a campanha. Nunca lança (falha de tempo real só é logada). Ids sintéticos de Personagem
 * Opex (`opex:<memberId>`) ficam de fora: o Pusher recusa o nome do canal e derrubaria o lote inteiro (os humanos
 * também deixariam de receber).
 */
export async function notifyCampaignChanged(campaignId: string, userIds: string[]): Promise<void> {
    const channels = [...new Set(userIds.filter((id) => Boolean(id) && !id.startsWith(MADDOX_OPEX_USER_PREFIX)))].map(maddoxUserChannel)
    await publishToChannels(channels, MADDOX_CAMPAIGN_CHANGED_EVENT, { campaignId })
}

/**
 * Avisa o próprio entrevistado (outras abas) que a entrevista dele mudou. A entrevista de um Personagem Opex (DND-26)
 * avisa o dono da campanha, que a acompanha (e aprova as respostas no modo ao vivo). Nunca lança.
 */
export async function notifyInterviewChanged(campaignId: string, kind: MaddoxScriptKind, userId: string, extra: { memberId?: string } = {}): Promise<void> {
    let target = userId
    let memberId = extra.memberId
    if (userId.startsWith(MADDOX_OPEX_USER_PREFIX)) {
        try {
            const { MaddoxCampaignMemberModel } = await import("../models")
            const member = await MaddoxCampaignMemberModel.findOne({ userId }).select("opex.ownerUserId").lean<{ _id: unknown; opex?: { ownerUserId?: string } | null }>()
            if (!member?.opex?.ownerUserId) return
            target = member.opex.ownerUserId
            memberId = String(member._id)
        } catch {
            return
        }
    }
    await publishToChannels([maddoxUserChannel(target)], MADDOX_INTERVIEW_CHANGED_EVENT, { campaignId, kind, ...(memberId ? { memberId } : {}) })
}
