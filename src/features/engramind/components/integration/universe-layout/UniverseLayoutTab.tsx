"use client"

import { useState } from "react"
import { Download, RotateCcw, Upload } from "lucide-react"
import { usePermissions } from "@nandobfer/perfix/react"
import type { UniverseLayoutConfig, UniverseLayoutIssue } from "@engramind/client"
import { Button } from "@/components/ui/opex/button"
import { ConfirmDialog } from "@/components/ui/opex/confirm-dialog"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { apiErrorMessage } from "@/lib/api"
import { universeLayoutErrorsOf, useResetUniverseLayout, useSaveUniverseLayout, useUniverseLayout } from "../../../hooks/useUniverseLayout"
import { formatDateTime, Section } from "../Section"
import { UniverseLayoutExportDialog, UniverseLayoutImportDialog } from "./UniverseLayoutJsonDialogs"
import { UniverseLayoutPreview, UniverseLayoutPreviewSkeleton } from "./UniverseLayoutPreview"

export const UNIVERSE_LAYOUT_EDIT_PERMISSION = "integrations.engramind.edit"

/**
 * Aba Visualização (DND-34): o layout único dos universos da rede de `/memorias`, **sem formulário** — só
 * Importar (o JSON exportado no Opex; grava na hora), Exportar e Restaurar padrão, com a prévia da
 * configuração em uso. Importar e restaurar exigem `integrations.engramind.edit`.
 */
export function UniverseLayoutTab() {
    const query = useUniverseLayout()
    const save = useSaveUniverseLayout()
    const reset = useResetUniverseLayout()
    const canEdit = usePermissions().can(UNIVERSE_LAYOUT_EDIT_PERMISSION)
    const [exporting, setExporting] = useState(false)
    const [importing, setImporting] = useState(false)
    const [confirmReset, setConfirmReset] = useState(false)

    if (query.isLoading) return <UniverseLayoutSkeleton />
    if (query.error || !query.data)
        return (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm" role="alert">
                {apiErrorMessage(query.error, "Não foi possível carregar a visualização.")}{" "}
                <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>
                    Tentar novamente
                </Button>
            </p>
        )
    const layout = query.data
    const importConfig = async (config: UniverseLayoutConfig): Promise<UniverseLayoutIssue[] | null> => {
        try {
            await save.mutateAsync(config)
            return null
        } catch (error) {
            return universeLayoutErrorsOf(error) ?? [{ path: "", message: apiErrorMessage(error, "Não foi possível gravar a visualização.") }]
        }
    }

    return (
        <div className="flex flex-col gap-6">
            <Section
                title="Visualização dos universos"
                testId="engramind-universe-layout"
                description="Como as memórias se distribuem em volta do agente ou do canal na rede de /memorias. A configuração é a do Opex: importe o JSON exportado na aba Visualização dele (e exporte daqui para levar de volta)."
                actions={
                    <>
                        {canEdit && (
                            <Button type="button" variant="outline" onClick={() => setImporting(true)}>
                                <Upload className="mr-2 h-4 w-4" aria-hidden /> Importar
                            </Button>
                        )}
                        <Button type="button" variant="outline" onClick={() => setExporting(true)}>
                            <Download className="mr-2 h-4 w-4" aria-hidden /> Exportar
                        </Button>
                        {canEdit && (
                            <Button type="button" variant="outline" onClick={() => setConfirmReset(true)} disabled={layout.isDefault || reset.isPending}>
                                <RotateCcw className="mr-2 h-4 w-4" aria-hidden /> Restaurar padrão
                            </Button>
                        )}
                    </>
                }
            >
                <p className="text-sm" data-testid="universe-layout-status">
                    {layout.isDefault ? "Em uso: o padrão da lib (anéis concêntricos)." : `Em uso: configuração importada${layout.updatedAt ? ` em ${formatDateTime(layout.updatedAt)}` : ""}.`}
                </p>
                {!canEdit && <p className="text-xs text-muted-foreground">Importar e restaurar exigem a permissão de editar a integração Engramind.</p>}
            </Section>

            <UniverseLayoutPreview config={layout.config} />

            <UniverseLayoutExportDialog open={exporting} onOpenChange={setExporting} values={layout.config} />
            {canEdit && <UniverseLayoutImportDialog open={importing} onOpenChange={setImporting} onImport={importConfig} pending={save.isPending} />}
            {canEdit && (
                <ConfirmDialog
                    open={confirmReset}
                    onOpenChange={setConfirmReset}
                    title="Restaurar o padrão?"
                    description="A visualização volta aos anéis concêntricos originais em todos os universos da rede."
                    confirmLabel="Restaurar padrão"
                    variant="destructive"
                    pending={reset.isPending}
                    onConfirm={() => reset.mutate(undefined, { onSuccess: () => setConfirmReset(false) })}
                />
            )}
        </div>
    )
}

/** Mesma estrutura do resultado: o cartão das ações e a prévia. */
export function UniverseLayoutSkeleton() {
    return (
        <div className="flex flex-col gap-6" aria-busy="true" data-testid="universe-layout-skeleton">
            <div className="space-y-4 rounded-xl border p-6">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-72" />
            </div>
            <UniverseLayoutPreviewSkeleton />
        </div>
    )
}
