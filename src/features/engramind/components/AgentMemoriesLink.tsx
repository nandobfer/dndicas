"use client"

import Link from "next/link"
import { Brain } from "lucide-react"
import { GlassCard as Card, GlassCardContent as CardContent } from "@/components/ui/glass-card"

/** Linha das abas de agentes em `/integracoes/ia`: as memórias de cada agente ficam na rede (`/memorias`). */
export function AgentMemoriesLink() {
    return (
        <Card>
            <CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm text-muted-foreground">
                <Brain className="h-4 w-4 text-primary" aria-hidden />
                <span>As memórias deste agente ficam em</span>
                <Link href="/memorias" className="font-medium text-primary underline-offset-4 hover:underline">
                    Memórias
                </Link>
            </CardContent>
        </Card>
    )
}
