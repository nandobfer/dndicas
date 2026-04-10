"use client"

import * as React from "react"
import { GlassCard, GlassCardHeader, GlassCardTitle, GlassCardDescription, GlassCardContent } from "@/components/ui/glass-card"
import { Users, Shield, Sparkles, Sword, Zap, Wand2, Backpack, Map, Fingerprint, TrendingUp, Activity, Clock, Skull } from "lucide-react"
import { motion } from "framer-motion"
import { entityColors } from "@/lib/config/colors"
import { cn } from "@/core/utils"
import { MiniBarChart } from "./_components/charts"
import { RulesEntityCard } from "./_components/rules-entity-card"
import { TraitsEntityCard } from "./_components/traits-entity-card"
import { FeatsEntityCard } from "./_components/feats-entity-card"
import { SpellsEntityCard } from "./_components/spells-entity-card"
import { ClassesEntityCard } from "./_components/classes-entity-card"
import { RacesEntityCard } from "./_components/races-entity-card"
import { BackgroundsEntityCard } from "./_components/backgrounds-entity-card"
import { ItemsEntityCard } from "./_components/items-entity-card"
import { WipEntityCard } from "./_components/wip-entity-card"
import { SheetsEntityCard } from "./_components/sheets-entity-card"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { InlineSearch } from "@/components/ui/inline-search"
import Image from "next/image"
import Link from "next/link"

// Types for the stats
interface DashboardStats {
    active: number
    growth: Array<{ date: string; count: number }>
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
    { id: "spells", title: "Magias", component: SpellsEntityCard },
    {
        id: "backgrounds",
        title: "Origens",
        icon: Map,
        description: "Antecedentes e origens dos heróis",
        component: BackgroundsEntityCard,
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
        component: ItemsEntityCard,
    },

    {
        id: "monsters",
        title: "Monstros",
        icon: Skull,
        description: "Criaturas, feras e adversários",
        component: WipEntityCard,
    },
]

const UserStatCard = ({ index }: { index: number }) => {
    const [stats, setStats] = React.useState<{ active: number; growth: any[] } | null>(null)
    const [loading, setLoading] = React.useState(true)

    React.useEffect(() => {
        fetch("/api/stats/users")
            .then((res) => res.json())
            .then((data) => {
                if (!data.error) setStats(data)
            })
            .finally(() => setLoading(false))
    }, [])

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + index * 0.05 }} whileHover={{ y: -4 }}>
            <Link href="/users">
                <GlassCard className={cn("h-full group transition-all overflow-hidden cursor-pointer hover:bg-white/[0.04]", entityColors.Usuário.border, entityColors.Usuário.hoverBorder)}>
                    <GlassCardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <GlassCardTitle className="text-white/70 text-sm font-medium flex items-center gap-2">
                                    <Users className={cn("h-4 w-4", entityColors.Usuário.text)} />
                                    Comunidade
                                </GlassCardTitle>
                                <div className="text-3xl font-bold text-white leading-none">
                                    <AnimatedNumber value={loading ? 0 : stats?.active || 0} formatter={(val) => `${Math.floor(val)}`} />
                                </div>
                            </div>
                            <div
                                className={cn(
                                    "p-3 rounded-xl border transition-colors",
                                    entityColors.Usuário.bgAlpha,
                                    entityColors.Usuário.border,
                                    "group-hover:bg-white/10 group-hover:text-white",
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
                                <div className={cn("text-xs font-medium px-2 py-0.5 rounded-full border flex items-center gap-1", entityColors.Usuário.badge, entityColors.Usuário.border)}>
                                    <span>+</span>
                                    <AnimatedNumber value={loading ? 0 : stats?.active || 0} formatter={(val) => `${Math.floor(val)}`} />
                                    <span>ativos</span>
                                </div>
                            </div>
                            {stats?.growth && <MiniBarChart data={stats.growth} color={entityColors.Usuário.hex} />}
                        </div>
                    </GlassCardContent>
                </GlassCard>
            </Link>
        </motion.div>
    )
}

export default function DashboardPage() {
    return (
        <div className="flex flex-col gap-8 pb-12">
            {/* Header */}
            <div className="flex flex-col items-center justify-center text-center space-y-4 pt-8 md:pt-12">
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="relative w-full md:w-[500px] aspect-[2/1]">
                    <Image src="/dndicas-logo.webp" alt="Dungeons & Dicas" fill className="object-contain" priority />
                </motion.div>
                <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-white/60 text-lg md:text-xl max-w-2xl px-4">
                    Dungeons & Dicas: Um catálogo em português, para mestres e jogadores encontrarem rapidamente as informações que precisam
                </motion.p>
            </div>

            {/* Inline Search */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <InlineSearch />
            </motion.div>

            {/* Catalog */}
            <div className="space-y-4">
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {dndEntities.map(({ component: Card, id, ...entity }, index) => {
                        return <Card key={id} {...entity} index={index} />
                    })}
                </div>
            </div>

            {/* Real Data Stats */}
            <div className="grid gap-6 md:grid-cols-2">
                {/* Users Stat */}
                <UserStatCard index={0} />

                <RulesEntityCard index={1} />
            </div>

            {/* Full Width Info */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
                <SheetsEntityCard index={0} />
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