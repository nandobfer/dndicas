"use client"

import { useMemo, useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "@/core/utils"
import { Checkbox } from "@/core/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/core/ui/select"
import { GlassSelector } from "@/components/ui/glass-selector"
import { GlassModal, GlassModalContent, GlassModalDescription, GlassModalFooter, GlassModalHeader, GlassModalTitle } from "@/components/ui/glass-modal"
import { HpDicePanel } from "@/features/dice-roller/components/hp-dice-panel"
import type { DiceType } from "@/lib/config/colors"
import { useApplySheetLevelUp, useSheetLevelUp } from "../../api/character-sheets-queries"
import { ATTRIBUTE_LABELS, emptyLevelUpForm, levelUpChoicesOf, levelUpMissing, previewHpGain, toggleLimited, type LevelUpFormState } from "../../level-up/level-up-form"
import type { LevelUpGains, LevelUpOptions } from "../../level-up/level-up-types"
import type { AttributeType } from "../../types/character-sheet.types"

/**
 * Wizard "Subir de nível" (DND-56): mostra as opções reais do próximo nível vindas do servidor (PV, subclasse, talento ou
 * melhoria, traços, magias e truques, recursos e espaços de magia) e envia as escolhas, que o servidor valida e aplica.
 * Usado pela ficha (`/sheets/...`) e pela mesa do Maddox. Fechar não perde nada: a subida continua pendente.
 */

export interface LevelUpWizardProps {
    sheetId: string
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Nome do personagem no título (a mesa não tem a ficha aberta). */
    characterName?: string | null
    onDone?: (gains: LevelUpGains) => void
}

const SECTION = "rounded-xl border border-white/10 bg-white/[0.03] p-4"
const SECTION_TITLE = "mb-3 text-sm font-black uppercase tracking-[0.28em] text-white/55"
const NONE = "none"

export function LevelUpWizard(props: LevelUpWizardProps) {
    // O conteúdo só existe com o wizard aberto: reabrir começa com as escolhas zeradas.
    return props.open ? <LevelUpWizardOpen {...props} /> : null
}

function LevelUpWizardOpen({ sheetId, open, onOpenChange, characterName, onDone }: LevelUpWizardProps) {
    const [form, setForm] = useState<LevelUpFormState>(emptyLevelUpForm)
    const [error, setError] = useState<string | null>(null)
    const [rolling, setRolling] = useState(false)
    const query = useSheetLevelUp(sheetId, form.subclassId, open)
    const apply = useApplySheetLevelUp(sheetId)
    const options = query.data?.options ?? null

    const missing = options ? levelUpMissing(options, form) : null

    const confirm = async () => {
        if (!options) return
        if (missing) {
            setError(missing)
            return
        }
        setError(null)
        try {
            const result = await apply.mutateAsync(levelUpChoicesOf(options, form))
            onDone?.(result.gains)
            onOpenChange(false)
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Não foi possível subir de nível agora.")
        }
    }

    return (
        <GlassModal open={open} onOpenChange={onOpenChange}>
            <GlassModalContent size="full" className="w-[min(94vw,980px)]" bodyClassName="p-0">
                <div data-testid="level-up-modal" className="relative overflow-hidden">
                    <div className="border-b border-white/10 bg-gradient-to-br from-emerald-500/12 via-white/[0.03] to-transparent px-6 py-6">
                        <GlassModalHeader className="space-y-2 text-left">
                            <GlassModalTitle className="text-3xl font-black tracking-tight text-white">
                                {options ? `Nível ${options.currentLevel} -> ${options.targetLevel}` : "Subir de nível"}
                            </GlassModalTitle>
                            <GlassModalDescription className="text-white/65">
                                {characterName ? `${characterName}: confira` : "Confira"} o que muda e faça as escolhas antes de aplicar a progressão do personagem.
                            </GlassModalDescription>
                        </GlassModalHeader>
                    </div>

                    <div className="space-y-4 px-6 py-5">
                        {query.isLoading && (
                            <p className="flex items-center gap-2 text-sm text-white/60" role="status">
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando as opções do próximo nível…
                            </p>
                        )}
                        {query.error && <p className="text-sm text-red-300">{query.error instanceof Error ? query.error.message : "Não foi possível carregar as opções."}</p>}
                        {!options && query.data?.unavailable && <p className="text-sm text-amber-200" data-testid="level-up-unavailable">{query.data.unavailable}</p>}
                        {options && (
                            <LevelUpSections
                                sheetId={sheetId}
                                options={options}
                                form={form}
                                rolling={rolling}
                                onRolling={setRolling}
                                onChange={(next) => {
                                    setError(null)
                                    setForm((current) => ({ ...current, ...next }))
                                }}
                            />
                        )}
                        {error && (
                            <p className="text-sm font-medium text-amber-200" role="alert">
                                {error}
                            </p>
                        )}
                    </div>

                    <GlassModalFooter className="border-t border-white/10 px-6 py-5">
                        <motion.button
                            type="button"
                            whileHover={{ scale: 1.01, y: -1 }}
                            whileTap={{ scale: 0.99 }}
                            disabled={!options || apply.isPending}
                            onClick={() => void confirm()}
                            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/18 px-6 text-sm font-black uppercase tracking-[0.28em] text-emerald-100 shadow-[0_0_24px_rgba(16,185,129,0.18)] transition-colors hover:bg-emerald-500/28 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {apply.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                            Confirmar
                        </motion.button>
                    </GlassModalFooter>
                </div>
            </GlassModalContent>
        </GlassModal>
    )
}

interface SectionsProps {
    sheetId: string
    options: LevelUpOptions
    form: LevelUpFormState
    rolling: boolean
    onRolling: (value: boolean) => void
    onChange: (next: Partial<LevelUpFormState>) => void
}

function LevelUpSections({ sheetId, options, form, rolling, onRolling, onChange }: SectionsProps) {
    const gain = previewHpGain(options, form)
    const traits = useMemo(() => [...options.traits, ...(form.subclassId ? (options.subclassTraits[form.subclassId] ?? []) : [])], [options.traits, options.subclassTraits, form.subclassId])
    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/8 p-4" data-testid="level-up-hp">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/45">PV máximo</p>
                        <p className="mt-1 text-2xl font-black text-white">
                            {options.hpMax} -&gt; {options.hpMax + gain}
                        </p>
                        <p className="text-sm text-white/70">
                            Ganho de PV: <span className="font-bold text-white">{gain}</span>
                        </p>
                    </div>
                    <GlassSelector<"average" | "roll">
                        value={form.hpMethod}
                        onChange={(value) => {
                            const method = value as "average" | "roll"
                            onChange({ hpMethod: method, ...(method === "average" ? { hpDie: null } : {}) })
                            onRolling(method === "roll" && form.hpDie === null)
                        }}
                        options={[
                            { value: "average", label: `Média (${options.hpAverage})` },
                            { value: "roll", label: `Rolar ${options.hitDie}` },
                        ]}
                        size="sm"
                    />
                </div>
                {form.hpMethod === "roll" && rolling && (
                    <div className="mt-4 rounded-xl border border-white/10 bg-black/10 p-3">
                        <HpDicePanel
                            label="PV ao subir de nível"
                            terms={[{ dice: options.hitDie as DiceType, quantity: 1 }]}
                            modifier={options.constitutionModifier}
                            modifierParts={options.constitutionModifier ? [{ label: "Constituição", value: options.constitutionModifier, color: "constitution" }] : undefined}
                            sourceRef={{ sheetId, fieldId: "level-up-hp" }}
                            onRollResolved={(total) => {
                                onChange({ hpDie: Math.min(options.hitDieSides, Math.max(1, total - options.constitutionModifier)) })
                                onRolling(false)
                            }}
                        />
                    </div>
                )}
                {form.hpMethod === "roll" && form.hpDie !== null && (
                    <p className="mt-2 text-xs text-emerald-100">
                        Resultado rolado: {form.hpDie} no dado (+{options.constitutionModifier} de Constituição).
                    </p>
                )}
            </div>

            {options.subclass.required && (
                <div className={SECTION} data-testid="level-up-subclass">
                    <h3 className={SECTION_TITLE} id="level-up-subclass-label">
                        Escolha de subclasse
                    </h3>
                    <Select value={form.subclassId ?? NONE} onValueChange={(value) => onChange({ subclassId: value === NONE ? null : value, cantrips: [], spells: [], swapAdd: null, swapRemove: null })}>
                        <SelectTrigger aria-labelledby="level-up-subclass-label" className="h-10 w-full md:w-80">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NONE}>Escolha a subclasse</SelectItem>
                            {options.subclass.options.map((option) => (
                                <SelectItem key={option.id} value={option.id}>
                                    {option.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="mt-2 text-xs text-white/50">Obrigatório para confirmar o nível {options.targetLevel}.</p>
                </div>
            )}

            {options.feat && <FeatSection options={options} form={form} onChange={onChange} />}

            <div className={SECTION} data-testid="level-up-traits">
                <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className={cn(SECTION_TITLE, "mb-0")}>Novos traços</h3>
                    <span className="text-xs text-white/45">Nível {options.targetLevel}</span>
                </div>
                {traits.length ? (
                    <ul className="flex flex-wrap gap-2">
                        {traits.map((trait) => (
                            <li key={`${trait.source}-${trait.id}`} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-white/85">
                                <span className="mr-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/45">{trait.source}</span>
                                {trait.label}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-white/55">Nenhum traço novo neste nível.</p>
                )}
            </div>

            {options.spells && <SpellSection options={options} form={form} onChange={onChange} />}

            {(options.resources.length > 0 || slotChanges(options).length > 0) && (
                <div className={SECTION} data-testid="level-up-resources">
                    <h3 className={SECTION_TITLE}>Mudanças de recursos</h3>
                    <div className="space-y-2">
                        {options.resources.map((change) => (
                            <div key={change.name} className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2">
                                <span className="text-sm text-white/85">{change.name}</span>
                                <span className="text-sm font-bold text-white">
                                    {change.before ?? 0} -&gt; {change.after}
                                </span>
                            </div>
                        ))}
                        {slotChanges(options).map((change) => (
                            <div key={`slot-${change.circle}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2">
                                <span className="text-sm text-white/85">Espaços de {change.circle}º círculo</span>
                                <span className="text-sm font-bold text-white">
                                    {change.before} -&gt; {change.after}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

function slotChanges(options: LevelUpOptions) {
    const circles = [...new Set([...Object.keys(options.spellSlots.before), ...Object.keys(options.spellSlots.after)])].sort((a, b) => Number(a) - Number(b))
    return circles.map((circle) => ({ circle, before: options.spellSlots.before[circle] ?? 0, after: options.spellSlots.after[circle] ?? 0 })).filter((change) => change.before !== change.after)
}

function FeatSection({ options, form, onChange }: Omit<SectionsProps, "sheetId" | "rolling" | "onRolling">) {
    const slot = options.feat!
    const feat = slot.options.find((option) => option.id === form.featId) ?? null
    const title = slot.kind === "fighting-style" ? "Estilo de Luta" : slot.kind === "epic" ? "Dádiva Épica" : "Talento ou melhoria de atributo"
    const setPart = (key: AttributeType, value: number) => {
        const next = { ...form.featAttributes, [key]: value }
        if (!value) delete next[key]
        onChange({ featAttributes: next })
    }
    return (
        <div className={SECTION} data-testid="level-up-feat">
            <h3 className={SECTION_TITLE} id="level-up-feat-label">
                {title}
            </h3>
            <Select value={form.featId ?? NONE} onValueChange={(value) => onChange({ featId: value === NONE ? null : value, featAttributes: {} })}>
                <SelectTrigger aria-labelledby="level-up-feat-label" className="h-10 w-full md:w-96">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={NONE}>Escolha</SelectItem>
                    {slot.options.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                            {option.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {feat?.attributeRule.kind === "asi" && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="level-up-feat-attributes">
                    {(Object.keys(ATTRIBUTE_LABELS) as AttributeType[]).map((key) => (
                        <div key={key} className="flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2">
                            <span className="text-sm text-white/80">
                                {ATTRIBUTE_LABELS[key]} <span className="text-white/45">({options.scores[key]})</span>
                            </span>
                            <GlassSelector<number>
                                value={form.featAttributes[key] ?? 0}
                                onChange={(value) => setPart(key, Number(value))}
                                options={[0, 1, 2].map((value) => ({ value, label: `+${value}`, disabled: options.scores[key] + value > slot.cap }))}
                                size="sm"
                            />
                        </div>
                    ))}
                </div>
            )}
            {feat?.attributeRule.kind === "one-of" && (
                <div className="mt-3">
                    <p className="mb-2 text-xs text-white/55">Atributo que recebe +1:</p>
                    <GlassSelector<string>
                        value={Object.keys(form.featAttributes)[0] ?? ""}
                        onChange={(value) => onChange({ featAttributes: { [value as AttributeType]: 1 } })}
                        options={feat.attributeRule.options.map((key) => ({ value: key, label: ATTRIBUTE_LABELS[key], disabled: options.scores[key] + 1 > slot.cap }))}
                        size="sm"
                    />
                </div>
            )}
            <p className="mt-2 text-xs text-white/50">Obrigatório para confirmar o nível {options.targetLevel}.</p>
        </div>
    )
}

function SpellSection({ options, form, onChange }: Omit<SectionsProps, "sheetId" | "rolling" | "onRolling">) {
    const step = options.spells!
    const swappable = step.known.filter((spell) => spell.circle > 0)
    return (
        <div className={SECTION} data-testid="level-up-spells">
            <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className={cn(SECTION_TITLE, "mb-0 flex items-center gap-2")}>
                    <Sparkles className="h-4 w-4 text-primary" aria-hidden /> Magias e truques
                </h3>
                <span className="text-xs text-white/45">Até o {step.maxCircle}º círculo</span>
            </div>
            {step.cantrips > 0 && (
                <SpellChecklist
                    title={`Truques novos (${form.cantrips.length}/${step.cantrips})`}
                    testId="level-up-cantrips"
                    items={step.cantripOptions}
                    selected={form.cantrips}
                    onToggle={(id) => onChange({ cantrips: toggleLimited(form.cantrips, id, step.cantrips) })}
                />
            )}
            {step.spells > 0 && (
                <SpellChecklist
                    title={`Magias novas (${form.spells.length}/${step.spells})`}
                    testId="level-up-new-spells"
                    items={step.spellOptions.filter((spell) => spell.id !== form.swapAdd)}
                    selected={form.spells}
                    onToggle={(id) => onChange({ spells: toggleLimited(form.spells, id, step.spells) })}
                />
            )}
            {step.swap.allowed && swappable.length > 0 && (
                <div className="mt-4 space-y-2" data-testid="level-up-swap">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-white/55">Trocar uma magia (opcional)</p>
                    {step.swap.source && <p className="text-xs text-white/45">{step.swap.source}</p>}
                    <div className="grid gap-2 md:grid-cols-2">
                        <Select value={form.swapRemove ?? NONE} onValueChange={(value) => onChange({ swapRemove: value === NONE ? null : value })}>
                            <SelectTrigger aria-label="Magia que sai" className="h-10">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NONE}>Sem troca</SelectItem>
                                {swappable.map((spell) => (
                                    <SelectItem key={spell.id} value={spell.id}>
                                        {spell.name} ({spell.circle}º)
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={form.swapAdd ?? NONE} onValueChange={(value) => onChange({ swapAdd: value === NONE ? null : value })}>
                            <SelectTrigger aria-label="Magia que entra" className="h-10">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NONE}>Sem troca</SelectItem>
                                {step.spellOptions
                                    .filter((spell) => !form.spells.includes(spell.id))
                                    .map((spell) => (
                                        <SelectItem key={spell.id} value={spell.id}>
                                            {spell.name} ({spell.circle}º)
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            )}
        </div>
    )
}

function SpellChecklist({ title, testId, items, selected, onToggle }: { title: string; testId: string; items: { id: string; name: string; circle: number }[]; selected: string[]; onToggle: (id: string) => void }) {
    return (
        <div className="mt-2" data-testid={testId}>
            <p className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-white/55">{title}</p>
            <div className="grid max-h-56 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                {items.map((spell) => (
                    <label key={spell.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-white/85 hover:border-white/20">
                        <Checkbox checked={selected.includes(spell.id)} onCheckedChange={() => onToggle(spell.id)} aria-label={spell.name} />
                        <span>{spell.name}</span>
                        {spell.circle > 0 && <span className="ml-auto text-[10px] text-white/45">{spell.circle}º</span>}
                    </label>
                ))}
            </div>
        </div>
    )
}
