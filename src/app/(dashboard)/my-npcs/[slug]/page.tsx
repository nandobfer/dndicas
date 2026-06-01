"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Loader2 } from "lucide-react"
import { motion } from "framer-motion"
import { EmptyState } from "@/components/ui/empty-state"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { motionConfig } from "@/lib/config/motion-configs"
import { fetchNpcs } from "@/features/monsters/api/npcs-api"
import { NpcPreview } from "@/features/monsters/components/npc-preview"

export default function NpcDetailPage() {
    const params = useParams()
    const router = useRouter()
    const slug = params.slug as string
    const name = decodeURIComponent(slug).replace(/-/g, " ")

    const { data, isLoading, isError } = useQuery({
        queryKey: ["npc-detail", slug],
        queryFn: () => fetchNpcs({ search: name, limit: 20 }),
        enabled: !!slug,
    })

    const npc = React.useMemo(() => {
        if (!data?.items) return null
        return data.items.find((item) => item.name.toLowerCase() === name.toLowerCase()) ?? data.items[0] ?? null
    }, [data, name])

    if (isLoading) {
        return (
            <div className="flex justify-center items-center py-24">
                <Loader2 className="h-6 w-6 animate-spin text-white/40" />
            </div>
        )
    }

    if (isError || !npc) {
        return (
            <div className="py-24">
                <EmptyState title="NPC não encontrado" description="Este NPC não existe ou não pertence a você." />
            </div>
        )
    }

    return (
        <motion.div variants={motionConfig.variants.fadeInUp} initial="initial" animate="animate" className="space-y-6">
            <button
                type="button"
                onClick={() => router.back()}
                className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
            >
                <ArrowLeft className="h-4 w-4" />
                Voltar
            </button>
            <GlassCard>
                <GlassCardContent className="py-6">
                    <NpcPreview monster={npc} entityType="NPC" />
                </GlassCardContent>
            </GlassCard>
        </motion.div>
    )
}
