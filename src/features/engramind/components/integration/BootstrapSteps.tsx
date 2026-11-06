"use client"

import { AlertTriangle, CheckCircle2, Circle, Loader2, MinusCircle, RotateCw, XCircle } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { cn } from "@/lib/utils"
import type { BootstrapDto, BootstrapStepDto } from "../../types"
import { formatDateTime, Section } from "./Section"

const ICONS: Record<BootstrapStepDto["status"], { icon: typeof Circle; className: string; label: string }> = {
    ok: { icon: CheckCircle2, className: "text-emerald-500", label: "Concluído" },
    skipped: { icon: MinusCircle, className: "text-muted-foreground", label: "Já estava pronto" },
    warn: { icon: AlertTriangle, className: "text-yellow-500", label: "Com aviso" },
    error: { icon: XCircle, className: "text-destructive", label: "Falhou" },
    pending: { icon: Circle, className: "text-muted-foreground", label: "Pendente" },
}

/** Passos da configuração automática (agentes, canais, assinaturas, tokens, webhook e categorias). */
export function BootstrapSteps({ bootstrap, configured, pending, onRepeat }: { bootstrap: BootstrapDto | null; configured: boolean; pending: boolean; onRepeat: () => void }) {
    return (
        <Section
            title="Configuração automática"
            testId="engramind-bootstrap"
            description={bootstrap ? `Última execução em ${formatDateTime(bootstrap.ranAt)}. Repetir não duplica nada: o que já existe é reaproveitado.` : "Salvar a conexão cria os agentes, os canais, as assinaturas, os tokens dos agentes e o webhook do dndicas no Engramind."}
            actions={
                <Button type="button" variant="outline" size="sm" disabled={!configured || pending} onClick={onRepeat}>
                    {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <RotateCw className="mr-1.5 h-4 w-4" aria-hidden />} Repetir configuração automática
                </Button>
            }
        >
            {!bootstrap ? (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{configured ? "Ainda não rodou: use \"Repetir configuração automática\"." : "Informe a URL base e o token do app e salve."}</p>
            ) : (
                <ol className="space-y-2" aria-label="Passos da configuração automática">
                    {bootstrap.steps.map((step) => {
                        const meta = ICONS[step.status]
                        const Icon = meta.icon
                        return (
                            <li key={step.id} className="flex items-start gap-2 text-sm" data-status={step.status}>
                                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", meta.className)} aria-label={meta.label} />
                                <span className="min-w-0 flex-1">
                                    <span className="font-medium">{step.label}</span>
                                    {step.message && <span className="block text-muted-foreground">{step.message}</span>}
                                </span>
                            </li>
                        )
                    })}
                </ol>
            )}
        </Section>
    )
}
