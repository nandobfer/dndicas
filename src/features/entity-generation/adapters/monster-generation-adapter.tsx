"use client"

import type * as React from "react"
import { Sparkles } from "lucide-react"
import { GlassImage } from "@/components/ui/glass-image"
import { getSourceDisplayLabel } from "@/core/utils/source-utils"
import { applyMonsterGenerationCandidate, generateMonsterGenerationCandidates } from "../api/entity-generation-api"
import type { EntityGenerationAdapter } from "../components/entity-generation-ai-modal"
import type { GeneratedMonsterCandidate } from "../types/entity-generation.types"
import type { Monster, NpcParam } from "@/features/monsters/types/monsters.types"

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
        <div className="max-h-48 overflow-y-auto rounded border border-white/5 bg-black/15 p-2 custom-scrollbar">
            <div className="[&_p]:my-1 [&_p]:text-xs [&_p]:leading-relaxed [&_ul]:text-xs [&_li]:text-xs" dangerouslySetInnerHTML={{ __html: html || "<p>Vazio</p>" }} />
        </div>
    )
}

function ImageValue({ src, alt, tone }: { src?: string; alt: string; tone: ComparisonTone }) {
    if (!src) {
        return <div className="flex aspect-[16/9] min-h-32 items-center justify-center rounded-lg border border-dashed border-white/10 bg-black/15 text-xs text-white/35">Sem imagem</div>
    }
    return (
        <div className={tone === "old" ? "aspect-[16/9] min-h-32 overflow-hidden rounded-lg border border-red-300/20 bg-black/20" : "aspect-[16/9] min-h-32 overflow-hidden rounded-lg border border-emerald-300/25 bg-black/20"}>
            <GlassImage src={src} alt={alt} className="h-full w-full rounded-none border-0 shadow-none" imageClassName="object-cover mix-blend-normal" showOverlay={false} />
        </div>
    )
}

function ParamList({ params, tone }: { params?: NpcParam[]; tone: ComparisonTone }) {
    if (!params?.length) return <span className="text-white/35">Nenhum item</span>
    return (
        <div className="space-y-2">
            {params.map((param, index) => (
                <div key={`${param.label}-${index}`} className={tone === "old" ? "rounded-lg border border-red-300/15 bg-black/15 p-2" : "rounded-lg border border-emerald-300/20 bg-black/15 p-2"}>
                    <div className={tone === "old" ? "mb-1 text-xs font-semibold text-red-100/90" : "mb-1 text-xs font-semibold text-emerald-100"}>{param.label}</div>
                    <HtmlValue html={param.description} />
                </div>
            ))}
        </div>
    )
}

function MonsterSummary({ monster }: { monster: Monster | GeneratedMonsterCandidate }) {
    return (
        <div className="grid gap-2 sm:grid-cols-2">
            <span className="text-xs text-white/60">Tipo: <span className="text-white/80">{monster.size} {monster.type}</span></span>
            <span className="text-xs text-white/60">Alinhamento: <span className="text-white/80">{monster.alignment}</span></span>
            <span className="text-xs text-white/60">CR: <span className="text-white/80">{monster.challengeRating}</span></span>
            <span className="text-xs text-white/60">CA: <span className="text-white/80">{monster.armorClass}</span></span>
            <span className="text-xs text-white/60">PV: <span className="text-white/80">{monster.hitPointsFormula}</span></span>
            <span className="text-xs text-white/60">Vel.: <span className="text-white/80">{monster.speed ?? "Vazio"}</span></span>
        </div>
    )
}

function MonsterGenerationComparison({ current, candidate }: { current: Monster; candidate: GeneratedMonsterCandidate }) {
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
                <FieldBlock title="Resumo" tone="old" value={<MonsterSummary monster={current} />} />
                <FieldBlock title="Descrição" tone="old" value={<HtmlValue html={current.description} />} />
                <FieldBlock title="Características" tone="old" value={<ParamList params={current.traits} tone="old" />} />
                <FieldBlock title="Ações" tone="old" value={<ParamList params={current.actions} tone="old" />} />
            </div>
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
                    <Sparkles className="h-4 w-4 text-emerald-200" />
                    Novo Resultado
                </div>
                <FieldBlock title="Nome" tone="new" value={candidate.name} />
                <FieldBlock title="Fonte" tone="new" value={getSourceDisplayLabel(candidate.source)} />
                <FieldBlock title="Imagem" tone="new" value={<ImageValue src={candidate.image} alt={`Nova imagem de ${candidate.name}`} tone="new" />} />
                <FieldBlock title="Resumo" tone="new" value={<MonsterSummary monster={candidate} />} />
                <FieldBlock title="Descrição" tone="new" value={<HtmlValue html={candidate.description} />} />
                <FieldBlock title="Características" tone="new" value={<ParamList params={candidate.traits} tone="new" />} />
                <FieldBlock title="Ações" tone="new" value={<ParamList params={candidate.actions} tone="new" />} />
            </div>
        </div>
    )
}

export const monsterGenerationAdapter: EntityGenerationAdapter<Monster, GeneratedMonsterCandidate> = {
    entityName: "Monstro",
    getId: (monster) => monster._id,
    getTitle: (monster) => monster.name,
    getSource: (monster) => getSourceDisplayLabel(monster.source),
    getCandidateId: (candidate) => candidate.candidateId,
    getCandidateLabel: (candidate) => candidate.matchLabel,
    generate: (monster, runId) => generateMonsterGenerationCandidates(monster._id, runId),
    apply: (monster, candidate) => applyMonsterGenerationCandidate(monster._id, candidate),
    renderComparison: (monster, candidate) => <MonsterGenerationComparison current={monster} candidate={candidate} />,
}
