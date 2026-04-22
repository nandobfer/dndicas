"use client"

import { SignIn } from "@clerk/nextjs"
import { motion } from "framer-motion"
import { ScrollText, Sparkles, Shield, Users, PenLine } from "lucide-react"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { motionConfig } from "@/lib/config/motion-configs"

const features = [
    {
        icon: PenLine,
        title: "Crie quantas fichas quiser",
        description: "Sem limites. Crie uma ficha para cada personagem, campanha ou ideia — tudo salvo e organizado na sua conta.",
    },
    {
        icon: Sparkles,
        title: "Fichas completas e automatizadas",
        description: "Atributos, magias, ataques, equipamentos e anotações. Modificadores calculados automaticamente conforme você preenche.",
    },
    {
        icon: Shield,
        title: "Tudo salvo automaticamente",
        description: "Nada se perde. Cada alteração é salva em tempo real, então você pode fechar e voltar de onde parou a qualquer momento.",
    },
    {
        icon: Users,
        title: "Compartilhe seu personagem",
        description: "Gere um link público para que outros jogadores e o mestre possam visualizar sua ficha durante as sessões.",
    },
]

interface UnauthenticatedViewProps {
    redirectUrl?: string
}

export function UnauthenticatedView({ redirectUrl = "/my-sheets" }: UnauthenticatedViewProps) {
    return (
        <motion.div
            variants={motionConfig.variants.fadeInUp}
            initial="initial"
            animate="animate"
            className="space-y-6"
        >
            {/* Page header — same pattern as authenticated view */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                        <ScrollText className="h-5 w-5 sm:h-6 sm:w-6 text-violet-400" />
                        Minhas Fichas
                    </h1>
                    <p className="text-[10px] sm:text-sm text-white/60 mt-1">
                        Entre com sua conta para criar e gerenciar suas fichas de personagem
                    </p>
                </div>
            </div>

            {/* Two-column: content left (flex-1) + Clerk right */}
            <div className="flex flex-col lg:flex-row gap-8 items-start">
                {/* Left — features, takes all available space */}
                <div className="flex-1 space-y-4">
                    {features.map((feature, i) => (
                        <motion.div
                            key={feature.title}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 + i * 0.07 }}
                        >
                            <GlassCard>
                                <GlassCardContent className="py-4">
                                    <div className="flex gap-4 items-start">
                                        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-violet-500/15 border border-violet-500/20 flex items-center justify-center mt-0.5">
                                            <feature.icon className="h-4 w-4 text-violet-400" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-sm font-semibold text-white">{feature.title}</p>
                                            <p className="text-sm text-white/55 leading-relaxed">{feature.description}</p>
                                        </div>
                                    </div>
                                </GlassCardContent>
                            </GlassCard>
                        </motion.div>
                    ))}
                </div>

                {/* Right — Clerk SignIn, sticky on desktop */}
                <div className="w-full lg:w-auto flex-shrink-0 flex justify-center lg:sticky lg:top-6">
                    <SignIn routing="hash" fallbackRedirectUrl={redirectUrl} forceRedirectUrl={redirectUrl} />
                </div>
            </div>
        </motion.div>
    )
}
