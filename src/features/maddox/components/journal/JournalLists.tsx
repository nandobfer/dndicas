"use client"

import type { ReactNode } from "react"
import { Loader2, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Markdown } from "@/components/ui/opex/markdown"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { cn } from "@/lib/utils"

/** Peças comuns das abas do diário: card do item (com âncora e destaque), estados e "Carregar mais". */

export function JournalItemCard({ anchor, highlighted, color, dimmed, testId, children }: { anchor: string; highlighted: boolean; color: string; dimmed?: boolean; testId?: string; children: ReactNode }) {
    return (
        <article
            id={anchor}
            data-testid={testId}
            data-highlighted={highlighted ? "true" : undefined}
            className={cn("scroll-mt-40 space-y-2 rounded-xl border bg-white/[0.03] p-4 transition-shadow", highlighted && "ring-2 ring-primary/70", dimmed && "opacity-60")}
            style={{ borderColor: `${color}33` }}
        >
            {children}
        </article>
    )
}

export function JournalText({ children }: { children: string }) {
    return children.trim() ? <Markdown lineAction={null}>{children}</Markdown> : null
}

export function JournalListState({ loading, error, empty, emptyText, icon: Icon, onRetry }: { loading: boolean; error: boolean; empty: boolean; emptyText: string; icon: LucideIcon; onRetry: () => void }) {
    if (loading) {
        return (
            <div className="grid gap-3 md:grid-cols-2" aria-busy="true" aria-label="Carregando">
                <Skeleton className="h-28 w-full rounded-xl" />
                <Skeleton className="h-28 w-full rounded-xl" />
            </div>
        )
    }
    if (error) {
        return (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-white/10 py-8 text-sm text-white/60" role="alert">
                Não foi possível carregar esta parte do diário.
                <Button size="sm" variant="outline" onClick={onRetry}>
                    Tentar de novo
                </Button>
            </div>
        )
    }
    if (empty) {
        return (
            <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/60" data-testid="journal-empty">
                <Icon className="h-4 w-4 shrink-0" aria-hidden /> {emptyText}
            </p>
        )
    }
    return null
}

/** Aviso das listas quando o item aberto por link ainda está sendo procurado ou ficou além do limite. */
export function SeekNotice({ seeking, tooFar }: { seeking: boolean; tooFar: boolean }) {
    if (seeking) {
        return (
            <p className="flex items-center gap-1.5 text-xs text-white/60" role="status" data-testid="journal-seeking">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Procurando o item na lista…
            </p>
        )
    }
    if (!tooFar) return null
    return (
        <p className="text-xs text-amber-300" role="status" data-testid="journal-too-far">
            Item muito antigo: use “Carregar mais” para chegar até ele.
        </p>
    )
}

export function LoadMore({ hasMore, loading, onLoad }: { hasMore: boolean; loading: boolean; onLoad: () => void }) {
    if (!hasMore) return null
    return (
        <div className="flex justify-center">
            <Button size="sm" variant="ghost" onClick={onLoad} disabled={loading}>
                {loading && <Loader2 className="animate-spin" aria-hidden />} Carregar mais
            </Button>
        </div>
    )
}
