"use client"

import { useMemo } from "react"
import { useWatch, type UseFormReturn } from "react-hook-form"
import { AlertTriangle } from "lucide-react"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardDescription as CardDescription, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import { CheckTree } from "@/components/ui/opex/check-tree/CheckTree"
import { Switch } from "@/components/ui/opex/switch"
import { cn } from "@/lib/utils"
import type { OpexAgentSettings } from "../../schemas"
import {
    buildOpexToolTree,
    defaultToolConfirms,
    disabledOpexToolNames,
    enabledOpexToolNames,
    nextConfirmationOverrides,
    toolConfirms,
    type OpexToolMetaDto,
    type OpexToolRisk,
} from "../../tool-tree"

const RISK_BADGES: Record<OpexToolRisk, { label: string; className: string }> = {
    read: { label: "Leitura", className: "bg-muted text-muted-foreground" },
    write: { label: "Altera", className: "bg-primary/10 text-primary" },
    destructive: { label: "Destrutiva", className: "bg-warning/15 text-warning" },
}

const ROLE_LABELS = { anonymous: "Todos", user: "Logados", admin: "Administradores" } as const

interface ToolLeafMetaProps {
    meta: OpexToolMetaDto
    overrides: Readonly<Record<string, boolean>>
    onChange: (meta: OpexToolMetaDto, confirms: boolean) => void
}

/** Risco, "sempre ligada", quem pode usar e se pede confirmação, ao lado do nome de cada ferramenta (copiado do Ciliar). */
function ToolLeafMeta({ meta, overrides, onChange }: ToolLeafMetaProps) {
    const badge = RISK_BADGES[meta.risk]
    const confirms = toolConfirms(meta, overrides)
    const custom = confirms !== defaultToolConfirms(meta)
    const id = `opex-confirm-${meta.name}`
    return (
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <code className="text-[10px] text-muted-foreground">{meta.name}</code>
            <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", badge.className)}>{badge.label}</span>
            {meta.alwaysOn && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Sempre ligada</span>}
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground" title="Quem pode usar esta ferramenta">
                {ROLE_LABELS[meta.minRole ?? "anonymous"]}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                <Switch id={id} checked={confirms} onCheckedChange={(value) => onChange(meta, value)} className="scale-75" aria-label={`${meta.label}: pede confirmação`} />
                <label htmlFor={id} className="cursor-pointer">
                    Pede confirmação
                </label>
                {custom && <span className="font-semibold text-primary">· personalizado</span>}
            </span>
            {meta.risk === "destructive" && !confirms && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-warning" role="note">
                    <AlertTriangle className="h-3 w-3" aria-hidden /> Ação destrutiva sem confirmação
                </span>
            )}
        </span>
    )
}

/**
 * Ferramentas liberadas ao agente, no mesmo formato das permissões dos perfis do Ciliar: um módulo por
 * grupo, caixa "todas" por grupo, busca e contador. A configuração guarda as **desligadas** (ferramenta
 * nova nasce ligada). Cada ferramenta tem o próprio "Pede confirmação" (padrão: só as destrutivas).
 */
export function OpexToolsCard({ form, tools }: { form: UseFormReturn<OpexAgentSettings>; tools: readonly OpexToolMetaDto[] }) {
    const disabledTools = useWatch({ control: form.control, name: "disabledTools" })
    const overrides = useWatch({ control: form.control, name: "confirmationOverrides" })
    const tree = useMemo(() => buildOpexToolTree(tools), [tools])
    const byName = useMemo(() => new Map(tools.map((tool) => [tool.name, tool])), [tools])
    const locked = useMemo(() => new Set(tools.filter((tool) => tool.alwaysOn).map((tool) => tool.name)), [tools])
    const selected = useMemo(() => new Set(enabledOpexToolNames(tools, disabledTools ?? [])), [tools, disabledTools])

    const renderLeafMeta = (key: string) => {
        const meta = byName.get(key)
        if (!meta) return null
        return (
            <ToolLeafMeta
                meta={meta}
                overrides={overrides ?? {}}
                onChange={(tool, confirms) => form.setValue("confirmationOverrides", nextConfirmationOverrides(overrides ?? {}, tool, confirms), { shouldDirty: true, shouldValidate: true })}
            />
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Ferramentas</CardTitle>
                <CardDescription>
                    O agente usa quantas ferramentas precisar, sem limite de chamadas. Desmarque as que ele não deve usar. Em cada ferramenta, &quot;Pede confirmação&quot; mostra Confirmar/Cancelar no chat antes de
                    executar: vem ligado nas destrutivas (excluir, cancelar, gravar integração…) e nas sensíveis, desligado nas demais. Além disso, cada ferramenta só entra no turno de quem tem o papel dela (visitante, usuário ou administrador).
                </CardDescription>
            </CardHeader>
            <CardContent className="p-6 pt-0">
                <CheckTree
                    tree={tree}
                    selected={selected}
                    lockedKeys={locked}
                    renderLeafMeta={renderLeafMeta}
                    searchPlaceholder="Buscar ferramenta..."
                    emptyText="Nenhuma ferramenta encontrada."
                    onChange={(next) => form.setValue("disabledTools", disabledOpexToolNames(tools, next), { shouldDirty: true, shouldValidate: true })}
                />
            </CardContent>
        </Card>
    )
}
