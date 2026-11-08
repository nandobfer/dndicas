"use client"

import type { ReactNode } from "react"
import type { UniverseLayoutConfig } from "@engramind/client"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { createHttpDataSource, EngramindProvider } from "@engramind/client/react"
import { withBasePath } from "@/lib/base-path"
import { ENGRAMIND_APP } from "../../constants"
import { useUniverseLayout } from "../../hooks/useUniverseLayout"

const dataSource = createHttpDataSource({ basePath: withBasePath("/api/engramind") })
const navigation = { useRouter, usePathname, useSearchParams }

/**
 * Provider da lib `@engramind/client` no modo app: proxy e SSE do dndicas (`/api/engramind/**`), links e
 * navegação do Next, toasts do sonner e o tema do app (a lib usa só os tokens do Tailwind/shadcn). Os
 * textos padrão da lib já são pt-BR. "Configurar" leva à integração. `universeLayout` (lido pela página no
 * servidor; `null` = padrão da lib) é o layout dos universos da aba Visualização (DND-34): a consulta parte
 * dele e é relida quando o SSE avisa `universe-layout.updated`, sem recarregar a página.
 */
export function MemoriesProvider({ children, universeLayout = null }: { children: ReactNode; universeLayout?: UniverseLayoutConfig | null }) {
    const router = useRouter()
    const layout = useUniverseLayout({ initial: universeLayout, live: true })
    return (
        <EngramindProvider
            dataSource={dataSource}
            events={withBasePath("/api/engramind/events")}
            app={ENGRAMIND_APP}
            appName="DnDicas"
            navigation={navigation}
            universeLayout={layout.data && !layout.data.isDefault ? layout.data.config : null}
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
