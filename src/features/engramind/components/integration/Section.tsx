"use client"

import type { ReactNode } from "react"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardDescription as CardDescription, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"

/** Card de uma etapa/seção da integração Engramind (título, descrição, ações à direita). */
export function Section({ title, description, actions, children, testId }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode; testId?: string }) {
    return (
        <Card data-testid={testId}>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div className="min-w-0 flex-1 space-y-1.5">
                    <CardTitle className="text-base">{title}</CardTitle>
                    {description && <CardDescription>{description}</CardDescription>}
                </div>
                {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </CardHeader>
            <CardContent className="space-y-3">{children}</CardContent>
        </Card>
    )
}

export const formatDateTime = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
