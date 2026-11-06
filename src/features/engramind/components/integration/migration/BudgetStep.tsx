"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/core/ui/table"
import { cn } from "@/lib/utils"
import type { MemoryMigrationDto } from "../../../types"
import { Section } from "../Section"
import { BudgetWarnings } from "./BudgetWarnings"

/** Etapa 3: estimativa (~4 caracteres por token) de cada combinação de turno contra `context.budget_tokens`. */
export function BudgetStep({ state }: { state: MemoryMigrationDto }) {
    return (
        <Section title="3. Orçamento do contexto" description="Estimativa do texto completo que cada agente recebe por turno (≈ 4 caracteres por token), contra o orçamento do Engramind. Conta as aprovadas e as que o curador mandou migrar.">
            {state.budget.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Rode o curador para estimar o orçamento.</p>
            ) : (
                <>
                    <div className="overflow-x-auto rounded-md border" data-testid="budget-table">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Turno</TableHead>
                                    <TableHead className="text-right">Memórias</TableHead>
                                    <TableHead className="text-right">Tokens estimados</TableHead>
                                    <TableHead className="text-right">Orçamento</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {state.budget.map((item) => (
                                    <TableRow key={item.key}>
                                        <TableCell>{item.label}</TableCell>
                                        <TableCell className="text-right tabular-nums">{item.memories}</TableCell>
                                        <TableCell className={cn("text-right tabular-nums", item.over && "font-semibold text-destructive")}>{item.tokens}</TableCell>
                                        <TableCell className="text-right tabular-nums">{item.budget}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    <BudgetWarnings state={state} />
                </>
            )}
        </Section>
    )
}
