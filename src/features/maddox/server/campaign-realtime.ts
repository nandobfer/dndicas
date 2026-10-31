import { maddoxUserChannel } from "@/lib/pusher/channel-names"
import { publishToChannels } from "@/lib/pusher/channels"
import { MADDOX_CAMPAIGN_CHANGED_EVENT, MADDOX_INTERVIEW_CHANGED_EVENT, type MaddoxScriptKind } from "../constants"

/**
 * Avisa, no canal de cada usuário (`private-maddox-u-{userId}`), que a campanha mudou. Payload mínimo:
 * a tela recarrega a lista e a campanha. Nunca lança (falha de tempo real só é logada).
 */
export async function notifyCampaignChanged(campaignId: string, userIds: string[]): Promise<void> {
    const channels = [...new Set(userIds.filter(Boolean))].map(maddoxUserChannel)
    await publishToChannels(channels, MADDOX_CAMPAIGN_CHANGED_EVENT, { campaignId })
}

/** Avisa o próprio entrevistado (outras abas) que a entrevista dele mudou. Nunca lança. */
export async function notifyInterviewChanged(campaignId: string, kind: MaddoxScriptKind, userId: string): Promise<void> {
    await publishToChannels([maddoxUserChannel(userId)], MADDOX_INTERVIEW_CHANGED_EVENT, { campaignId, kind })
}
