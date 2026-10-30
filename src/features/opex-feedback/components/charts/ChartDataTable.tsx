import type { ReactNode } from "react"

/**
 * Tabela oculta com os mesmos números do gráfico (acessibilidade e testes). Fica num contêiner
 * `sr-only` com o nome no `aria-label` (nunca `<caption>`, que o navegador desenha fora da tabela).
 */
export interface ChartTableColumn {
    key: string
    label: string
}

export function ChartDataTable({
    label,
    columns,
    rows,
}: {
    label: string
    columns: readonly ChartTableColumn[]
    rows: readonly object[]
}) {
    return (
        <div className="sr-only" role="group" aria-label={label}>
            <table>
                <thead>
                    <tr>
                        {columns.map((column) => (
                            <th key={column.key} scope="col">
                                {column.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr key={index} data-barra>
                            {columns.map((column) => (
                                <td key={column.key}>{(row as Record<string, unknown>)[column.key] as ReactNode}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
