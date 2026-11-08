/**
 * Rótulos dos canais das campanhas Maddox na rede de `/memorias` (DND-29): a lib `@engramind/client`
 * recebe o mapa pronto (`channelLabels` do provider) e mostra o nome da campanha no lugar do id do meio do
 * slug (`dndicas/maddox/campanhas/<id>/jogadores` → `dndicas/maddox/campanhas/Águas de Prata · Jogadores`).
 * O slug inteiro continua na dica.
 */
import type { ChannelLabel } from "@engramind/client/react"
import type { MaddoxVisibility } from "@/features/maddox/constants"
import { CAMPAIGN_CHANNEL_PREFIX, CAMPAIGN_VISIBILITY_NAMES, campaignChannel } from "../constants"

/** O que a página entrega ao cliente: só o id e o nome de cada campanha. */
export interface CampaignChannelName {
    id: string
    name: string
}

const VISIBILITIES: readonly MaddoxVisibility[] = ["players", "master"]

/**
 * Rótulos dos dois canais de cada campanha: título `<nome> · Jogadores|Mestre`, prefixo
 * `dndicas/maddox/campanhas/` e a dica com o nome. Nome vazio fica de fora (a rede mostra o slug como está).
 */
export function campaignChannelLabels(campaigns: readonly CampaignChannelName[]): Map<string, ChannelLabel> {
    const labels = new Map<string, ChannelLabel>()
    for (const campaign of campaigns) {
        const name = campaign.name?.trim()
        if (!campaign.id || !name) continue
        for (const visibility of VISIBILITIES) {
            const visibilityName = CAMPAIGN_VISIBILITY_NAMES[visibility]
            labels.set(campaignChannel(campaign.id, visibility), {
                title: `${name} · ${visibilityName}`,
                hint: `Memórias da campanha "${name}" (${visibilityName.toLowerCase()})`,
                prefix: CAMPAIGN_CHANNEL_PREFIX,
            })
        }
    }
    return labels
}

export type { ChannelLabel }
