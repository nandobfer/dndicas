"use client"

import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check, Flag, HelpCircle, Loader2, MinusCircle, Sparkles, Swords, X } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Textarea } from "@/components/ui/opex/textarea"
import { OptionTabs } from "@/components/ui/opex/option-tabs"
import { GlassSelector } from "@/components/ui/glass-selector"
import { cn } from "@/lib/utils"
import { rarityColors } from "@/lib/config/colors"
import type { CombatEconomySlot, CombatOption, CombatOptionCategory } from "../../../combat-options"
import { MADDOX_COMBAT_FREE_TEXT_MAX } from "../../../constants"
import type { MaddoxCombatActionInput } from "../../../combat-schemas"
import type { MaddoxMyCombatDto, MaddoxTacticalCombatDto } from "../../../game-types"
import { RarityChip } from "../../campaigns/campaign-visuals"
import { ECONOMY_COLORS, ECONOMY_LABELS } from "./combat-visuals"

/**
 * Barra de combate (Maddox 7): na minha vez substitui o campo de texto — botões grandes Ação, Ação bônus e Encerrar
 * turno, a economia do turno e "Perguntar ao mestre". Ação e Ação bônus abrem UM painel ancorado ao botão que o abriu
 * (reposicionado ao trocar, limitado às bordas da janela) com as categorias, as opções que o personagem pode usar, o
 * alvo e o círculo da magia. "Outra ação" é o texto livre validado pelo Maddox.
 */

export const CATEGORY_LABELS: Record<CombatOptionCategory, string> = { weapons: "Armas", spells: "Magias", items: "Itens", abilities: "Habilidades", standard: "Ações comuns", other: "Outra ação" }
const CATEGORY_ORDER: CombatOptionCategory[] = ["weapons", "spells", "items", "abilities", "standard", "other"]
/** Largura do painel (px), para o alinhamento ao gatilho. */
export const COMBAT_MENU_WIDTH = 420
const VIEWPORT_MARGIN = 8

/** Posição horizontal do painel: a borda esquerda do gatilho, limitada ao contêiner e à janela. */
export function anchorLeft(triggerLeft: number, containerWidth: number, containerViewportLeft: number, viewportWidth: number, panelWidth = COMBAT_MENU_WIDTH): number {
    const width = Math.min(panelWidth, viewportWidth - VIEWPORT_MARGIN * 2)
    const maxInContainer = Math.max(0, containerWidth - width)
    let left = Math.min(Math.max(0, triggerLeft), maxInContainer)
    const viewportLeft = containerViewportLeft + left
    if (viewportLeft < VIEWPORT_MARGIN) left += VIEWPORT_MARGIN - viewportLeft
    if (viewportLeft + width > viewportWidth - VIEWPORT_MARGIN) left -= viewportLeft + width - (viewportWidth - VIEWPORT_MARGIN)
    return Math.round(left)
}

interface Props {
    me: MaddoxMyCombatDto
    combat: MaddoxTacticalCombatDto
    color: string
    busy: boolean
    invalidReason: string | null
    onAct: (input: MaddoxCombatActionInput) => Promise<boolean>
    onEndTurn: (movement: string) => void
    onAsk: () => void
}

