"use client"

import type { ChartConfig } from "@/components/ui/chart"
import { BarsChart } from "./charts/BarsChart"
import { ChartCard } from "./charts/ChartCard"
import { EmptyChart } from "./charts/EmptyChart"
import { DonutChart } from "./charts/DonutChart"
import { RankedBarsCard } from "./charts/RankedBarsCard"
import { TrendLineChart } from "./charts/TrendLineChart"
import { COLUMN_CHART_COLORS, colorAt } from "./charts/palette"
import { formatBucketLabel, formatCount } from "../format"
import type { ClienteDashboardDto } from "../types"

type Data = Pick<ClienteDashboardDto, "byColumn" | "byTag" | "byProject" | "timeline">

/**
 * Bloco "Visão geral de tarefas" do portal: os **mesmos gráficos** do dashboard do dono (rosca por
 * coluna, barras por tipo, barras ranqueadas por projeto e a linha criadas × concluídas), com a
 * diferença de que a distribuição "Por tipo" conta as **tags** da tarefa (o dono conta o tipo).
 */
export function ClienteTasksOverviewSection({ data }: { data: Data }) {
    const columnRows = data.byColumn.map((slice) => ({ name: slice.label, value: slice.count, fill: COLUMN_CHART_COLORS[slice.color] }))
    const columnConfig: ChartConfig = Object.fromEntries(data.byColumn.map((slice) => [slice.label, { label: slice.label, color: COLUMN_CHART_COLORS[slice.color] }]))

    const tagRows = data.byTag.map((slice) => ({ label: slice.label, count: slice.count }))
    const tagConfig: ChartConfig = { count: { label: "Tarefas", color: colorAt(0) } }

    const projectRows = data.byProject.map((slice) => ({ name: slice.sigla ? `${slice.sigla} · ${slice.name}` : slice.name, count: slice.count }))
    const projectConfig: ChartConfig = { count: { label: "Tarefas", color: colorAt(1) } }

    const timelineConfig: ChartConfig = {
        created: { label: "Criadas", color: colorAt(0) },
        completed: { label: "Concluídas", color: colorAt(2) },
    }

    return (
        <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Visão geral de tarefas</h2>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                <ChartCard title="Por coluna" description="Tarefas ativas por status do quadro">
                    {columnRows.length === 0 ? (
                        <EmptyChart />
                    ) : (
                        <DonutChart
                            data={columnRows}
                            nameKey="name"
                            valueKey="value"
                            config={columnConfig}
                            ariaLabel="Tarefas por coluna"
                            valueFormatter={formatCount}
                            centerValue={formatCount(columnRows.reduce((sum, row) => sum + row.value, 0))}
                            centerLabel="tarefas"
                            table={{
                                columns: [
                                    { key: "name", label: "Coluna" },
                                    { key: "value", label: "Tarefas" },
                                ],
                                rows: columnRows,
                            }}
                        />
                    )}
                </ChartCard>

                <ChartCard title="Por tipo" description="Tag da tarefa (Sem tags quando não classificada)">
                    {tagRows.length === 0 ? (
                        <EmptyChart />
                    ) : (
                        <BarsChart
                            data={tagRows}
                            xKey="label"
                            series={[{ key: "count", label: "Tarefas", color: colorAt(0) }]}
                            config={tagConfig}
                            ariaLabel="Tarefas por tipo"
                            valueFormatter={formatCount}
                            table={{
                                columns: [
                                    { key: "label", label: "Tag" },
                                    { key: "count", label: "Tarefas" },
                                ],
                                rows: tagRows,
                            }}
                        />
                    )}
                </ChartCard>

                <ChartCard title="Por projeto" description="Tarefas ativas por projeto">
                    {projectRows.length === 0 ? (
                        <EmptyChart />
                    ) : (
                        <RankedBarsCard
                            data={projectRows}
                            labelKey="name"
                            valueKey="count"
                            config={projectConfig}
                            ariaLabel="Tarefas por projeto"
                            valueFormatter={formatCount}
                            table={{
                                columns: [
                                    { key: "name", label: "Projeto" },
                                    { key: "count", label: "Tarefas" },
                                ],
                                rows: projectRows,
                            }}
                        />
                    )}
                </ChartCard>

                <ChartCard title="Criadas × concluídas" description="Evolução no período">
                    {data.timeline.length === 0 ? (
                        <EmptyChart />
                    ) : (
                        <TrendLineChart
                            data={data.timeline}
                            xKey="bucket"
                            series={[
                                { key: "created", label: "Criadas", color: colorAt(0) },
                                { key: "completed", label: "Concluídas", color: colorAt(2) },
                            ]}
                            config={timelineConfig}
                            ariaLabel="Tarefas criadas e concluídas no período"
                            xTickFormatter={formatBucketLabel}
                            valueFormatter={formatCount}
                            table={{
                                columns: [
                                    { key: "bucket", label: "Período" },
                                    { key: "created", label: "Criadas" },
                                    { key: "completed", label: "Concluídas" },
                                ],
                                rows: data.timeline,
                            }}
                        />
                    )}
                </ChartCard>
            </div>
        </section>
    )
}
