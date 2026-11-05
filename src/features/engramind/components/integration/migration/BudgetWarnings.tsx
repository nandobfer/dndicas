"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Layers, Loader2, Minimize2 } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { useMigrationCompact } from "../../../hooks/useEngramind"
import type { MemoryMigrationDto } from "../../../types"

/**
 * Combinações de turno que estouram o orçamento do texto completo do contexto (estimativa: ≈ 4
 * caracteres por token) com "Compactar com o curador" (reescritas curtas e fusões, que voltam à revisão).
 */
export function BudgetWarnings({ state }: { state: MemoryMigrationDto }) {
    const compact = useMigrationCompact()
    const over = state.budget.filter((item) => item.over)
    const busy = Object.values(state.steps).some((step) => step.status === "running")
    return (
        <AnimatePresence initial={false}>
            {over.length > 0 && (
                <motion.ul key="budget" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-2 overflow-hidden" aria-label="Combinações acima do orçamento" data-testid="budget-warnings">
                    {over.map((item) => (
                        <li key={item.key} className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
                            <Layers className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                            <span className="min-w-0 flex-1">
                                {item.label}: estimativa de {item.tokens} tokens em {item.memories} memória(s), acima do orçamento de {item.budget}. O que passar fica só com o título (ou fora) do contexto.
                            </span>
                            <Button type="button" size="sm" variant="outline" disabled={busy || compact.isPending} onClick={() => compact.mutate(item.key)}>
                                {compact.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : <Minimize2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />} Compactar com o curador
                            </Button>
                        </li>
                    ))}
                </motion.ul>
            )}
        </AnimatePresence>
    )
}