export function CombatActionBar({ me, combat, color, busy, invalidReason, onAct, onEndTurn, onAsk }: Props) {
    const [open, setOpen] = useState<CombatEconomySlot | null>(null)
    const [left, setLeft] = useState(0)
    const [movement, setMovement] = useState("")
    const containerRef = useRef<HTMLDivElement>(null)
    const triggers = useRef<Record<string, HTMLButtonElement | null>>({})
    const economy = me.economy
    const options = me.options

    useLayoutEffect(() => {
        if (!open) return
        const trigger = triggers.current[open]
        const container = containerRef.current
        if (!trigger || !container) return
        const rect = container.getBoundingClientRect()
        setLeft(anchorLeft(trigger.offsetLeft, container.clientWidth, rect.left, window.innerWidth))
    }, [open])

    if (me.dying) {
        return (
            <div className="border-t px-4 py-3 text-sm text-white/80" data-testid="combat-bar" data-dying="true">
                Seu personagem está com 0 PV: role o <strong>teste contra a morte</strong> na conversa. A vez encerra depois da rolagem.
            </div>
        )
    }

    const actionCount = options?.action.length ?? 0
    const bonusCount = options?.bonus.length ?? 0
    return (
        <div ref={containerRef} className="relative border-t px-4 py-3" data-testid="combat-bar">
            <AnimatePresence>
                {open && options && (
                    <motion.div
                        key="menu"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        className="absolute bottom-full z-30 mb-2"
                        style={{ left, width: COMBAT_MENU_WIDTH, maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)` }}
                        data-testid="combat-menu"
                        data-anchor={open}
                    >
                        <CombatActionMenu
                            key={open}
                            economy={open}
                            options={open === "action" ? options.action : options.bonus}
                            combat={combat}
                            busy={busy}
                            invalidReason={invalidReason}
                            onClose={() => setOpen(null)}
                            onConfirm={async (input) => {
                                const done = await onAct(input)
                                if (done) setOpen(null)
                            }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
            <div className="flex flex-wrap items-center gap-2">
                <Button
                    ref={(node) => {
                        triggers.current.action = node
                    }}
                    size="lg"
                    disabled={busy || actionCount === 0}
                    onClick={() => setOpen(open === "action" ? null : "action")}
                    className={cn("h-12 min-w-[8.5rem] text-base font-semibold")}
                    style={{ background: open === "action" ? ECONOMY_COLORS.action : undefined }}
                    data-testid="combat-action-button"
                    aria-expanded={open === "action"}
                >
                    <Swords aria-hidden /> Ação
                </Button>
                <Button
                    ref={(node) => {
                        triggers.current.bonus = node
                    }}
                    size="lg"
                    variant="outline"
                    disabled={busy || bonusCount === 0}
                    onClick={() => setOpen(open === "bonus" ? null : "bonus")}
                    className="h-12 min-w-[8.5rem] text-base font-semibold"
                    style={{ borderColor: ECONOMY_COLORS.bonus, background: open === "bonus" ? `${ECONOMY_COLORS.bonus}33` : undefined }}
                    data-testid="combat-bonus-button"
                    aria-expanded={open === "bonus"}
                >
                    <Sparkles aria-hidden /> Ação bônus
                </Button>
                <div className="flex flex-wrap items-center gap-1" data-testid="combat-economy">
                    {economy &&
                        (["action", "bonus", "reaction"] as const).map((slot) => {
                            const available = slot === "action" ? economy.action || (economy.attackAction && economy.attacksLeft > 0) : economy[slot]
                            return (
                                <span key={slot} data-slot={slot} data-available={available}>
                                    <RarityChip color={available ? ECONOMY_COLORS[slot] : rarityColors.common}>
                                        {available ? <Check className="h-3 w-3" aria-hidden /> : <X className="h-3 w-3" aria-hidden />}
                                        {ECONOMY_LABELS[slot]}
                                        {slot === "action" && economy.attackAction && economy.attacksLeft > 0 ? ` · ${economy.attacksLeft} ataque(s)` : ""}
                                    </RarityChip>
                                </span>
                            )
                        })}
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={onAsk} disabled={busy}>
                        <HelpCircle aria-hidden /> Perguntar ao mestre
                    </Button>
                </div>
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-2">
                <Textarea value={movement} onChange={(event) => setMovement(event.target.value.slice(0, MADDOX_COMBAT_FREE_TEXT_MAX))} placeholder="Movimento e posição (opcional): para onde o personagem vai…" rows={1} className="min-h-[2.5rem] flex-1 resize-none text-sm" aria-label="Movimento e posição" data-testid="combat-movement" />
                <Button size="lg" variant="outline" disabled={busy} onClick={() => onEndTurn(movement)} className="h-11" style={{ borderColor: color }} data-testid="combat-end-turn">
                    {busy ? <Loader2 className="animate-spin" aria-hidden /> : actionCount === 0 && bonusCount === 0 ? <Flag aria-hidden /> : <MinusCircle aria-hidden />} Encerrar turno
                </Button>
            </div>
        </div>
    )
}

interface MenuProps {
    economy: CombatEconomySlot
    options: CombatOption[]
    combat: MaddoxTacticalCombatDto
    busy: boolean
    invalidReason: string | null
    onClose: () => void
    onConfirm: (input: MaddoxCombatActionInput) => Promise<void>
}

/** Menu de opções da Ação ou da Ação bônus (categorias vazias não aparecem). */
export function CombatActionMenu({ economy: economySlot, options, combat, busy, invalidReason, onClose, onConfirm }: MenuProps) {
    const economy = economySlot === "bonus" ? "bonus" : "action"
    const categories = useMemo(() => CATEGORY_ORDER.filter((category) => options.some((option) => option.category === category)), [options])
    const [category, setCategory] = useState<CombatOptionCategory>(categories[0] ?? "other")
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [targets, setTargets] = useState<string[]>([])
    const [level, setLevel] = useState<number | null>(null)
    const [skill, setSkill] = useState<string | null>(null)
    const [freeText, setFreeText] = useState("")
    const selected = options.find((option) => option.id === selectedId) ?? null
    const visible = options.filter((option) => option.category === category)
    const candidates = combat.order.filter((slot) => {
        if (!selected) return false
        if (selected.target === "enemy") return slot.kind === "combatant" && slot.side === "inimigo" && !slot.defeated
        if (selected.target === "ally") return slot.kind === "character" && !slot.dead
        if (selected.target === "any") return !slot.defeated && !slot.dead
        return false
    })
    const needsTarget = Boolean(selected && selected.target !== "none" && selected.target !== "self")
    const needsText = Boolean(selected && (selected.resolution === "free" || selected.uncertain || selected.id === "standard:ready"))
    const levels = selected?.spell?.levels ?? []
    const ready = Boolean(selected && (!needsTarget || targets.length > 0) && (!needsText || freeText.trim()) && (!selected.skills?.length || skill))

    const pick = (option: CombatOption) => {
        setSelectedId(option.id)
        setTargets([])
        setLevel(option.spell?.levels[0] ?? null)
        setSkill(option.skills?.[0] ?? null)
    }

    return (
        <div className="space-y-3 rounded-xl border bg-popover/95 p-3 shadow-xl backdrop-blur" style={{ borderColor: `${ECONOMY_COLORS[economy]}66` }} role="dialog" aria-label={ECONOMY_LABELS[economy]}>
            <div className="flex items-center gap-2">
                <RarityChip color={ECONOMY_COLORS[economy]}>{ECONOMY_LABELS[economy]}</RarityChip>
                <span className="flex-1 text-xs text-white/60">Só o que o seu personagem pode usar agora.</span>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose} aria-label="Fechar">
                    <X aria-hidden />
                </Button>
            </div>
            {categories.length > 1 && (
                <OptionTabs
                    size="xs"
                    aria-label="Categorias"
                    className="flex-wrap"
                    options={categories.map((value) => ({ value, label: CATEGORY_LABELS[value] }))}
                    value={category}
                    onChange={(value) => {
                        setCategory(value)
                        setSelectedId(null)
                    }}
                />
            )}
            <ul className="max-h-56 space-y-1 overflow-y-auto pr-1" data-testid="combat-menu-options">
                {visible.map((option) => (
                    <li key={option.id}>
                        <button
                            type="button"
                            onClick={() => pick(option)}
                            className={cn("w-full rounded-lg border px-2.5 py-2 text-left transition-colors hover:bg-white/5", option.id === selectedId ? "border-primary bg-primary/15" : "border-white/10")}
                            data-testid="combat-option"
                            data-option-id={option.id}
                            aria-pressed={option.id === selectedId}
                        >
                            <span className="block text-sm font-medium text-white">{option.label}</span>
                            <span className="block text-[11px] text-white/60">{option.detail}</span>
                        </button>
                    </li>
                ))}
            </ul>
            {selected && (
                <div className="space-y-2 border-t border-white/10 pt-2" data-testid="combat-menu-detail">
                    {needsTarget && (
                        <div className="space-y-1">
                            <p className="text-xs text-white/60">{selected.multiTarget ? "Alvos" : "Alvo"}</p>
                            {candidates.length ? (
                                <GlassSelector<string>
                                    mode={selected.multiTarget ? "multi" : "single"}
                                    layout="horizontal"
                                    size="sm"
                                    value={selected.multiTarget ? targets : (targets[0] ?? "")}
                                    onChange={(value) => setTargets(Array.isArray(value) ? value : [value])}
                                    options={candidates.map((slot) => ({ value: slot.actorKey, label: slot.name }))}
                                />
                            ) : (
                                <p className="text-xs text-white/50">Nenhum alvo disponível.</p>
                            )}
                        </div>
                    )}
                    {levels.length > 1 && (
                        <div className="space-y-1">
                            <p className="text-xs text-white/60">Círculo do espaço de magia</p>
                            <GlassSelector<number> layout="horizontal" size="sm" value={level ?? levels[0]!} onChange={(value) => setLevel(Array.isArray(value) ? (value[0] ?? null) : value)} options={levels.map((value) => ({ value, label: `${value}º` }))} />
                        </div>
                    )}
                    {selected.skills && selected.skills.length > 1 && (
                        <div className="space-y-1">
                            <p className="text-xs text-white/60">Perícia</p>
                            <GlassSelector<string> layout="horizontal" size="sm" value={skill ?? ""} onChange={(value) => setSkill(Array.isArray(value) ? (value[0] ?? null) : value)} options={selected.skills.map((value) => ({ value, label: value }))} />
                        </div>
                    )}
                    {needsText && (
                        <Textarea
                            value={freeText}
                            onChange={(event) => setFreeText(event.target.value.slice(0, MADDOX_COMBAT_FREE_TEXT_MAX))}
                            rows={2}
                            placeholder={selected.id === "standard:ready" ? "O que você prepara e qual o gatilho…" : "Descreva o que o personagem faz…"}
                            aria-label="Descrição da ação"
                            data-testid="combat-free-text"
                        />
                    )}
                    {invalidReason && (
                        <p className="rounded-md border px-2 py-1.5 text-xs" style={{ borderColor: `${rarityColors.artifact}66`, color: rarityColors.artifact }} role="alert" data-testid="combat-invalid-reason">
                            {invalidReason}
                        </p>
                    )}
                    <div className="flex justify-end">
                        <Button
                            size="sm"
                            disabled={!ready || busy}
                            onClick={() =>
                                void onConfirm({
                                    economy,
                                    optionId: selected.id,
                                    ...(targets.length ? { targets } : {}),
                                    ...(level ? { spellLevel: level } : {}),
                                    ...(skill ? { skill } : {}),
                                    ...(freeText.trim() ? { freeText: freeText.trim() } : {}),
                                    ...(selected.id === "standard:ready" && freeText.trim() ? { readyTrigger: freeText.trim() } : {}),
                                })
                            }
                            data-testid="combat-confirm"
                        >
                            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />} Confirmar
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}

/** Fora da minha vez: de quem é a vez e a rodada. */
export function CombatWaitBar({ combat, onAsk, canAsk }: { combat: MaddoxTacticalCombatDto; onAsk: () => void; canAsk: boolean }) {
    const active = combat.order.find((slot) => slot.active)
    return (
        <div className="flex items-center gap-2 border-t px-4 py-3 text-sm text-white/80" data-testid="combat-wait-bar">
            <Swords className="h-4 w-4 text-red-300" aria-hidden />
            <span className="flex-1">{combat.phase === "initiative" ? "Rolando a iniciativa…" : active ? `Vez de ${active.name}${active.initiative !== null ? ` (iniciativa ${active.initiative})` : ""} · Rodada ${combat.round}` : `Vez dos adversários · Rodada ${combat.round}`}</span>
            {canAsk && (
                <Button size="sm" variant="ghost" onClick={onAsk}>
                    <HelpCircle aria-hidden /> Perguntar ao mestre
                </Button>
            )}
        </div>
    )
}
