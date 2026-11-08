import { dbConnect } from "@/lib/db"
import { MaddoxCampaignModel } from "@/features/maddox/models"
import type { CampaignChannelName } from "../network/channel-labels"
import { engramindLog, messageOf } from "./shared"

/**
 * Id e nome de todas as campanhas (inclusive as arquivadas, cujos canais seguem na rede), para os rótulos
 * dos canais em `/memorias`. Só esses dois campos saem do servidor. Falha → `[]` com aviso: a rede mostra
 * os slugs como estão e a página nunca quebra.
 */
export async function listCampaignChannelNames(): Promise<CampaignChannelName[]> {
    try {
        await dbConnect()
        const campaigns = await MaddoxCampaignModel.find({}).select({ name: 1 }).lean<{ _id: unknown; name?: string | null }[]>()
        return campaigns.map((campaign) => ({ id: String(campaign._id), name: campaign.name?.trim() ?? "" })).filter((campaign) => campaign.name)
    } catch (error) {
        engramindLog.warn({ err: messageOf(error) }, "[engramind] nomes das campanhas indisponíveis para os rótulos da rede")
        return []
    }
}
