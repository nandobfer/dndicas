"use client"

import { useMemo, type ReactNode } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { createHttpDataSource, EngramindProvider } from "@engramind/client/react"
import { withBasePath } from "@/lib/base-path"
import { ENGRAMIND_APP } from "../../constants"
import { campaignChannelLabels, type CampaignChannelName } from "../../network/channel-labels"

const dataSource = createHttpDataSource({ basePath: withBasePath("/api/engramind") })
const navigation = { useRouter, usePathname, useSearchParams }
const NO_CAMPAIGNS: readonly CampaignChannelName[] = []

/**
 * Provider da lib `@engramind/client` no modo app: proxy e SSE do dndicas (`/api/engramind/**`), links e
 * navegação do Next, toasts do sonner e o tema do app (a lib usa só os tokens do Tailwind/shadcn). Os
 * textos padrão da lib já são pt-BR. "Configurar" leva à integração. `campaigns` (id e nome, lidos pela
 * página) viram os rótulos dos canais das campanhas: o nome no lugar do id (DND-29).
 */
export function MemoriesProvider({ children, campaigns = NO_CAMPAIGNS }: { children: ReactNode; campaigns?: readonly CampaignChannelName[] }) {
    const router = useRouter()
    const channelLabels = useMemo(() => campaignChannelLabels(campaigns), [campaigns])
    return (
        <EngramindProvider
            dataSource={dataSource}
            events={withBasePath("/api/engramind/events")}
            app={ENGRAMIND_APP}
            appName="DnDicas"
            navigation={navigation}
            channelLabels={channelLabels}
            renderLink={({ href, children, ...props }) => (
                <Link href={href} {...props}>
                    {children}
                </Link>
            )}
            notify={(kind, message) => toast[kind](message)}
            hrefs={{ network: "/memorias", channel: (slug) => `/memorias/canais/${encodeURIComponent(slug)}` }}
            onConfigure={() => router.push("/integracoes/engramind")}
        >
            {children}
        </EngramindProvider>
    )
}
