"use client"

import { GlassCard, GlassCardHeader, GlassCardTitle, GlassCardDescription, GlassCardContent } from "@/components/ui/glass-card"
import { Users, FileText, Shield, Sparkles } from "lucide-react"
import { motion } from "framer-motion"

const stats = [
    {
        title: "Usuários",
        value: "0",
        description: "Total de usuários cadastrados",
        icon: Users,
        href: "/users",
    },
    {
        title: "Logs de Auditoria",
        value: "0",
        description: "Eventos auditados no sistema",
        icon: FileText,
        href: "/audit-logs",
    },
    {
        title: "Segurança",
        description: "Autenticação e autorização com Clerk",
        icon: Shield,
        iconColor: "text-green-400",
    },
    {
        title: "IA Integrada",
        description: "Powered by Google Gemini",
        icon: Sparkles,
        iconColor: "text-purple-400",
    },
]

const features = [
    {
        title: "Autenticação Completa",
        description: "Sistema de autenticação robusto com Clerk, incluindo SSO, MFA e gerenciamento de sessões.",
    },
    {
        title: "Banco de Dados MongoDB",
        description: "Estrutura de dados flexível e escalável com Mongoose para modelagem de dados.",
    },
    {
        title: "Storage S3",
        description: "Upload e gerenciamento de arquivos com AWS S3 e URLs pré-assinadas.",
    },
    {
        title: "Inteligência Artificial",
        description: "Integração com Google Gemini para recursos de IA em seu sistema.",
    },
    {
        title: "Email Transacional",
        description: "Envio de emails com Nodemailer e templates customizáveis.",
    },
    {
        title: "Logs de Auditoria",
        description: "Rastreamento completo de ações de usuários para compliance e segurança.",
    },
]

export default function DashboardPage() {
    return (
        <div className="flex flex-col gap-6">
            {/* Header */}
            <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight text-white">Bem-vindo ao Dungeons & Dicas</h1>
                <p className="text-white/60">Template base com autenticação, banco de dados e integração AI com Liquid Glass Design</p>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat, index) => (
                    <motion.div key={stat.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}>
                        <GlassCard className="hover:scale-102 transition-transform cursor-pointer">
                            <GlassCardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <GlassCardTitle className="text-sm font-medium text-white/80">{stat.title}</GlassCardTitle>
                                <stat.icon className={`h-4 w-4 ${stat.iconColor || "text-white/60"}`} />
                            </GlassCardHeader>
                            <GlassCardContent>
                                {stat.value && <div className="text-2xl font-bold text-white">{stat.value}</div>}
                                <p className="text-xs text-white/50 mt-1">{stat.description}</p>
                            </GlassCardContent>
                        </GlassCard>
                    </motion.div>
                ))}
            </div>

            {/* Features Grid */}
            <div className="space-y-4">
                <h2 className="text-2xl font-bold tracking-tight text-white">Recursos do Template</h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {features.map((feature, index) => (
                        <motion.div
                            key={feature.title}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 + index * 0.1 }}
                        >
                            <GlassCard className="h-full">
                                <GlassCardHeader>
                                    <GlassCardTitle className="text-white">{feature.title}</GlassCardTitle>
                                    <GlassCardDescription className="text-white/60">{feature.description}</GlassCardDescription>
                                </GlassCardHeader>
                            </GlassCard>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Quick Start Card */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }}>
                <GlassCard className="border-white/10">
                    <GlassCardHeader>
                        <GlassCardTitle className="text-white text-xl">🚀 Início Rápido</GlassCardTitle>
                        <GlassCardDescription className="text-white/60">
                            Explore os recursos do template navegando pelo menu lateral
                        </GlassCardDescription>
                    </GlassCardHeader>
                    <GlassCardContent className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-3">
                            <div className="space-y-1">
                                <div className="text-sm font-medium text-white/90">Exemplos</div>
                                <div className="text-xs text-white/50">Veja exemplos de IA, Storage, Email e mais</div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-sm font-medium text-white/90">Cadastros</div>
                                <div className="text-xs text-white/50">Gerencie usuários e outros cadastros</div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-sm font-medium text-white/90">Administração</div>
                                <div className="text-xs text-white/50">Audite logs e gerencie o sistema</div>
                            </div>
                        </div>
                    </GlassCardContent>
                </GlassCard>
            </motion.div>
        </div>
    )
}
