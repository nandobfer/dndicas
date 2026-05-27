"use client"

import type * as React from "react"
import { Sparkles } from "lucide-react"
import { getSourceDisplayLabel } from "@/core/utils/source-utils"
import { applyFeatGenerationCandidate, generateFeatGenerationCandidates } from "../api/entity-generation-api"
import type { EntityGenerationAdapter } from "../components/entity-generation-ai-modal"
import type { GeneratedFeatCandidate } from "../types/entity-generation.types"
import type { Feat } from "@/features/feats/types/feats.types"

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

function HtmlValue({ html }: { html: string }) {
    return (
        <div className="max-h-56 overflow-y-auto rounded border border-white/5 bg-black/15 p-2 custom-scrollbar">
            <div className="[&_p]:my-1 [&_p]:text-xs [&_p]:leading-relaxed [&_ul]:text-xs [&_li]:text-xs [&_table]:text-xs" dangerouslySetInnerHTML={{ __html: html || "<p>Vazio</p>" }} />
        </div>
    )
}

function ListValue({ items, empty }: { items?: string[]; empty: string }) {
    if (!items?.length) return <span className="text-white/35">{empty}</span>
    return (
        <div className="flex flex-wrap gap-1.5">
            {items.map((item, index) => (
                <span key={`${item}-${index}`} className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/75">
                    {item}
                </span>
            ))}
        </div>
    )
}

function AttributeValue({ values }: { values?: GeneratedFeatCandidate["attributeBonuses"] }) {
    if (!values?.length) return <span className="text-white/35">Nenhum bônus</span>
    return (
        <div className="flex flex-wrap gap-1.5">
            {values.map((bonus, index) => (
                <span key={`${bonus.attribute}-${bonus.value}-${index}`} className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/75">
                    {bonus.attribute} +{bonus.value}
                </span>
            ))}
        </div>
    )
}

function FeatGenerationComparison({ current, candidate }: { current: Feat; candidate: GeneratedFeatCandidate }) {
    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-red-100">
                    <span className="h-2 w-2 rounded-full bg-red-300" />
                    Estado Atual
                </div>
                <FieldBlock title="Nome" tone="old" value={current.name} />
                <FieldBlock title="Fonte" tone="old" value={getSourceDisplayLabel(current.source)} />
                <FieldBlock title="Nível" tone="old" value={`Nível ${current.level}`} />
                <FieldBlock title="Categoria" tone="old" value={current.category ?? "Vazio"} />
                <FieldBlock title="Pré-requisitos" tone="old" value={<ListValue items={current.prerequisites} empty="Nenhum pré-requisito" />} />
                <FieldBlock title="Bônus de Atributo" tone="old" value={<AttributeValue values={current.attributeBonuses} />} />
                <FieldBlock title="Descrição" tone="old" value={<HtmlValue html={current.description} />} />
            </div>
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
                    <Sparkles className="h-4 w-4 text-emerald-200" />
                    Novo Resultado
                </div>
                <FieldBlock title="Nome" tone="new" value={candidate.name} />
                <FieldBlock title="Fonte" tone="new" value={getSourceDisplayLabel(candidate.source)} />
                <FieldBlock title="Nível" tone="new" value={`Nível ${candidate.level ?? 1}`} />
                <FieldBlock title="Categoria" tone="new" value={candidate.category ?? "Vazio"} />
                <FieldBlock title="Pré-requisitos" tone="new" value={<ListValue items={candidate.prerequisites} empty="Nenhum pré-requisito" />} />
                <FieldBlock title="Bônus de Atributo" tone="new" value={<AttributeValue values={candidate.attributeBonuses} />} />
                <FieldBlock title="Descrição" tone="new" value={<HtmlValue html={candidate.description} />} />
            </div>
        </div>
    )
}

export const featGenerationAdapter: EntityGenerationAdapter<Feat, GeneratedFeatCandidate> = {
    entityName: "Talento",
    getId: (feat) => feat._id,
    getTitle: (feat) => feat.name,
    getSource: (feat) => getSourceDisplayLabel(feat.source),
    getCandidateId: (candidate) => candidate.candidateId,
    getCandidateLabel: (candidate) => candidate.matchLabel,
    generate: (feat, runId) => generateFeatGenerationCandidates(feat._id, runId),
    apply: (feat, candidate) => applyFeatGenerationCandidate(feat._id, candidate),
    renderComparison: (feat, candidate) => <FeatGenerationComparison current={feat} candidate={candidate} />,
}
