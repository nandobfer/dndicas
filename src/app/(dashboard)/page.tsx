"use client"

import * as React from "react"
import { GlassCard, GlassCardHeader, GlassCardTitle, GlassCardDescription, GlassCardContent } from "@/components/ui/glass-card"
import { Users, FileText, Shield, Sparkles, Sword, Zap, Wand2, Backpack, Map, Fingerprint, TrendingUp, Activity, Clock, Skull } from "lucide-react"
import { motion } from "framer-motion"
import { colors, entityConfig } from "@/lib/config/colors"
import { cn } from "@/core/utils"
import { MiniBarChart, MiniLineChart } from "./_components/charts"
import { RulesEntityCard } from "./_components/rules-entity-card"
import { TraitsEntityCard } from "./_components/traits-entity-card"
import { FeatsEntityCard } from "./_components/feats-entity-card"
import { SpellsEntityCard } from "./_components/spells-entity-card"
import { WipEntityCard } from "./_components/wip-entity-card"

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
    rules: {
        total: number
        active: number
        growth: Array<{ date: string; count: number }>
    }
    traits: {
        total: number
        active: number
        growth: Array<{ date: string; count: number }>
    }
    feats: {
        total: number
        active: number
        growth: Array<{ date: string; count: number }>
    }
    spells: {
        total: number
        active: number
        growth: Array<{ date: string; count: number }>
    }
}

const dndEntities = [
    { id: "rules", title: "Regras", component: RulesEntityCard },
    {
        id: "classes",
        title: "Classes",
        icon: Sword,
        description: "Classes de personagem (Guerreiro, Mago, etc.)",
        component: WipEntityCard
    },
    {
        id: "races",
        title: "Raças",
        icon: Fingerprint,
        description: "Raças jogáveis (Humano, Elfo, etc.)",
        component: WipEntityCard
    },
    {
        id: "feats",
        title: "Talentos",
        component: FeatsEntityCard
    },
    {
        id: "traits",
        title: "Habilidades",
        icon: Sparkles,
        description: "Traits e habilidades de classe/raça",
        component: TraitsEntityCard
    },
    {
        id: "items",
        title: "Itens",
        icon: Backpack,
        description: "Equipamentos, armas e itens mágicos",
        component: WipEntityCard
    },
    { id: "spells", title: "Magias", component: SpellsEntityCard },
    {
        id: "backgrounds",
        title: "Origens",
        icon: Map,
        description: "Antecedentes e origens dos heróis",
        component: WipEntityCard
    },
    {
        id: "monsters",
        title: "Monstros",
        icon: Skull,
        description: "Criaturas, feras e adversários",
        component: WipEntityCard
    }
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
                <motion.p
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-white/60 text-lg"
                >
                    Visão geral dos dados e monitoramento do sistema D&Dicas.
                </motion.p>
            </div>

            {/* Real Data Stats */}
            <div className="grid gap-6 md:grid-cols-2">
                {/* Users Stat */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                    <GlassCard
                        className={cn(
                            "h-full group transition-colors overflow-hidden",
                            entityConfig.Usuário.border,
                            entityConfig.Usuário.hoverBorder
                        )}
                    >
                        <GlassCardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <GlassCardTitle className="text-white/70 text-sm font-medium flex items-center gap-2">
                                        <Users className={cn("h-4 w-4", entityConfig.Usuário.text)} />
                                        Comunidade
                                    </GlassCardTitle>
                                    <div className="text-3xl font-bold text-white">{loading ? "..." : stats?.users.total || 0}</div>
                                </div>
                                <div className={cn("p-3 rounded-xl border", entityConfig.Usuário.bgAlpha, entityConfig.Usuário.border)}>
                                    <TrendingUp className={cn("h-6 w-6", entityConfig.Usuário.text)} />
                                </div>
                            </div>
                        </GlassCardHeader>
                        <GlassCardContent>
                            <div className="space-y-4">
                                <div className="flex items-end justify-between">
                                    <p className="text-xs text-white/40">Usuários ativos e crescimento semanal</p>
                                    <div
                                        className={cn(
                                            "text-xs font-medium px-2 py-0.5 rounded-full border",
                                            entityConfig.Usuário.badge,
                                            entityConfig.Usuário.border
                                        )}
                                    >
                                        +{loading ? 0 : stats?.users.active} ativos
                                    </div>
                                </div>
                                {stats?.users.growth && <MiniBarChart data={stats.users.growth} color={entityConfig.Usuário.hex} />}
                            </div>
                        </GlassCardContent>
                    </GlassCard>
                </motion.div>

                {/* Audit Logs Stat */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                    <GlassCard
                        className={cn(
                            "h-full group transition-colors overflow-hidden",
                            entityConfig.Segurança.border,
                            entityConfig.Segurança.hoverBorder
                        )}
                    >
                        <GlassCardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <GlassCardTitle className="text-white/70 text-sm font-medium flex items-center gap-2">
                                        <Activity className={cn("h-4 w-4", entityConfig.Segurança.text)} />
                                        Segurança
                                    </GlassCardTitle>
                                    <div className="text-3xl font-bold text-white">{loading ? "..." : stats?.auditLogs.total || 0}</div>
                                </div>
                                <div className={cn("p-3 rounded-xl border", entityConfig.Segurança.bgAlpha, entityConfig.Segurança.border)}>
                                    <FileText className={cn("h-6 w-6", entityConfig.Segurança.text)} />
                                </div>
                            </div>
                        </GlassCardHeader>
                        <GlassCardContent>
                            <div className="space-y-4">
                                <div className="flex items-end justify-between">
                                    <p className="text-xs text-white/40">Atividades auditadas nas últimas 24h</p>
                                    <div
                                        className={cn(
                                            "text-xs font-medium px-2 py-0.5 rounded-full border flex items-center gap-1",
                                            entityConfig.Segurança.badge,
                                            entityConfig.Segurança.border
                                        )}
                                    >
                                        <Clock className="h-3 w-3" />
                                        Em tempo real
                                    </div>
                                </div>
                                {stats?.auditLogs.activity && <MiniLineChart data={stats.auditLogs.activity} color={entityConfig.Segurança.hex} />}
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
                        Catálogo D&D
                    </h2>
                    <span className="text-xs font-semibold px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-white/40 uppercase tracking-widest">
                        Em Breve
                    </span>
                </div>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
                    {dndEntities.map(({ component: Card, id, ...entity }, index) => {
                        const entityStats =
                            id === "rules"
                                ? stats?.rules
                                : id === "traits"
                                  ? stats?.traits
                                  : id === "feats"
                                    ? stats?.feats
                                    : id === "spells"
                                      ? stats?.spells
                                      : undefined
                        return <Card key={id} {...entity} index={index} stats={entityStats} loading={loading} />
                    })}
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
                            <GlassCardTitle className="text-white">Repositório</GlassCardTitle>
                            <GlassCardDescription className="text-white/60">Estamos populando manualmente o catálogo D&D 5e.</GlassCardDescription>
                        </div>
                    </GlassCardHeader>
                </GlassCard>
            </motion.div>
        </div>
    )
}
