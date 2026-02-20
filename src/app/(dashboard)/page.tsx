"use client"

import * as React from "react"
import { GlassCard, GlassCardHeader, GlassCardTitle, GlassCardDescription, GlassCardContent } from "@/components/ui/glass-card"
import { Users, FileText, Shield, Sparkles, Sword, Scroll, Zap, Wand2, Backpack, Map, Fingerprint, TrendingUp, Activity, Clock } from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "@/core/utils"
import { colors } from "@/lib/config/colors"

// Types for the stats
interface DashboardStats {
    users: {
        total: number
        active: number
        growth: Array<{ date: string; count: number }>
    }
    auditLogs: {
        total: number
        activity: Array<{ date: string; count: number }>
    }
}

/**
 * Simple animated bar chart component for a modern look.
 */
function MiniBarChart({ data, color }: { data: Array<{ count: number }>; color: string }) {
    const max = Math.max(...data.map((d) => d.count), 1)

    return (
        <div className="flex items-end gap-1 h-12 w-full">
            {data.map((d, i) => (
                <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    animate={{ height: `${(d.count / max) * 100}%` }}
                    transition={{ delay: i * 0.05, duration: 0.5 }}
                    style={{ backgroundColor: color }}
                    className="flex-1 rounded-t-sm opacity-60"
                />
            ))}
        </div>
    )
}

/**
 * Simple animated line chart using SVG.
 */
function MiniLineChart({ data, color }: { data: Array<{ count: number }>; color: string }) {
    const max = Math.max(...data.map((d) => d.count), 1)
    const points = data
        .map((d, i) => {
            const x = (i / (data.length - 1)) * 100
            const y = 100 - (d.count / max) * 100
            return `${x},${y}`
        })
        .join(" ")

    return (
        <div className="h-12 w-full pt-2">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
                <motion.polyline
                    fill="none"
                    stroke={color}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={points}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 0.8 }}
                    transition={{ duration: 1, ease: "easeOut" }}
                />
            </svg>
        </div>
    )
}

const wipEntities = [
    { title: "Classes", icon: Sword, description: "Classes de personagem (Guerreiro, Mago, etc.)" },
    { title: "Raças", icon: Fingerprint, description: "Raças jogáveis (Humano, Elfo, etc.)" },
    { title: "Regras", icon: Scroll, description: "Catálogo de regras do sistema" },
    { title: "Talentos", icon: Zap, description: "Talentos e habilidades especiais" },
    { title: "Habilidades", icon: Sparkles, description: "Traits e habilidades de classe/raça" },
    { title: "Magias", icon: Wand2, description: "Catálogo completo de feitiços" },
    { title: "Itens", icon: Backpack, description: "Equipamentos, armas e itens mágicos" },
    { title: "Origens", icon: Map, description: "Antecedentes e origens dos heróis" },
]

