"use client"

import Link from "next/link"
import { Brain } from "lucide-react"
import { ChannelDetail, EngramindNetwork } from "@engramind/client/react"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { Button } from "@/components/ui/opex/button"
import { MemoriesProvider } from "./MemoriesProvider"

/** Estado vazio de `/memorias` com a integração Engramind sem configuração. */
export function MemoriesNotConfigured({ canConfigure }: { canConfigure: boolean }) {
    return (
        <GlassCard data-testid="memories-not-configured">
            <GlassCardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <Brain className="h-10 w-10 text-primary" aria-hidden />
                <h2 className="text-lg font-semibold">Rede de memórias não configurada</h2>
                <p className="max-w-md text-sm text-muted-foreground">As memórias dos agentes do dndicas ficam no Engramind. Configure a integração para ver a rede aqui.</p>
                {canConfigure ? (
                    <Button asChild>
                        <Link href="/integracoes/engramind">Configurar a integração Engramind</Link>
                    </Button>
                ) : (
                    <p className="text-sm text-muted-foreground">Peça a um administrador para configurar a integração Engramind.</p>
                )}
            </GlassCardContent>
        </GlassCard>
    )
}

/**
 * Página `/memorias`: a rede de memórias do dndicas (agentes × canais) pela lib `@engramind/client` no
 * modo app. Só leitura (o proxy recusa mutações de memória); `memories.edit` libera a importação.
 */
export function MemoriasPage({ configured, canConfigure }: { configured: boolean; canConfigure: boolean }) {
    if (!configured) return <MemoriesNotConfigured canConfigure={canConfigure} />
    return (
        <MemoriesProvider>
            <EngramindNetwork />
        </MemoriesProvider>
    )
}

/** Página `/memorias/canais/[channel]`. */
export function MemoriesChannelPage({ slug, configured, canConfigure }: { slug: string; configured: boolean; canConfigure: boolean }) {
    if (!configured) return <MemoriesNotConfigured canConfigure={canConfigure} />
    return (
        <MemoriesProvider>
            <ChannelDetail slug={slug} />
        </MemoriesProvider>
    )
}
