import { Badge } from "@/core/ui/badge"
import { cn } from "@/core/utils"
import type { FeedbackDevelopmentStatus } from "../types/feedback.types"

const labels: Record<FeedbackDevelopmentStatus, string> = {
    aberto: "Aberto",
    planejando: "Planejando",
    plano_pronto: "Plano pronto",
    implementando: "Implementando",
    aguardando_teste: "Aguardando teste",
    ajustes_solicitados: "Ajustes solicitados",
    aprovado: "Aprovado",
    mergeando: "Mergeando",
    concluido: "Concluído",
    cancelado: "Cancelado",
    falhou: "Falhou",
}

const variants: Record<FeedbackDevelopmentStatus, "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info"> = {
    aberto: "outline",
    planejando: "info",
    plano_pronto: "info",
    implementando: "warning",
    aguardando_teste: "warning",
    ajustes_solicitados: "warning",
    aprovado: "success",
    mergeando: "info",
    concluido: "success",
    cancelado: "secondary",
    falhou: "destructive",
}

export function FeedbackDevelopmentStatusBadge({ status, size = "sm" }: { status?: FeedbackDevelopmentStatus; size?: "sm" | "md" }) {
    const safeStatus = status ?? "aberto"

    return (
        <Badge
            variant={variants[safeStatus]}
            className={cn(
                "w-fit whitespace-nowrap uppercase tracking-tighter",
                size === "sm" && "px-2 py-0.5 text-[9px] leading-none",
            )}
        >
            {labels[safeStatus]}
        </Badge>
    )
}