export default function DashboardPage() {
    const [stats, setStats] = React.useState<DashboardStats | null>(null)
    const [loading, setLoading] = React.useState(true)

    React.useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch("/api/dashboard/stats")
                const data = await res.json()
                if (!data.error) setStats(data)
            } catch (err) {
                console.error("Failed to fetch stats", err)
            } finally {
                setLoading(false)
            }
        }
        fetchStats()
    }, [])

    return (
        <div className="flex flex-col gap-8 pb-12">
            {/* Header */}
            <div className="space-y-2">
                <motion.h1
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-4xl font-bold tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-r from-white to-white/40"
                >
                    Dashboard
                </motion.h1>
                <motion.p initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="text-white/60 text-lg">
                    Visão geral dos dados e monitoramento do sistema D&Dicas.
                </motion.p>
            </div>

            {/* Real Data Stats */}
            <div className="grid gap-6 md:grid-cols-2">
                {/* Users Stat */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                    <GlassCard className="h-full border-blue-500/20 group hover:border-blue-500/40 transition-colors overflow-hidden">
                        <GlassCardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <GlassCardTitle className="text-white/70 text-sm font-medium flex items-center gap-2">
                                        <Users className="h-4 w-4 text-blue-400" />
                                        Comunidade
                                    </GlassCardTitle>
                                    <div className="text-3xl font-bold text-white">{loading ? "..." : stats?.users.total || 0}</div>
                                </div>
                                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                                    <TrendingUp className="h-6 w-6 text-blue-400" />
                                </div>
                            </div>
                        </GlassCardHeader>
                        <GlassCardContent>
                            <div className="space-y-4">
                                <div className="flex items-end justify-between">
                                    <p className="text-xs text-white/40">Usuários ativos e crescimento semanal</p>
                                    <div className="text-emerald-400 text-xs font-medium bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/20">
                                        +{loading ? 0 : stats?.users.active} ativos
                                    </div>
                                </div>
                                {stats?.users.growth && <MiniBarChart data={stats.users.growth} color={colors.rarity.uncommon} />}
                            </div>
                        </GlassCardContent>
                    </GlassCard>
                </motion.div>

                {/* Audit Logs Stat */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                    <GlassCard className="h-full border-purple-500/20 group hover:border-purple-500/40 transition-colors overflow-hidden">
                        <GlassCardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <GlassCardTitle className="text-white/70 text-sm font-medium flex items-center gap-2">
                                        <Activity className="h-4 w-4 text-purple-400" />
                                        Segurança
                                    </GlassCardTitle>
                                    <div className="text-3xl font-bold text-white">{loading ? "..." : stats?.auditLogs.total || 0}</div>
                                </div>
                                <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
                                    <FileText className="h-6 w-6 text-purple-400" />
                                </div>
                            </div>
                        </GlassCardHeader>
                        <GlassCardContent>
                            <div className="space-y-4">
                                <div className="flex items-end justify-between">
                                    <p className="text-xs text-white/40">Atividades auditadas nas últimas 24h</p>
                                    <div className="text-purple-400 text-xs font-medium bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20 flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        Em tempo real
                                    </div>
                                </div>
                                {stats?.auditLogs.activity && <MiniLineChart data={stats.auditLogs.activity} color={colors.rarity.veryRare} />}
                            </div>
                        </GlassCardContent>
                    </GlassCard>
                </motion.div>
            </div>

            {/* In Development Features */}
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                        <Sparkles className="h-6 w-6 text-yellow-500" />
                        Catálogo D&D (WIP)
                    </h2>
                    <span className="text-xs font-semibold px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-white/40 uppercase tracking-widest">Em Breve</span>
                </div>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {wipEntities.map((entity, index) => (
                        <motion.div key={entity.title} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 + index * 0.05 }}>
                            <GlassCard className="h-full border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors relative group overflow-hidden">
                                <GlassCardHeader className="pb-0">
                                    <div className="flex items-start justify-between">
                                        <div className="p-2 rounded-lg bg-white/5 border border-white/10 text-white/40 group-hover:text-white/60 transition-colors">
                                            <entity.icon className="h-5 w-5" />
                                        </div>
                                        <div className="text-[10px] font-bold text-white/20 group-hover:text-white/40 transition-colors">v0.2-WIP</div>
                                    </div>
                                    <GlassCardTitle className="text-white/90 group-hover:text-white mt-3 transition-colors">{entity.title}</GlassCardTitle>
                                    <GlassCardDescription className="text-white/40 text-xs min-h-[32px]">{entity.description}</GlassCardDescription>
                                </GlassCardHeader>
                                <GlassCardContent className="pt-4">
                                    <div className="space-y-3">
                                        {/* Placeholder Stat */}
                                        <div className="flex items-center gap-2">
                                            <div className="h-4 w-12 bg-white/5 rounded animate-pulse" />
                                            <div className="text-[10px] text-white/20 italic">Dados sincronizando...</div>
                                        </div>

                                        {/* Placeholder Graph */}
                                        <div className="flex items-end gap-0.5 h-8 w-full opacity-20 group-hover:opacity-30 transition-opacity">
                                            {[...Array(12)].map((_, i) => (
                                                <div key={i} className="flex-1 rounded-t-[1px] bg-white/40" style={{ height: `${Math.random() * 100}%` }} />
                                            ))}
                                        </div>
                                    </div>
                                </GlassCardContent>

                                {/* Hover overlay with standard placeholder appearance */}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                                    <div className="flex flex-col items-center gap-2">
                                        <Clock className="h-6 w-6 text-white/60 animate-pulse" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Coming Soon</span>
                                    </div>
                                </div>
                            </GlassCard>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Full Width Info */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
                <GlassCard className="border-yellow-500/20 bg-yellow-500/[0.02]">
                    <GlassCardHeader className="flex flex-row items-center gap-4 space-y-0">
                        <div className="p-3 rounded-full bg-yellow-500/10 border border-yellow-500/20">
                            <Shield className="h-6 w-6 text-yellow-500" />
                        </div>
                        <div>
                            <GlassCardTitle className="text-white">Repositório de Magias e Itens</GlassCardTitle>
                            <GlassCardDescription className="text-white/60">Estamos processando o SRD (System Reference Document) para popular automaticamente o catálogo D&D 5e.</GlassCardDescription>
                        </div>
                    </GlassCardHeader>
                </GlassCard>
            </motion.div>
        </div>
    )
}
