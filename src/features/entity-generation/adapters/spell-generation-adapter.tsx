"use client"

import type * as React from "react"
import { Sparkles } from "lucide-react"
import { GlassAttributeChip } from "@/components/ui/glass-attribute-chip"
import { GlassDiceValue } from "@/components/ui/glass-dice-value"
import { GlassEmptyValue } from "@/components/ui/glass-empty-value"
import { GlassLevelChip } from "@/components/ui/glass-level-chip"
import { GlassSpellSchool } from "@/components/ui/glass-spell-school"
import { applySpellGenerationCandidate, generateSpellGenerationCandidates } from "../api/entity-generation-api"
import type { EntityGenerationAdapter } from "../components/entity-generation-ai-modal"
import type { GeneratedSpellCandidate } from "../types/entity-generation.types"
import type { Spell } from "@/features/spells/types/spells.types"

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
            <div className="[&_p]:my-1 [&_p]:text-xs [&_p]:leading-relaxed [&_ul]:text-xs [&_li]:text-xs" dangerouslySetInnerHTML={{ __html: html || "<p>Vazio</p>" }} />
        </div>
    )
}

function ComponentsValue({ components }: { components: string[] | undefined }) {
    if (!components?.length) return <GlassEmptyValue />
    return (
        <div className="flex flex-wrap gap-1.5">
            {components.map((component) => (
                <span key={component} className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/75">
                    {component}
                </span>
            ))}
        </div>
    )
}

function SpellProperties({ spell }: { spell: Spell | GeneratedSpellCandidate }) {
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                <GlassLevelChip level={spell.circle} type="circle" size="sm" />
                <GlassSpellSchool school={spell.school} size="sm" />
                {spell.saveAttribute ? <GlassAttributeChip attribute={spell.saveAttribute} /> : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
                <span className="text-xs text-white/60">Conjuração: <span className="text-white/80">{spell.castingTime ?? "Vazio"}</span></span>
                <span className="text-xs text-white/60">Alcance: <span className="text-white/80">{spell.range ?? "Vazio"}</span></span>
                <span className="text-xs text-white/60">Duração: <span className="text-white/80">{spell.duration ?? "Vazio"}</span></span>
                <span className="text-xs text-white/60">Área: <span className="text-white/80">{spell.area ?? "Vazio"}</span></span>
            </div>
        </div>
    )
}

function DiceValue({ spell }: { spell: Spell | GeneratedSpellCandidate }) {
    return (
        <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1.5 text-xs text-white/60">
                Base:
                {spell.baseDice ? <GlassDiceValue value={spell.baseDice} /> : <GlassEmptyValue />}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-white/60">
                Por nível:
                {spell.extraDicePerLevel ? <GlassDiceValue value={spell.extraDicePerLevel} /> : <GlassEmptyValue />}
            </div>
        </div>
    )
}

function SpellGenerationComparison({ current, candidate }: { current: Spell; candidate: GeneratedSpellCandidate }) {
    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-red-100">
                    <span className="h-2 w-2 rounded-full bg-red-300" />
                    Estado Atual
                </div>
                <FieldBlock title="Nome" tone="old" value={current.name} />
                <FieldBlock title="Fonte" tone="old" value={current.source} />
                <FieldBlock title="Propriedades" tone="old" value={<SpellProperties spell={current} />} />
                <FieldBlock title="Componentes" tone="old" value={<ComponentsValue components={current.component} />} />
                <FieldBlock title="Dados" tone="old" value={<DiceValue spell={current} />} />
                <FieldBlock title="Descrição" tone="old" value={<HtmlValue html={current.description} />} />
            </div>
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
                    <Sparkles className="h-4 w-4 text-emerald-200" />
                    Novo Resultado
                </div>
                <FieldBlock title="Nome" tone="new" value={candidate.name} />
                <FieldBlock title="Fonte" tone="new" value={candidate.source} />
                <FieldBlock title="Propriedades" tone="new" value={<SpellProperties spell={candidate} />} />
                <FieldBlock title="Componentes" tone="new" value={<ComponentsValue components={candidate.component} />} />
                <FieldBlock title="Dados" tone="new" value={<DiceValue spell={candidate} />} />
                <FieldBlock title="Descrição" tone="new" value={<HtmlValue html={candidate.description} />} />
            </div>
        </div>
    )
}

export const spellGenerationAdapter: EntityGenerationAdapter<Spell, GeneratedSpellCandidate> = {
    entityName: "Magia",
    getId: (spell) => spell._id,
    getTitle: (spell) => spell.name,
    getSource: (spell) => spell.source,
    getCandidateId: (candidate) => candidate.candidateId,
    getCandidateLabel: (candidate) => candidate.matchLabel,
    generate: (spell, runId) => generateSpellGenerationCandidates(spell._id, runId),
    apply: (spell, candidate) => applySpellGenerationCandidate(spell._id, candidate),
    renderComparison: (spell, candidate) => <SpellGenerationComparison current={spell} candidate={candidate} />,
}
