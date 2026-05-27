"use client"

import type * as React from "react"
import { Sparkles } from "lucide-react"
import { GlassImage } from "@/components/ui/glass-image"
import { getSourceDisplayLabel } from "@/core/utils/source-utils"
import { MentionContent } from "@/features/rules/components/mention-badge"
import { applyRaceGenerationCandidate, generateRaceGenerationCandidates } from "../api/entity-generation-api"
import type { EntityGenerationAdapter } from "../components/entity-generation-ai-modal"
import type { GeneratedRaceCandidate } from "../types/entity-generation.types"
import type { Race, RaceTrait, RaceVariation } from "@/features/races/types/races.types"

type ComparisonTone = "old" | "new"

function FieldBlock({ title, value, tone }: { title: string; value: React.ReactNode; tone: ComparisonTone }) {
    return (
        <div className={tone === "old" ? "rounded-lg border border-red-400/25 bg-red-500/10 p-3" : "rounded-lg border border-emerald-300/30 bg-emerald-500/10 p-3"}>
            <div className={tone === "old" ? "mb-2 text-[10px] font-bold uppercase tracking-widest text-red-200/70" : "mb-2 text-[10px] font-bold uppercase tracking-widest text-emerald-200/80"}>
                {title}
            </div>
            <div className="text-sm text-white/80">{value}</div>
        </div>
    )
}

function ImageValue({ src, alt, tone }: { src?: string; alt: string; tone: ComparisonTone }) {
    if (!src) {
        return (
            <div className="flex aspect-[16/9] min-h-32 items-center justify-center rounded-lg border border-dashed border-white/10 bg-black/15 text-xs text-white/35">
                Sem imagem
            </div>
        )
    }

    return (
        <div className={tone === "old" ? "aspect-[16/9] min-h-32 overflow-hidden rounded-lg border border-red-300/20 bg-black/20" : "aspect-[16/9] min-h-32 overflow-hidden rounded-lg border border-emerald-300/25 bg-black/20"}>
            <GlassImage src={src} alt={alt} className="h-full w-full rounded-none border-0 shadow-none" imageClassName="object-cover mix-blend-normal" showOverlay={false} />
        </div>
    )
}

function HtmlValue({ html }: { html: string }) {
    return (
        <div className="max-h-48 overflow-y-auto rounded border border-white/5 bg-black/15 p-2 custom-scrollbar">
            <MentionContent html={html || "<p>Vazio</p>"} mode="block" className="[&_p]:my-1 [&_p]:text-xs [&_p]:leading-relaxed [&_ul]:text-xs [&_li]:text-xs" />
        </div>
    )
}

function TraitList({ traits, tone }: { traits: RaceTrait[]; tone: ComparisonTone }) {
    if (!traits.length) return <span className="text-white/35">Nenhuma habilidade</span>
    return (
        <div className="space-y-2">
            {traits.map((trait, index) => (
                <div key={`${trait.name}-${index}`} className={tone === "old" ? "rounded-lg border border-red-300/15 bg-black/15 p-2" : "rounded-lg border border-emerald-300/20 bg-black/15 p-2"}>
                    <div className={tone === "old" ? "mb-1 text-xs font-semibold text-red-100/90" : "mb-1 text-xs font-semibold text-emerald-100"}>
                        {trait.name}
                    </div>
                    <MentionContent html={trait.description || "<p>Sem descrição.</p>"} mode="block" className="[&_p]:my-1 [&_p]:text-xs [&_p]:leading-relaxed [&_ul]:text-xs [&_li]:text-xs" />
                </div>
            ))}
        </div>
    )
}

function SpellList({ spells }: { spells: Array<{ name?: string; originalName?: string; circle?: number; requiresManualReview?: boolean }> }) {
    if (!spells.length) return <span className="text-white/35">Nenhuma magia</span>
    return (
        <div className="flex flex-wrap gap-1.5">
            {spells.map((spell, index) => (
                <span key={`${spell.name ?? spell.originalName}-${index}`} className={spell.requiresManualReview ? "rounded border border-amber-300/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-100" : "rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/75"}>
                    {spell.name ?? spell.originalName}
                    {typeof spell.circle === "number" ? ` c.${spell.circle}` : ""}
                    {spell.requiresManualReview ? " revisão" : ""}
                </span>
            ))}
        </div>
    )
}

function VariationList({ variations }: { variations: RaceVariation[] }) {
    if (!variations.length) return <span className="text-white/35">Nenhuma variação</span>
    return (
        <div className="space-y-2">
            {variations.map((variation, index) => (
                <div key={`${variation.name}-${index}`} className="rounded border border-white/10 bg-white/[0.03] p-2">
                    <div className="mb-1 text-xs font-medium text-white/80">{variation.name}</div>
                    <div className="text-[11px] text-white/45">{variation.source ? getSourceDisplayLabel(variation.source) : null}</div>
                </div>
            ))}
        </div>
    )
}

function RaceGenerationComparison({ current, candidate }: { current: Race; candidate: GeneratedRaceCandidate }) {
    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-red-100">
                    <span className="h-2 w-2 rounded-full bg-red-300" />
                    Estado Atual
                </div>
                <FieldBlock title="Nome" tone="old" value={current.name} />
                <FieldBlock title="Fonte" tone="old" value={getSourceDisplayLabel(current.source)} />
                <FieldBlock title="Imagem" tone="old" value={<ImageValue src={current.image} alt={`Imagem atual de ${current.name}`} tone="old" />} />
                <FieldBlock title="Descrição" tone="old" value={<HtmlValue html={current.description} />} />
                <FieldBlock title="Habilidades" tone="old" value={<TraitList traits={current.traits ?? []} tone="old" />} />
                <FieldBlock title="Magias" tone="old" value={<SpellList spells={current.spells ?? []} />} />
                <FieldBlock title="Variações" tone="old" value={<VariationList variations={current.variations ?? []} />} />
            </div>
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
                    <Sparkles className="h-4 w-4 text-emerald-200" />
                    Novo Resultado
                </div>
                <FieldBlock title="Nome" tone="new" value={candidate.name} />
                <FieldBlock title="Fonte" tone="new" value={getSourceDisplayLabel(candidate.source)} />
                <FieldBlock title="Imagem" tone="new" value={<ImageValue src={candidate.image} alt={`Nova imagem de ${candidate.name}`} tone="new" />} />
                <FieldBlock title="Descrição" tone="new" value={<HtmlValue html={candidate.description} />} />
                <FieldBlock title="Habilidades" tone="new" value={<TraitList traits={candidate.traits ?? []} tone="new" />} />
                <FieldBlock title="Magias" tone="new" value={<SpellList spells={candidate.spells ?? []} />} />
                <FieldBlock title="Variações" tone="new" value={<VariationList variations={candidate.variations as RaceVariation[]} />} />
            </div>
        </div>
    )
}

export const raceGenerationAdapter: EntityGenerationAdapter<Race, GeneratedRaceCandidate> = {
    entityName: "Raça",
    getId: (race) => race._id,
    getTitle: (race) => race.name,
    getSource: (race) => getSourceDisplayLabel(race.source),
    getCandidateId: (candidate) => candidate.candidateId,
    getCandidateLabel: (candidate) => candidate.matchLabel,
    generate: (race, runId) => generateRaceGenerationCandidates(race._id, runId),
    apply: (race, candidate) => applyRaceGenerationCandidate(race._id, candidate),
    renderComparison: (race, candidate) => <RaceGenerationComparison current={race} candidate={candidate} />,
}
