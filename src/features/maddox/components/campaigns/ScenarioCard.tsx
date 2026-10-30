"use client"

import { useState } from "react"
import Link from "next/link"
import { BookOpen, ChevronDown, Hourglass, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Markdown } from "@/components/ui/opex/markdown"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardDescription as CardDescription, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import { cn } from "@/lib/utils"
import type { MaddoxCampaignDetailDto } from "../../campaign-types"
import { InterviewChip } from "./campaign-visuals"

/** Cenário da campanha no lobby: chamada para a entrevista (dono), espera (jogadores) ou o cenário salvo. */
export function ScenarioCard({ campaign }: { campaign: MaddoxCampaignDetailDto }) {
    const [expanded, setExpanded] = useState(false)
    const isOwner = campaign.myRole === "owner"
    const done = campaign.scenarioStatus === "done"
    const started = campaign.scenarioStatus !== "pending"

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <BookOpen className="h-4 w-4 text-primary" aria-hidden /> Cenário
                    <InterviewChip status={campaign.scenarioStatus} />
                </CardTitle>
                <CardDescription>
                    {done
                        ? "O mundo e a situação inicial combinados com o Maddox."
                        : isOwner
                          ? "Converse com o Maddox para definir o universo, o tom e a situação inicial da história."
                          : `Aguardando ${campaign.ownerName} definir o cenário com o Maddox.`}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {done ? (
                    <div className="space-y-3">
                        <div className={cn("relative space-y-4 overflow-hidden", !expanded && "max-h-40")}>
                            <Markdown lineAction={null}>{campaign.setting}</Markdown>
                            {campaign.openingSituation && (
                                <div className="space-y-1">
                                    <h3 className="text-sm font-semibold text-white">Situação inicial</h3>
                                    <Markdown lineAction={null}>{campaign.openingSituation}</Markdown>
                                </div>
                            )}
                            {!expanded && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background/90 to-transparent" aria-hidden />}
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
                            <ChevronDown className={cn("transition-transform", expanded && "rotate-180")} aria-hidden /> {expanded ? "Mostrar menos" : "Ler o cenário completo"}
                        </Button>
                    </div>
                ) : isOwner ? (
                    <Button asChild>
                        <Link href={`/campanhas/${campaign.id}/entrevista/cenario`}>
                            <MessageCircle aria-hidden /> {started ? "Continuar entrevista de cenário" : "Começar entrevista de cenário"}
                        </Link>
                    </Button>
                ) : (
                    <p className="flex items-center gap-2 text-sm text-white/60">
                        <Hourglass className="h-4 w-4 text-primary" aria-hidden /> Você poderá fazer a entrevista do seu personagem assim que o cenário estiver pronto.
                    </p>
                )}
            </CardContent>
        </Card>
    )
}
