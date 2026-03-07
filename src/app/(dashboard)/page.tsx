"use client"

import * as React from "react"
import { GlassCard, GlassCardHeader, GlassCardTitle, GlassCardDescription, GlassCardContent } from "@/components/ui/glass-card"
import { Users, FileText, Shield, Sparkles, Sword, Zap, Wand2, Backpack, Map, Fingerprint, TrendingUp, Activity, Clock, Skull } from "lucide-react"
import { motion } from "framer-motion"
import { colors, entityColors } from "@/lib/config/colors"
import { cn } from "@/core/utils"
import { MiniBarChart, MiniLineChart } from "./_components/charts"
import { RulesEntityCard } from "./_components/rules-entity-card"
import { TraitsEntityCard } from "./_components/traits-entity-card"
import { FeatsEntityCard } from "./_components/feats-entity-card"
import { SpellsEntityCard } from "./_components/spells-entity-card"
import { ClassesEntityCard } from "./_components/classes-entity-card"
import { RacesEntityCard } from "./_components/races-entity-card"
import { BackgroundsEntityCard } from "./_components/backgrounds-entity-card"
import { WipEntityCard } from "./_components/wip-entity-card"
import { AnimatedNumber } from "@/components/ui/animated-number"
import Image from "next/image"
import Link from "next/link"

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
    classes: {
        total: number
        active: number
        growth: Array<{ date: string; count: number }>
    }
    backgrounds: {
        total: number
        active: number
        growth: Array<{ date: string; count: number }>
    }
    races: {
        total: number
        active: number
        growth: Array<{ date: string; count: number }>
    }
}

const dndEntities = [
    {
        id: "classes",
        title: "Classes",
        icon: Sword,
        description: "Classes de personagem (Guerreiro, Mago, etc.)",
        component: ClassesEntityCard,
    },
    {
        id: "races",
        title: "Raças",
        component: RacesEntityCard,
    },
    {
        id: "traits",
        title: "Habilidades",
        icon: Sparkles,
        description: "Traits e habilidades de classe/raça",
        component: TraitsEntityCard,
    },
    {
        id: "feats",
        title: "Talentos",
        component: FeatsEntityCard,
    },
    {
        id: "items",
        title: "Itens",
        icon: Backpack,
        description: "Equipamentos, armas e itens mágicos",
        component: WipEntityCard,
    },
    { id: "spells", title: "Magias", component: SpellsEntityCard },
    {
        id: "backgrounds",
        title: "Origens",
        icon: Map,
        description: "Antecedentes e origens dos heróis",
        component: BackgroundsEntityCard,
    },
    {
        id: "monsters",
        title: "Monstros",
        icon: Skull,
        description: "Criaturas, feras e adversários",
        component: WipEntityCard,
    },
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
            <div className="space-y-4">
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="relative w-60 h-30">
                    <Image src="/dndicas-logo.webp" alt="Dungeons & Dicas" fill className="object-contain" priority />
                </motion.div>
                <motion.p
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-white/60 text-lg"
                >
                    Um catálogo em português, criado para ajudar mestres e jogadores a encontrarem rapidamente as informações que precisam.
                </motion.p>
            </div>

            {/* Real Data Stats */}
            <div className="grid gap-6 md:grid-cols-2">
                {/* Users Stat */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} whileHover={{ y: -4 }}>
                    <Link href="/users">
                        <GlassCard
                            className={cn(
                                "h-full group transition-all overflow-hidden cursor-pointer hover:bg-white/[0.04]",
                                entityColors.Usuário.border,
                                entityColors.Usuário.hoverBorder
                            )}
                        >
                            <GlassCardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <GlassCardTitle className="text-white/70 text-sm font-medium flex items-center gap-2">
                                            <Users className={cn("h-4 w-4", entityColors.Usuário.text)} />
                                            Comunidade
                                        </GlassCardTitle>
                                        <div className="text-3xl font-bold text-white leading-none">
                                            <AnimatedNumber value={loading ? 0 : stats?.users.total || 0} formatter={(val) => `${Math.floor(val)}`} />
                                        </div>
                                    </div>
                                    <div
                                        className={cn(
                                            "p-3 rounded-xl border transition-colors",
                                            entityColors.Usuário.bgAlpha,
                                            entityColors.Usuário.border,
                                            "group-hover:bg-white/10 group-hover:text-white"
                                        )}
                                    >
                                        <TrendingUp className={cn("h-6 w-6", entityColors.Usuário.text, "group-hover:text-white")} />
                                    </div>
                                </div>
                            </GlassCardHeader>
                            <GlassCardContent>
                                <div className="space-y-4">
                                    <div className="flex items-end justify-between">
                                        <p className="text-xs text-white/40">Usuários ativos e crescimento semanal</p>
                                        <div
                                            className={cn(
                                                "text-xs font-medium px-2 py-0.5 rounded-full border flex items-center gap-1",
                                                entityColors.Usuário.badge,
                                                entityColors.Usuário.border
                                            )}
                                        >
                                            <span>+</span>
                                            <AnimatedNumber
                                                value={loading ? 0 : stats?.users.active || 0}
                                                formatter={(val) => `${Math.floor(val)}`}
                                            />
                                            <span>ativos</span>
                                        </div>
                                    </div>
                                    {stats?.users.growth && <MiniBarChart data={stats.users.growth} color={entityColors.Usuário.hex} />}
                                </div>
                            </GlassCardContent>
                        </GlassCard>
                    </Link>
                </motion.div>

                <RulesEntityCard stats={stats?.rules} loading={loading} index={1} />
            </div>

            {/* In Development Features */}
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                        <Sparkles className="h-6 w-6 text-yellow-500" />
                        Catálogo
                    </h2>
                    <span className="text-xs font-semibold px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-white/40 uppercase tracking-widest">
                        Em Breve
                    </span>
                </div>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                                      : id === "classes"
                                        ? stats?.classes
                                        : id === "backgrounds"
                                          ? stats?.backgrounds
                                          : id === "races"
                                            ? stats?.races
                                            : undefined

                        return <Card key={id} {...entity} index={index} stats={entityStats} loading={loading} />
                    })}
                </div>
            </div>

            {/* Full Width Info */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
                <WipEntityCard index={0} title="Fichas" description="Fichas de jogador para integrar com Owlbear Rodeo" />
            </motion.div>

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
