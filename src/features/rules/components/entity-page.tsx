"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { Chip } from "@/components/ui/chip"
import { ScrollText, ExternalLink, ArrowLeft } from "lucide-react"
import { motionConfig } from "@/lib/config/motion-configs"
import { renderEntity } from "./entity-renderers"
import { useRouter } from "next/navigation"
import { Button } from "@/core/ui/button"
import { EntityPreviewTooltip } from "./entity-preview-tooltip"
import { useWindows } from "@/core/context/window-context"
import { Pencil, Trash2, MoreHorizontal } from "lucide-react"
import { GlassDropdownMenu, GlassDropdownMenuTrigger, GlassDropdownMenuContent, GlassDropdownMenuItem } from "@/components/ui/glass-dropdown-menu"
import { themeConfig } from "@/lib/config/theme-config"

interface EntityPageProps {
    item: any
    entityType: string
    isLoading: boolean
    isAdmin?: boolean
    onEdit?: (item: any) => void
    onDelete?: (item: any) => void
}

export function EntityPage({ item, entityType, isLoading, isAdmin, onEdit, onDelete }: EntityPageProps) {
    const router = useRouter()
    const { addWindow } = useWindows()

    const mentions = React.useMemo(() => {
        if (!item?.description) return []

        const parser = new DOMParser()
        const doc = parser.parseFromString(item.description, "text/html")
        const links = Array.from(doc.querySelectorAll('span[data-type="mention"]'))

        return links
            .map((link) => ({
                id: link.getAttribute("data-id") || "",
                type: link.getAttribute("data-entity-type") || "Regra",
                label: link.getAttribute("data-label") || link.textContent || "",
            }))
            .filter((m) => m.id)
    }, [item?.description])

    if (isLoading) {
        return (
            <div className="min-h-[400px] flex items-center justify-center">
                <LoadingState variant="spinner" message={`Carregando ${entityType.toLowerCase()}...`} />
            </div>
        )
    }

    if (!item) {
        return (
            <div className="py-12">
                <EmptyState title={`${entityType} não encontrada`} description="O item que você procura pode ter sido removido ou o link está incorreto." icon={ScrollText} />
                <div className="mt-6 flex justify-center">
                    <Button variant="ghost" onClick={() => router.back()}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Voltar
                    </Button>
                </div>
            </div>
        )
    }

    const pagePadding = themeConfig.spacing.page.padding
    const negativeMargin = `-${pagePadding}px`

    return (
        <div className="space-y-6 py-2 w-full">
            <motion.div initial="initial" animate="animate" variants={motionConfig.variants.fadeInUp} className="w-full">
                <div className="mb-4 flex items-center justify-between">
                    <Button variant="ghost" size="sm" onClick={() => router.back()} className="text-white/40 hover:text-white">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Voltar
                    </Button>
                </div>

                <GlassCard className="relative overflow-hidden w-full">
                    <GlassCardContent className="p-6 md:p-8">
                        <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2">
                            {isAdmin && (onEdit || onDelete) && (
                                <GlassDropdownMenu>
                                    <GlassDropdownMenuTrigger asChild>
                                        <motion.button
                                            whileHover={{ scale: 1.1 }}
                                            whileTap={{ scale: 0.9 }}
                                            className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                                        >
                                            <MoreHorizontal className="h-4 w-4" />
                                        </motion.button>
                                    </GlassDropdownMenuTrigger>
                                    <GlassDropdownMenuContent align="end">
                                        {onEdit && (
                                            <GlassDropdownMenuItem onClick={() => onEdit(item)}>
                                                <Pencil className="mr-2 h-4 w-4" />
                                                Editar
                                            </GlassDropdownMenuItem>
                                        )}
                                        {onDelete && (
                                            <GlassDropdownMenuItem onClick={() => onDelete(item)} className="text-red-400 hover:text-red-300 focus:text-red-300">
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                Excluir
                                            </GlassDropdownMenuItem>
                                        )}
                                    </GlassDropdownMenuContent>
                                </GlassDropdownMenu>
                            )}

                            <div className="flex items-center gap-2">
                                <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() =>
                                        addWindow({
                                            title: item.name || "Detalhes",
                                            content: null,
                                            item,
                                            entityType: entityType === "Mixed" ? item.type : entityType,
                                        })
                                    }
                                    className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                                    title="Abrir em nova janela"
                                >
                                    <ExternalLink className="h-4 w-4" />
                                </motion.button>
                                <Chip variant={item.status === "active" || item.status === true ? "uncommon" : "common"} size="sm">
                                    {item.status === "active" || item.status === true ? "Ativa" : "Inativa"}
                                </Chip>
                            </div>
                        </div>
                        <div className="max-w-full overflow-hidden">{renderEntity(item, entityType)}</div>
                    </GlassCardContent>
                </GlassCard>

                {mentions.length > 0 && (
                    <div className="space-y-4 pt-8">
                        <div className="flex items-center gap-2 px-4">
                            <ExternalLink className="h-4 w-4 text-white/40" />
                            <h4 className="text-sm font-bold text-white/60 uppercase tracking-widest">Referências encontradas</h4>
                        </div>

                        <div 
                            className="overflow-x-auto no-scrollbar scroll-smooth"
                            style={{ 
                                marginLeft: negativeMargin, 
                                marginRight: negativeMargin,
                                paddingLeft: `${pagePadding}px`,
                                paddingRight: `${pagePadding}px`
                            }}
                        >
                            <div className="flex gap-4 pb-4">
                                {mentions.map((mention, idx) => (
                                    <div key={`${mention.id}-${idx}`} className="w-[35%] shrink-0 min-w-[320px]">
                                        <MentionWrapper mention={mention} isAdmin={isAdmin} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
    )
}

function MentionWrapper({ mention, isAdmin }: { mention: any; isAdmin?: boolean }) {
    const [data, setData] = React.useState<any>(null)
    const [loading, setLoading] = React.useState(true)
    const { addWindow } = useWindows()

    React.useEffect(() => {
        const fetchData = async () => {
            try {
                let endpoint = `/api/core/${mention.type.toLowerCase()}/${mention.id}`
                if (mention.type === "Regra") {
                    endpoint = `/api/rules/${mention.id}`
                } else if (mention.type === "Habilidade") {
                    endpoint = `/api/traits/${mention.id}`
                } else if (mention.type === "Talento") {
                    endpoint = `/api/feats/${mention.id}`
                } else if (mention.type === "Magia") {
                    endpoint = `/api/spells/${mention.id}`
                }

                const res = await fetch(endpoint)
                if (res.ok) {
                    const json = await res.json()
                    setData(json)
                }
            } catch (e) {
                console.error("Failed to fetch entity for related list:", e)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [mention.id, mention.type])

    if (loading) {
        return (
            <GlassCard className="h-full border-white/5 bg-white/[0.02]">
                <GlassCardContent className="p-4 flex items-center justify-center min-h-[60px]">
                    <LoadingState variant="spinner" size="sm" />
                </GlassCardContent>
            </GlassCard>
        )
    }

    if (!data) return null

    return (
        <GlassCard className="border-white/5 hover:border-white/10 transition-colors flex flex-col relative group h-auto">
            <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() =>
                        addWindow({
                            title: data.name || "Detalhes",
                            content: null,
                            item: data,
                            entityType: mention.type,
                        })
                    }
                    className="p-1.5 rounded-lg bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                    title="Abrir em nova janela"
                >
                    <ExternalLink className="h-4 w-4" />
                </motion.button>
                <Chip variant={data.status === "active" || data.status === true ? "uncommon" : "common"} size="sm">
                    {data.status === "active" || data.status === true ? "Ativa" : "Inativa"}
                </Chip>
            </div>
            <GlassCardContent className="p-4 flex-1">
                <div className="scale-[0.85] origin-top-left">
                    {renderEntity(data, mention.type)}
                </div>
            </GlassCardContent>
        </GlassCard>
    )
}
