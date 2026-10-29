"use client"

import type { ChartConfig } from "@/components/ui/chart"
import { BarsChart } from "./charts/BarsChart"
import { ChartCard } from "./charts/ChartCard"
import { EmptyChart } from "./charts/EmptyChart"
import { RankedBarsCard } from "./charts/RankedBarsCard"
import { colorAt } from "./charts/palette"
import { formatBrl, formatBucketLabel, formatHours } from "../format"
import type { ClienteDashboardFinanceDto } from "../types"

const CLIENTE_COST_LABEL = "Custo"

/**
 * Bloco "Financeiro" do dashboard do portal, no mesmo desenho do bloco do dono: custo por
 * repositório, evolução **mensal** e horas por repositório. O portal chama o valor de **Custo** e
 * mostra as horas já infladas ao cliente — nunca as horas reais, o fator ou o custo por hora.
 */
export function ClienteFinanceSection({ data }: { data: ClienteDashboardFinanceDto }) {
    const label = CLIENTE_COST_LABEL.toLowerCase()
    const costRows = data.byProject.map((group) => ({ name: group.repo, costBrl: group.costBrl }))
    const costConfig: ChartConfig = { costBrl: { label: CLIENTE_COST_LABEL, color: colorAt(2) } }

    const hoursRows = data.byProject.map((group) => ({ name: group.repo, clientHours: group.clientHours }))
    const hoursConfig: ChartConfig = { clientHours: { label: "Horas", color: colorAt(0) } }

    const timelineConfig: ChartConfig = { costBrl: { label: CLIENTE_COST_LABEL, color: colorAt(1) } }
    const hasTimeline = data.timeline.some((point) => point.costBrl > 0)

    return (
        <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Financeiro</h2>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                <ChartCard title={`${CLIENTE_COST_LABEL} por repositório`} description="Tarefas concluídas no período">
                    {costRows.length === 0 ? (
                        <EmptyChart />
                    ) : (
                        <RankedBarsCard
                            data={costRows}
                            labelKey="name"
                            valueKey="costBrl"
                            config={costConfig}
                            color={colorAt(2)}
                            ariaLabel={`${CLIENTE_COST_LABEL} por repositório`}
                            valueFormatter={formatBrl}
                            table={{
                                columns: [
                                    { key: "name", label: "Repositório" },
                                    { key: "costBrl", label: `${CLIENTE_COST_LABEL} (R$)` },
                                ],
                                rows: costRows,
                            }}
                        />
                    )}
                </ChartCard>

                <ChartCard title="Evolução mensal" description={`${CLIENTE_COST_LABEL} por mês dentro do período`}>
                    {!hasTimeline ? (
                        <EmptyChart />
                    ) : (
                        <BarsChart
                            data={data.timeline}
                            xKey="bucket"
                            series={[{ key: "costBrl", label: CLIENTE_COST_LABEL, color: colorAt(1) }]}
                            config={timelineConfig}
                            ariaLabel={`${CLIENTE_COST_LABEL} por mês`}
                            xTickFormatter={formatBucketLabel}
                            valueFormatter={formatBrl}
                            table={{
                                columns: [
                                    { key: "bucket", label: "Mês" },
                                    { key: "costBrl", label: `${CLIENTE_COST_LABEL} (R$)` },
                                ],
                                rows: data.timeline,
                            }}
                        />
                    )}
                </ChartCard>

                <ChartCard title="Horas por repositório" description={`Horas de ${label} no período`}>
                    {hoursRows.length === 0 ? (
                        <EmptyChart />
                    ) : (
                        <RankedBarsCard
                            data={hoursRows}
                            labelKey="name"
                            valueKey="clientHours"
                            config={hoursConfig}
                            color={colorAt(0)}
                            ariaLabel="Horas por repositório"
                            valueFormatter={formatHours}
                            table={{
                                columns: [
                                    { key: "name", label: "Repositório" },
                                    { key: "clientHours", label: "Horas" },
                                ],
                                rows: hoursRows,
                            }}
                        />
                    )}
                </ChartCard>
            </div>
        </section>
    )
}
