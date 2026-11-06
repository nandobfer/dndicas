"use client"

import { Skeleton } from "@/components/ui/opex/skeleton"
import { Button } from "@/components/ui/opex/button"
import { apiErrorMessage } from "@/lib/api"
import { useEngramindMigration } from "../../../hooks/useEngramind"
import { BackupStep } from "./BackupStep"
import { BudgetStep } from "./BudgetStep"
import { CampaignHistoryCard } from "./CampaignHistoryCard"
import { CuratorStep } from "./CuratorStep"
import { ImportStep } from "./ImportStep"
import { ReviewStep } from "./ReviewStep"

/**
 * Aba "Migração" (DND-21): backup → curador → orçamento → revisão → importação, mais o histórico das
 * campanhas. As etapas rodam no servidor (continuam com a tela fechada) e o progresso chega em tempo real.
 */
export function MigrationTab() {
    const migration = useEngramindMigration()
    if (migration.isLoading) return <MigrationSkeleton />
    if (migration.error || !migration.data)
        return (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm" role="alert">
                {apiErrorMessage(migration.error, "Não foi possível carregar a migração.")}{" "}
                <Button type="button" size="sm" variant="outline" onClick={() => void migration.refetch()}>
                    Tentar novamente
                </Button>
            </p>
        )
    return (
        <div className="flex flex-col gap-6">
            <BackupStep state={migration.data} />
            <CuratorStep state={migration.data} />
            <BudgetStep state={migration.data} />
            <ReviewStep state={migration.data} />
            <ImportStep state={migration.data} />
            <CampaignHistoryCard state={migration.data} />
        </div>
    )
}

export function MigrationSkeleton() {
    return (
        <div className="flex flex-col gap-6" aria-busy="true" data-testid="migration-skeleton">
            {[0, 1, 2, 3].map((index) => (
                <div key={index} className="space-y-3 rounded-xl border p-6">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-16 w-full" />
                </div>
            ))}
        </div>
    )
}
