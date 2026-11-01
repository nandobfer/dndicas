"use client"

import Link from "next/link"
import { ArrowLeft, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
    campaignId: string
    color: string
    icon: LucideIcon
    title: string
    subtitle?: string | null
    /** Chips logo depois do título (rigor, situação, turno). */
    chips?: React.ReactNode
    /** Controles alinhados à direita (margem automática), ex.: "Minha ficha". */
    actions?: React.ReactNode
    /** Segunda linha opcional (faixa do turno na mesa). */
    banner?: React.ReactNode
    className?: string
}

/**
 * Cabeçalho compacto das telas de chat da campanha (entrevista e mesa). Fica fixo logo abaixo do header do app
 * (`sticky top-16`) e quase opaco: ao rolar a página, o chat que passa por trás não atrapalha a leitura.
 */
export function CampaignChatHeader({ campaignId, color, icon: Icon, title, subtitle, chips, actions, banner, className }: Props) {
    return (
        <header
            data-testid="campaign-chat-header"
            className={cn("sticky top-16 z-20 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-background/80 p-3 backdrop-blur-md", className)}
            style={{ backgroundImage: `radial-gradient(circle at 10% 0%, ${color}40, transparent 60%)`, boxShadow: `inset 3px 0 0 ${color}` }}
        >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Link href={`/campanhas/${campaignId}`} aria-label="Voltar à campanha" className="inline-flex shrink-0 items-center gap-1 text-sm text-white/60 hover:text-white">
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                    <span className="hidden sm:inline" aria-hidden>
                        Voltar
                    </span>
                </Link>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0" style={{ color }} aria-hidden />
                    <h1 className="truncate text-base font-semibold text-white">{title}</h1>
                    {subtitle && <p className="hidden min-w-0 truncate text-sm text-white/60 sm:block">· {subtitle}</p>}
                </div>
                {chips && <div className="flex shrink-0 flex-wrap items-center gap-1.5">{chips}</div>}
                {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
            </div>
            {banner && <div className="mt-2">{banner}</div>}
        </header>
    )
}
