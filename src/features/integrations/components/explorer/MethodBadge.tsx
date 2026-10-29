import { cn } from "@/lib/utils"
import type { HttpMethod } from "../../openapi/types"

const METHOD_STYLES: Record<HttpMethod, string> = {
    get: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    post: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    put: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    patch: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    delete: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    head: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    options: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
}

export function MethodBadge({ method, className }: { method: HttpMethod; className?: string }) {
    return (
        <span
            className={cn(
                "inline-flex w-16 shrink-0 justify-center rounded px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wide",
                METHOD_STYLES[method],
                className,
            )}
        >
            {method}
        </span>
    )
}

/** Cor do status HTTP da resposta. */
export function statusTone(status: number): string {
    if (status >= 500) return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
    if (status >= 400) return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
    if (status >= 300) return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
}
