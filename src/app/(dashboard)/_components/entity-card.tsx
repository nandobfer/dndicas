import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { GlassCard, GlassCardHeader, GlassCardTitle, GlassCardDescription, GlassCardContent } from "@/components/ui/glass-card"
import { cn } from "@/core/utils"
import { entityColors, EntityType } from "@/lib/config/colors"
import { MiniLineChart } from "./charts"
import { LucideIcon } from "lucide-react"
import { AnimatedNumber } from "@/components/ui/animated-number"
import Link from "next/link"

interface Stats {
    active: number
    growth: Array<{ date: string; count: number }>
}

/**
 * T033: Generalized entity card component for dashboard catalog grid.
 *
 * Displays entity statistics with:
 * - Icon and title with entity color theming
 * - Active count badge
 * - Growth chart
 * - Hover animations
 */
export function EntityCard({
    entityType,
    loading: parentLoading,
    index,
    title,
    icon: Icon,
    description,
    href,
    statsEndpoint,
}: {
    entityType: EntityType
    loading?: boolean
    index: number
    title: string
    icon: LucideIcon
    description?: string
    href?: string
    statsEndpoint?: string
}) {
    const [stats, setStats] = React.useState<Stats | null>(null)
    const [loading, setLoading] = React.useState(true)

    React.useEffect(() => {
        if (!statsEndpoint) {
            setLoading(false)
            return
        }

        const fetchStats = async () => {
            try {
                const res = await fetch(statsEndpoint)
                const data = await res.json()
                if (!data.error) setStats(data)
            } catch (err) {
                console.error(`Failed to fetch stats for ${title}`, err)
            } finally {
                setLoading(false)
            }
        }
        fetchStats()
    }, [statsEndpoint, title])

    const config = entityColors[entityType]
    const isMasculine = entityType === "Talento" || entityType === "Usuário"
    const isLoading = parentLoading || loading

    // Estaturas fixas para as barras do skeleton para evitar Erro de Hidratação
    const placeholderHeights = [40, 65, 45, 80, 55, 70, 40, 60, 50, 75, 45, 60]

    const cardContentInternal = (
        <>
            {/* Dynamic Background Hover Effect */}
            <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500 pointer-events-none"
                style={{ backgroundColor: config.hex }}
            />
            
            <div className="absolute top-0 right-0 w-32 h-32 blur-3xl rounded-full opacity-0 group-hover:opacity-20 transition-opacity duration-500 pointer-events-none"
                 style={{ backgroundColor: config.hex }} />
            
            <GlassCardHeader className="pb-0 relative z-10">
                <div className="flex items-start justify-between">
                    <div className={cn("p-2 rounded-lg border transition-all duration-300", config.bgAlpha, config.border, config.text, "group-hover:text-white group-hover:scale-110")}>
                        <Icon className="h-5 w-5" />
                    </div>
                    <div className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-0.5", config.badge, config.border)}>
                        <AnimatedNumber value={isLoading ? 0 : stats?.active || 0} formatter={(val) => `${Math.floor(val)}`} />
                        <span>{isMasculine ? "ativos" : "ativas"}</span>
                    </div>
                </div>
                <GlassCardTitle className="text-white/90 group-hover:text-white mt-3 transition-colors">{title}</GlassCardTitle>
                <GlassCardDescription className="text-white/40 text-xs min-h-[32px]">{description}</GlassCardDescription>
            </GlassCardHeader>
            <GlassCardContent className="pt-4">
                <div className="space-y-3">
                    {isLoading || !stats?.growth ? (
                        <div className="h-8 w-full flex items-end opacity-20 group-hover:opacity-40 transition-opacity">
                            <div className={cn("w-full h-1 bg-gradient-to-r from-transparent via-current to-transparent", config.text)} />
                        </div>
                    ) : (
                        <div className="opacity-60 group-hover:opacity-100 transition-opacity h-12 flex flex-col justify-end">
                            <MiniLineChart data={stats.growth} color={config.hex} />
                        </div>
                    )}
                </div>
            </GlassCardContent>
        </>
    )

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 + index * 0.05 }}
            whileHover={href && !isLoading ? { y: -4 } : undefined}
        >
            <GlassCard 
                className={cn(
                    "h-[212px] group transition-all relative overflow-hidden flex flex-col", 
                    config.border, 
                    !isLoading && config.hoverBorder, 
                    href && !isLoading && "cursor-pointer"
                )}
                style={{
                    background: `linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)`,
                }}
            >
                {/* Static Layout: Icon, Title, Description */}
                <div className="absolute inset-0 z-0 pointer-events-none">
                    <div 
                        className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500"
                        style={{ backgroundColor: config.hex }}
                    />
                    <div className="absolute top-0 right-0 w-32 h-32 blur-3xl rounded-full opacity-0 group-hover:opacity-20 transition-opacity duration-500"
                         style={{ backgroundColor: config.hex }} />
                </div>

                <GlassCardHeader className="pb-0 relative z-10 shrink-0">
                    <div className="flex items-start justify-between">
                        <div className={cn("p-2 rounded-lg border transition-all duration-300", config.bgAlpha, config.border, config.text, "group-hover:text-white group-hover:scale-110")}>
                            <Icon className="h-5 w-5" />
                        </div>
                        
                        <AnimatePresence mode="wait">
                            {isLoading ? (
                                <motion.div
                                    key="badge-loading"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className={cn("h-[18px] w-20 rounded border animate-pulse", config.badge, config.border)}
                                />
                            ) : (
                                <motion.div
                                    key="badge-content"
                                    initial={{ opacity: 0, x: 10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-0.5", config.badge, config.border)}
                                >
                                    <AnimatedNumber value={stats?.active || 0} formatter={(val) => `${Math.floor(val)}`} />
                                    <span>{isMasculine ? "ativos" : "ativas"}</span>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                    <GlassCardTitle className="text-white/90 group-hover:text-white mt-3 transition-colors">{title}</GlassCardTitle>
                    <GlassCardDescription className="text-white/40 text-xs min-h-[32px]">{description}</GlassCardDescription>
                </GlassCardHeader>

                {/* Dynamic Content: Badge (partial) and Bottom Section */}
                <div className="relative z-10 flex-1 flex flex-col pt-4">
                    <AnimatePresence mode="wait">
                        {isLoading ? (
                            <motion.div
                                key="dynamic-loading"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="flex flex-col flex-1"
                            >
                                <GlassCardContent className="mt-auto shrink-0 pb-6">
                                    <div className="h-12 w-full flex items-end gap-1 px-1">
                                        {placeholderHeights.map((height, i) => (
                                            <div
                                                key={i}
                                                className={cn("flex-1 rounded-t animate-pulse", config.bgAlpha)}
                                                style={{ 
                                                    height: `${height}%`,
                                                    opacity: 0.1 + (i % 3) * 0.1,
                                                }}
                                            />
                                        ))}
                                    </div>
                                </GlassCardContent>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="dynamic-content"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4, ease: "easeOut" }}
                                className="flex flex-col flex-1"
                            >
                                <Link href={href || "#"} className={cn("flex flex-col flex-1", !href && "pointer-events-none")}>
                                    <GlassCardContent className="pb-6">
                                        <div className="space-y-3">
                                            {!stats?.growth ? (
                                                <div className="h-8 w-full flex items-end opacity-20 group-hover:opacity-40 transition-opacity">
                                                    <div className={cn("w-full h-1 bg-gradient-to-r from-transparent via-current to-transparent", config.text)} />
                                                </div>
                                            ) : (
                                                <div className="opacity-60 group-hover:opacity-100 transition-opacity h-12 flex flex-col justify-end">
                                                    <MiniLineChart data={stats.growth} color={config.hex} />
                                                </div>
                                            )}
                                        </div>
                                    </GlassCardContent>
                                </Link>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </GlassCard>
        </motion.div>
    )
}
