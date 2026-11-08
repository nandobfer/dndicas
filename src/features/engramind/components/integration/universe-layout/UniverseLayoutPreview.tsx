"use client"

import { useMemo, useState } from "react"
import { channelColors, createHttpDataSource, EngramindProvider, MemoryUniverse, type MemoryCardActions } from "@engramind/client/react"
import type { UniverseLayoutConfig } from "@engramind/client"
import { Input } from "@/components/ui/opex/input"
import { Label } from "@/components/ui/opex/label"
import { OptionTabs } from "@/components/ui/opex/option-tabs"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { withBasePath } from "@/lib/base-path"
import { ENGRAMIND_APP } from "../../../constants"
import { buildSampleUniverse, SAMPLE_UNIVERSE_LIMITS } from "../../../network/sample-universe"
import { Section } from "../Section"

const NO_OP = () => undefined
/** A prévia só olha: o card da memória de exemplo abre, sem ações. */
const ACTIONS: MemoryCardActions = { onActive: NO_OP, onPin: NO_OP, onEdit: NO_OP, onDelete: NO_OP, readOnly: true }
const CENTER_OPTIONS = [
    { value: "agent", label: "Agente" },
    { value: "channel", label: "Canal" },
] as const
/** A prévia não consulta nada (o universo recebe as memórias por props); a fonte só satisfaz o provider. */
const previewSource = createHttpDataSource({ basePath: withBasePath("/api/engramind") })

const clampInt = (raw: string, min: number, max: number, fallback: number) => {
    const value = Number(raw)
    return Number.isFinite(value) && raw !== "" ? Math.min(max, Math.max(min, Math.round(value))) : fallback
}

/**
 * Prévia da aba Visualização (DND-34, a do Opex): o `MemoryUniverse` da lib com memórias de exemplo e a
 * configuração em uso. Nada vem do Engramind (sem SSE nem consultas); a quantidade, os canais e o centro
 * são só da prévia (não fazem parte da configuração).
 */
export function UniverseLayoutPreview({ config }: { config: UniverseLayoutConfig }) {
    const [count, setCount] = useState<number>(SAMPLE_UNIVERSE_LIMITS.count.default)
    const [channels, setChannels] = useState<number>(SAMPLE_UNIVERSE_LIMITS.channels.default)
    const [center, setCenter] = useState<"agent" | "channel">("agent")
    const sample = useMemo(() => buildSampleUniverse(count, channels), [count, channels])
    const colors = useMemo(() => channelColors(sample.channels), [sample.channels])
    const memories = useMemo(() => (center === "channel" ? sample.memories.filter((memory) => memory.channel === sample.channels[0]) : sample.memories), [center, sample])
    return (
        <Section title="Prévia" description="Memórias de exemplo com a configuração em uso. Nada aqui vem do Engramind.">
            <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                    <Label htmlFor="universe-preview-count" className="text-xs font-semibold">
                        Memórias de exemplo
                    </Label>
                    <Input id="universe-preview-count" type="number" min={SAMPLE_UNIVERSE_LIMITS.count.min} max={SAMPLE_UNIVERSE_LIMITS.count.max} value={count} onChange={(event) => setCount(clampInt(event.target.value, SAMPLE_UNIVERSE_LIMITS.count.min, SAMPLE_UNIVERSE_LIMITS.count.max, count))} />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="universe-preview-channels" className="text-xs font-semibold">
                        Canais de exemplo
                    </Label>
                    <Input id="universe-preview-channels" type="number" min={SAMPLE_UNIVERSE_LIMITS.channels.min} max={SAMPLE_UNIVERSE_LIMITS.channels.max} value={channels} onChange={(event) => setChannels(clampInt(event.target.value, SAMPLE_UNIVERSE_LIMITS.channels.min, SAMPLE_UNIVERSE_LIMITS.channels.max, channels))} />
                </div>
                <div className="space-y-1.5">
                    <Label id="universe-preview-center" className="text-xs font-semibold">
                        Universo do
                    </Label>
                    <OptionTabs aria-labelledby="universe-preview-center" options={CENTER_OPTIONS} value={center} onChange={setCenter} size="sm" />
                </div>
            </div>
            <div data-testid="universe-preview" className="overflow-hidden rounded-xl border">
                <EngramindProvider dataSource={previewSource} app={ENGRAMIND_APP} universeLayout={config}>
                    <MemoryUniverse
                        center={center === "agent" ? { kind: "agent", id: "exemplo/agente", label: "Agente de exemplo" } : { kind: "channel", id: sample.channels[0]!, label: "Canal de exemplo" }}
                        memories={memories}
                        staleAfterDays={90}
                        channelColors={center === "agent" ? colors : undefined}
                        actions={ACTIONS}
                        layoutConfig={config}
                        className="h-[28rem] max-md:h-[60dvh]"
                    />
                </EngramindProvider>
            </div>
        </Section>
    )
}

export function UniverseLayoutPreviewSkeleton() {
    return (
        <div className="space-y-4 rounded-xl border p-6" aria-busy="true">
            <Skeleton className="h-5 w-24" />
            <div className="grid gap-3 sm:grid-cols-3">
                {Array.from({ length: 3 }, (_, index) => (
                    <Skeleton key={index} className="h-9 rounded-md" />
                ))}
            </div>
            <Skeleton className="h-[28rem] rounded-xl" />
        </div>
    )
}
