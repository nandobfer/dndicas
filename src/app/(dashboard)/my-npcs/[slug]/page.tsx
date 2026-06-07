"use client"

import * as React from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Copy, Loader2, MoreHorizontal, Pencil } from "lucide-react"
import { motion } from "framer-motion"
import { EmptyState } from "@/components/ui/empty-state"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { GlassDropdownMenu, GlassDropdownMenuContent, GlassDropdownMenuItem, GlassDropdownMenuTrigger } from "@/components/ui/glass-dropdown-menu"
import { motionConfig } from "@/lib/config/motion-configs"
import { fetchNpcs } from "@/features/monsters/api/npcs-api"
import { NpcPreview } from "@/features/monsters/components/npc-preview"
import { UserNpcFormModal } from "@/features/monsters/components/user-npc-form-modal"
import { getNpcDetailHref, useCopyToNpcAction } from "@/features/monsters/hooks/useCopyToNpcAction"

export default function NpcDetailPage() {
    const params = useParams()
    const router = useRouter()
    const searchParams = useSearchParams()
    const queryClient = useQueryClient()
    const slug = params.slug as string
    const name = decodeURIComponent(slug).replace(/-/g, " ")
    const [isEditOpen, setIsEditOpen] = React.useState(false)
    const copyToNpcAction = useCopyToNpcAction("npc", { openFormOnCopy: false, onCopied: (npc) => router.push(getNpcDetailHref(npc, { edit: true })) })
    const isEditQueryOpen = searchParams.get("edit") === "1"
    const isNpcFormOpen = isEditOpen || isEditQueryOpen

    const handleCloseNpcForm = React.useCallback(() => {
        setIsEditOpen(false)
        if (isEditQueryOpen) router.replace(`/my-npcs/${slug}`, { scroll: false })
    }, [isEditQueryOpen, router, slug])

    const { data, isLoading } = useQuery({
        queryKey: ["npc-detail", slug],
        queryFn: () => fetchNpcs({ search: name, limit: 20 }),
        enabled: !!slug,
        staleTime: 60 * 1000,
    })

    const npc = React.useMemo(() => {
        if (!data?.items) return null
        return data.items.find((item) => item.name.toLowerCase() === name.toLowerCase()) ?? data.items[0] ?? null
    }, [data, name])

    if (isLoading && !npc) {
        return (
            <div className="flex justify-center items-center py-24">
                <Loader2 className="h-6 w-6 animate-spin text-white/40" />
            </div>
        )
    }

    if (!npc) {
        return (
            <div className="py-24">
                <EmptyState title="NPC não encontrado" description="Este NPC não existe ou não pertence a você." />
            </div>
        )
    }

    return (
        <motion.div variants={motionConfig.variants.fadeInUp} initial="initial" animate="animate" className="space-y-6">
            <div className="flex items-center justify-between gap-3">
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar
                </button>
                <GlassDropdownMenu>
                    <GlassDropdownMenuTrigger asChild>
                        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors">
                            <MoreHorizontal className="h-4 w-4" />
                        </motion.button>
                    </GlassDropdownMenuTrigger>
                    <GlassDropdownMenuContent align="end">
                        <GlassDropdownMenuItem onClick={() => copyToNpcAction.handleCopyToNpc(npc)}>
                            <Copy className="mr-2 h-4 w-4" />
                            Copiar para NPC
                        </GlassDropdownMenuItem>
                        <GlassDropdownMenuItem onClick={() => setIsEditOpen(true)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                        </GlassDropdownMenuItem>
                    </GlassDropdownMenuContent>
                </GlassDropdownMenu>
            </div>
            <GlassCard>
                <GlassCardContent className="py-6">
                    <NpcPreview monster={npc} entityType="NPC" />
                </GlassCardContent>
            </GlassCard>
            <UserNpcFormModal npc={npc} isOpen={isNpcFormOpen} onClose={handleCloseNpcForm} onSuccess={() => queryClient.invalidateQueries({ queryKey: ["npc-detail", slug] })} />
        </motion.div>
    )
}
