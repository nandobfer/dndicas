"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/core/ui/table"
import { CURATOR_DECISIONS, CURATOR_DECISION_LABELS } from "../../../memory-curator"
import type { MigrationReportDto } from "../../../types"

/** Relatório do curador: contagem por decisão e por lista. */
export function CuratorReport({ report }: { report: MigrationReportDto }) {
    return (
        <div className="overflow-x-auto rounded-md border" data-testid="curator-report">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Lista</TableHead>
                        {CURATOR_DECISIONS.map((key) => (
                            <TableHead key={key} className="text-right">
                                {CURATOR_DECISION_LABELS[key]}
                            </TableHead>
                        ))}
                        <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {report.byList.map((row) => (
                        <TableRow key={row.list}>
                            <TableCell>{row.title}</TableCell>
                            {CURATOR_DECISIONS.map((key) => (
                                <TableCell key={key} className="text-right tabular-nums">
                                    {row.counts[key]}
                                </TableCell>
                            ))}
                            <TableCell className="text-right font-medium tabular-nums">{row.total}</TableCell>
                        </TableRow>
                    ))}
                    <TableRow>
                        <TableCell className="font-semibold">Total</TableCell>
                        {CURATOR_DECISIONS.map((key) => (
                            <TableCell key={key} className="text-right font-semibold tabular-nums">
                                {report.byDecision[key]}
                            </TableCell>
                        ))}
                        <TableCell className="text-right font-semibold tabular-nums">{Object.values(report.byDecision).reduce((sum, value) => sum + value, 0)}</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        </div>
    )
}
