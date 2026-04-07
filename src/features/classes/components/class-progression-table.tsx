/**
 * @fileoverview ClassProgressionTable — reusable progression table component.
 *
 * Modes:
 *  - view: read-only (used in ClassPreview and ClassesTable popover)
 *  - edit: editable spell slots, custom columns, shortcut buttons (used in ClassFormModal)
 *
 * Auto-derived columns: Level, Proficiency Bonus, Features (from traits)
 * Conditional columns: Cantrips, Prepared Spells, Spell Slots 1–9 (when spellcasting)
 * Manual columns: Custom columns stored in progressionData.customColumns
 */

"use client"

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, X, ChevronRight, Table2, Zap, Wand2, AlertTriangle } from "lucide-react"
import { cn } from "@/core/utils"
import { MentionContent } from "@/features/rules/components/mention-badge"
import { GlassDiceValue } from "@/components/ui/glass-dice-value"
import type { DiceValue, DiceType } from "@/features/spells/types/spells.types"
import { proficiencyBonusColors, rarityToTailwind } from "@/lib/config/colors"
import type { ClassTrait } from "../types/classes.types"
import type { ClassProgressionData, SpellProgressionType } from "../types/progression.types"
import {
    buildProgressionRows,
    getProficiencyBonus,
    applySpellTemplate,
    hasSpellSlotData,
    SPELL_TEMPLATE_LABELS,
    createEmptyCustomColumn,
    type SubclassRowData,
} from "../utils/progression-utils"

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_DICE_TYPES = new Set<DiceType>(['d4', 'd6', 'd8', 'd10', 'd12', 'd20'])
const DICE_NOTATION_RE = /^(\d+)(d(?:4|6|8|10|12|20))$/i

function parseDiceNotation(value: string): DiceValue | null {
    const match = value.trim().match(DICE_NOTATION_RE)
    if (!match) return null
    const tipo = match[2].toLowerCase() as DiceType
    if (!VALID_DICE_TYPES.has(tipo)) return null
    return { quantidade: parseInt(match[1], 10), tipo }
}

function renderCustomCellValue(cellValue: string | number, subclassColor?: string) {
    const dice = typeof cellValue === 'string' ? parseDiceNotation(cellValue) : null
    if (dice) {
        return (
            <GlassDiceValue
                value={dice}
                showIcon={false}
                colorOverride={subclassColor ? { text: `${subclassColor}cc` } : undefined}
            />
        )
    }
    return (
        <span
            className="font-mono text-[11px] text-white/70"
            style={subclassColor ? { color: `${subclassColor}cc` } : undefined}
        >
            {cellValue}
        </span>
    )
}

const ORDINAL_SUFFIXES: Record<number, string> = {
    1: "1º", 2: "2º", 3: "3º", 4: "4º", 5: "5º",
    6: "6º", 7: "7º", 8: "8º", 9: "9º",
}

const SPELL_TEMPLATE_ORDER: SpellProgressionType[] = ["full", "half", "third", "warlock", "artificer"]

// ─── Confirmation Dialog ──────────────────────────────────────────────────────

function SpellTemplateConfirmDialog({
    templateType,
    onConfirm,
    onCancel,
}: {
    templateType: SpellProgressionType
    onConfirm: () => void
    onCancel: () => void
}) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            className="absolute inset-x-0 top-0 z-10 mx-4 p-4 rounded-xl bg-black/80 border border-amber-500/30 backdrop-blur-md shadow-2xl"
        >
            <div className="flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-3">
                    <div>
                        <p className="text-sm font-semibold text-white/90">Substituir progressão de magia?</p>
                        <p className="text-xs text-white/50 mt-0.5">
                            Aplicar o template <span className="text-amber-400">{SPELL_TEMPLATE_LABELS[templateType]}</span>{" "}
                            vai substituir os dados de conjuração já preenchidos.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={onConfirm}
                            className="flex-1 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-400 text-xs font-semibold transition-colors"
                        >
                            Substituir
                        </button>
                        <button
                            onClick={onCancel}
                            className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 text-xs font-medium transition-colors"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}

// ─── Editable Cell ────────────────────────────────────────────────────────────

function EditableCell({
    value,
    onChange,
    placeholder = "—",
    className,
    numeric = false,
}: {
    value: string | number | null | undefined
    onChange: (val: string) => void
    placeholder?: string
    className?: string
    numeric?: boolean
}) {
    return (
        <input
            type={numeric ? "number" : "text"}
            min={numeric ? 0 : undefined}
            max={numeric ? 99 : undefined}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={cn(
                "w-full bg-transparent text-center text-xs text-white/70 placeholder:text-white/20",
                "border-b border-white/10 focus:border-white/30 outline-none transition-colors py-0.5",
                "min-w-[28px]",
                className,
            )}
        />
    )
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ClassProgressionTableProps {
    /** Traits from the class (or subclass in form tabs) */
    traits: ClassTrait[]
    /** Whether this class/subclass has spellcasting enabled */
    spellcasting: boolean
    /** Stored progression data (spell slots, custom columns) */
    progressionData?: ClassProgressionData
    /** Subclass data for merged view (class-preview only) */
    subclassData?: SubclassRowData[]
    /** Editable mode shows inputs and shortcut buttons */
    isEditable?: boolean
    /** Called when progression data changes (edit mode only) */
    onProgressionDataChange?: (data: ClassProgressionData) => void
    /** Compact mode reduces cell padding and font size (for popovers) */
    compact?: boolean
    className?: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ClassProgressionTable({
    traits,
    spellcasting,
    progressionData,
    subclassData,
    isEditable = false,
    onProgressionDataChange,
    compact = false,
    className,
}: ClassProgressionTableProps) {
    const [isOpen, setIsOpen] = React.useState(false)
    const [pendingTemplate, setPendingTemplate] = React.useState<SpellProgressionType | null>(null)
    const [newColumnLabel, setNewColumnLabel] = React.useState("")
    const [isAddingColumn, setIsAddingColumn] = React.useState(false)

    // Use JSON.stringify(traits) as dependency so that nested field edits (e.g. changing
    // a trait's level via react-hook-form Controller) always trigger a recomputation.
    // Without this, RHF may return the same array reference with mutated items and
    // useMemo would incorrectly skip recomputing the rows.
    const traitsKey = JSON.stringify(traits)
    const { rows, activeSpellCircles, allCustomColumns } = React.useMemo(
        () => buildProgressionRows(traits, progressionData, subclassData, { mergeSubclassRows: !isEditable }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [traitsKey, progressionData, subclassData, isEditable],
    )

    // Show spell circles even if spellcasting is false but there are stored slots
    const shouldShowSpellColumns = spellcasting || activeSpellCircles.size > 0
    const showCantripColumn = shouldShowSpellColumns && (spellcasting || rows.some((r) => r.spellSlotData?.cantrips != null))
    const showPreparedColumn = shouldShowSpellColumns && (spellcasting || rows.some((r) => r.spellSlotData?.preparedSpells != null))

    // In edit mode we always show all 9 circles if spellcasting is on; otherwise only active ones
    const visibleCircles = React.useMemo(() => {
        if (isEditable && spellcasting) return [1, 2, 3, 4, 5, 6, 7, 8, 9]
        return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((c) => activeSpellCircles.has(c))
    }, [isEditable, spellcasting, activeSpellCircles])

    // ── Handlers ─────────────────────────────────────────────────────────────

    const updateData = (updater: (prev: ClassProgressionData) => ClassProgressionData) => {
        onProgressionDataChange?.(updater(progressionData ?? {}))
    }

    const handleApplyTemplate = (type: SpellProgressionType) => {
        if (hasSpellSlotData(progressionData)) {
            setPendingTemplate(type)
        } else {
            applyTemplate(type)
        }
    }

    const applyTemplate = (type: SpellProgressionType) => {
        updateData((prev) => ({ ...prev, spellSlots: applySpellTemplate(type) }))
        setPendingTemplate(null)
    }

    const handleClearSpellSlots = () => {
        updateData((prev) => ({ ...prev, spellSlots: undefined }))
    }

    const handleSpellSlotChange = (
        level: number,
        field: "cantrips" | "preparedSpells" | `slots.${number}`,
        value: string,
    ) => {
        const numVal = value === "" ? undefined : Math.max(0, parseInt(value, 10) || 0)
        updateData((prev) => {
            const prevSlots = { ...(prev.spellSlots ?? {}) }
            const prevLevel = { ...(prevSlots[level] ?? {}) }

            if (field === "cantrips") {
                if (numVal === undefined) delete prevLevel.cantrips
                else prevLevel.cantrips = numVal
            } else if (field === "preparedSpells") {
                if (numVal === undefined) delete prevLevel.preparedSpells
                else prevLevel.preparedSpells = numVal
            } else {
                const circle = parseInt(field.replace("slots.", ""), 10) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
                const prevSlotsByCircle = { ...(prevLevel.slots ?? {}) }
                if (numVal === undefined || numVal === 0) {
                    delete prevSlotsByCircle[circle]
                } else {
                    prevSlotsByCircle[circle] = numVal
                }
                prevLevel.slots = prevSlotsByCircle
            }

            // Remove empty level entries
            if (!prevLevel.cantrips && !prevLevel.preparedSpells && !Object.keys(prevLevel.slots ?? {}).length) {
                delete prevSlots[level]
            } else {
                prevSlots[level] = prevLevel
            }

            return { ...prev, spellSlots: prevSlots }
        })
    }

    const handleCustomValueChange = (colId: string, levelIndex: number, value: string) => {
        updateData((prev) => {
            const cols = [...(prev.customColumns ?? [])]
            const colIdx = cols.findIndex((c) => c.id === colId)
            if (colIdx === -1) return prev
            const newValues = [...cols[colIdx].values]
            newValues[levelIndex] = value === "" ? null : value
            cols[colIdx] = { ...cols[colIdx], values: newValues }
            return { ...prev, customColumns: cols }
        })
    }

    const handleAddColumn = () => {
        const label = newColumnLabel.trim()
        if (!label) return
        const id = `custom-${Date.now()}`
        updateData((prev) => ({
            ...prev,
            customColumns: [...(prev.customColumns ?? []), createEmptyCustomColumn(id, label)],
        }))
        setNewColumnLabel("")
        setIsAddingColumn(false)
    }

    const handleRemoveColumn = (colId: string) => {
        updateData((prev) => ({
            ...prev,
            customColumns: (prev.customColumns ?? []).filter((c) => c.id !== colId),
        }))
    }

    // ── Column header helpers ─────────────────────────────────────────────────

    const cellCls = compact
        ? "px-2 py-1.5 text-[10px]"
        : "px-3 py-2 text-xs"

    const headerCls = cn(
        "text-[9px] font-black uppercase tracking-[0.15em] text-white/30 text-center whitespace-nowrap",
        compact ? "px-2 py-1.5" : "px-3 py-2",
    )

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div
            className={cn(
                "rounded-xl overflow-hidden border border-white/10 bg-white/[0.02] transition-all",
                className,
            )}
        >
            {/* Toggle Header */}
            <button
                type="button"
                onClick={() => setIsOpen((p) => !p)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="p-1 px-1.5 rounded-lg border bg-white/5 border-white/10">
                        <Table2 className="h-3.5 w-3.5 text-white/40" />
                    </div>
                    <div className="text-left">
                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest block">
                            Progressão
                        </span>
                        <span className="text-xs font-semibold text-white/90">Tabela de Progressão</span>
                    </div>
                </div>
                <motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronRight className="h-4 w-4 text-white/20" />
                </motion.div>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                        className="border-t border-white/5 overflow-hidden"
                    >
                        {/* Spell Template Shortcuts (edit mode only) */}
                        {isEditable && shouldShowSpellColumns && (
                            <div className="relative px-4 pt-4 pb-2">
                                <AnimatePresence>
                                    {pendingTemplate && (
                                        <SpellTemplateConfirmDialog
                                            templateType={pendingTemplate}
                                            onConfirm={() => applyTemplate(pendingTemplate)}
                                            onCancel={() => setPendingTemplate(null)}
                                        />
                                    )}
                                </AnimatePresence>

                                <div className="flex items-center gap-2 flex-wrap">
                                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/30">
                                        <Wand2 className="h-3 w-3" />
                                        <span>Atalhos</span>
                                    </div>
                                    {SPELL_TEMPLATE_ORDER.map((type) => (
                                        <button
                                            key={type}
                                            type="button"
                                            onClick={() => handleApplyTemplate(type)}
                                            className={cn(
                                                "px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors",
                                                "bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400/80 hover:text-blue-400",
                                            )}
                                        >
                                            {SPELL_TEMPLATE_LABELS[type]}
                                        </button>
                                    ))}
                                    {hasSpellSlotData(progressionData) && (
                                        <button
                                            type="button"
                                            onClick={handleClearSpellSlots}
                                            className="px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400/70 hover:text-rose-400"
                                        >
                                            Limpar magias
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Add Custom Column (edit mode only) */}
                        {isEditable && (
                            <div className="px-4 pb-2 flex items-center gap-2">
                                <AnimatePresence mode="wait">
                                    {isAddingColumn ? (
                                        <motion.div
                                            key="adding"
                                            initial={{ opacity: 0, x: -8 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -8 }}
                                            className="flex items-center gap-2 flex-1"
                                        >
                                            <input
                                                autoFocus
                                                type="text"
                                                value={newColumnLabel}
                                                onChange={(e) => setNewColumnLabel(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") handleAddColumn()
                                                    if (e.key === "Escape") {
                                                        setIsAddingColumn(false)
                                                        setNewColumnLabel("")
                                                    }
                                                }}
                                                placeholder="Nome da coluna (ex: Ataque Furtivo)"
                                                className="flex-1 bg-white/5 border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-white/20 outline-none focus:border-white/30 transition-colors"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleAddColumn}
                                                disabled={!newColumnLabel.trim()}
                                                className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/20 text-emerald-400 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                Adicionar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsAddingColumn(false)
                                                    setNewColumnLabel("")
                                                }}
                                                className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-white/60 transition-colors"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </motion.div>
                                    ) : (
                                        <motion.button
                                            key="add-btn"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            type="button"
                                            onClick={() => setIsAddingColumn(true)}
                                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors bg-white/5 hover:bg-white/10 border border-white/10 text-white/40 hover:text-white/60"
                                        >
                                            <Plus className="h-3 w-3" />
                                            Coluna personalizada
                                        </motion.button>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}

                        {/* Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-max border-collapse">
                                <thead>
                                    <tr className="border-b border-white/5 bg-white/[0.03]">
                                        {/* Fixed columns */}
                                        <th className={cn(headerCls, "text-left w-12")}>Nível</th>
                                        <th className={cn(headerCls, "w-10")}>Bônus</th>
                                        <th className={cn(headerCls, "text-left min-w-[200px]")}>Características</th>

                                        {/* Spell columns */}
                                        {shouldShowSpellColumns && (
                                            <>
                                                {showCantripColumn && (
                                                    <th className={cn(headerCls, "w-16")}>
                                                        <div className="flex items-center justify-center gap-1">
                                                            <Zap className="h-2.5 w-2.5 text-amber-400/50" />
                                                            Truques
                                                        </div>
                                                    </th>
                                                )}
                                                {showPreparedColumn && (
                                                    <th className={cn(headerCls, "w-16")}>Preparadas</th>
                                                )}
                                                {visibleCircles.map((circle) => (
                                                    <th key={circle} className={cn(headerCls, "w-10 text-blue-400/50")}>
                                                        {ORDINAL_SUFFIXES[circle]}
                                                    </th>
                                                ))}
                                            </>
                                        )}

                                        {/* Custom columns */}
                                        {allCustomColumns.map((col) => (
                                            <th
                                                key={col.id}
                                                className={cn(headerCls, "min-w-[80px]")}
                                                style={col.subclassColor ? { color: `${col.subclassColor}80` } : undefined}
                                            >
                                                <div className="flex items-center justify-center gap-1">
                                                    <span>{col.label}</span>
                                                    {isEditable && !col.subclassColor && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveColumn(col.id)}
                                                            className="ml-1 text-rose-400/40 hover:text-rose-400 transition-colors"
                                                            title="Remover coluna"
                                                        >
                                                            <X className="h-2.5 w-2.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.03]">
                                    <AnimatePresence initial={false}>
                                        {rows.map((row, rowIdx) => {
                                            const isSubclassRow = row.source === "subclass"
                                            const hasMergedSubclasses = (row.mergedSubclasses?.length ?? 0) > 0
                                            const primaryColor = row.mergedSubclasses?.[0]?.color ?? row.subclassColor
                                            const rowKey = `${row.level}-${row.source}-${row.subclassName ?? ""}`

                                            return (
                                                <motion.tr
                                                    key={rowKey}
                                                    layout
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    exit={{ opacity: 0 }}
                                                    transition={{ duration: 0.15, delay: Math.min(rowIdx * 0.005, 0.1) }}
                                                    className={cn(
                                                        "hover:bg-white/[0.025] transition-colors duration-150 group",
                                                        (isSubclassRow || hasMergedSubclasses) && "border-l-2",
                                                    )}
                                                    style={
                                                        (isSubclassRow || hasMergedSubclasses) && primaryColor
                                                            ? {
                                                                  backgroundColor: `${primaryColor}08`,
                                                                  borderLeftColor: `${primaryColor}40`,
                                                              }
                                                            : undefined
                                                    }
                                                >
                                                    {/* Level */}
                                                    <td className={cn(cellCls, "text-left")}>
                                                        <div className="flex items-center gap-1.5">
                                                            {isSubclassRow && row.subclassColor ? (
                                                                <div className="flex items-center gap-1">
                                                                    <div
                                                                        className="w-1 h-1 rounded-full shrink-0"
                                                                        style={{ backgroundColor: row.subclassColor }}
                                                                    />
                                                                    <span
                                                                        className="font-mono text-[10px] font-bold"
                                                                        style={{ color: `${row.subclassColor}cc` }}
                                                                    >
                                                                        {row.level}
                                                                    </span>
                                                                </div>
                                                            ) : hasMergedSubclasses ? (
                                                                <div className="flex items-center gap-1">
                                                                    <span className="font-mono text-[11px] font-bold text-white/60 px-1.5 py-0.5 rounded bg-white/5">
                                                                        {row.level}
                                                                    </span>
                                                                    <div className="flex items-center gap-0.5">
                                                                        {row.mergedSubclasses!.map((sub) => (
                                                                            <div
                                                                                key={sub.name}
                                                                                className="w-1 h-1 rounded-full shrink-0"
                                                                                style={{ backgroundColor: sub.color }}
                                                                                title={sub.name}
                                                                            />
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <span className="font-mono text-[11px] font-bold text-white/60 px-1.5 py-0.5 rounded bg-white/5">
                                                                    {row.level}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* Proficiency Bonus */}
                                                    <td className={cn(cellCls, "text-center")}>
                                                        {!isSubclassRow ? (
                                                            <span className={cn(
                                                                "font-mono text-[11px] font-bold",
                                                                rarityToTailwind[proficiencyBonusColors[row.proficiencyBonus] ?? "common"].text,
                                                            )}>
                                                                +{row.proficiencyBonus}
                                                            </span>
                                                        ) : (
                                                            <span className="text-white/10">—</span>
                                                        )}
                                                    </td>

                                                    {/* Features */}
                                                    <td className={cn(cellCls, "text-left min-w-[200px]")}>
                                                        {row.traits.length > 0 ? (
                                                            <div className="flex flex-wrap gap-1">
                                                                {row.traits.map((trait, tIdx) => (
                                                                    <span
                                                                        key={trait._id ?? `trait-${row.level}-${tIdx}`}
                                                                        className="inline-block max-w-[400px]"
                                                                    >
                                                                        <MentionContent
                                                                            html={trait.description}
                                                                            mode="inline"
                                                                            className={cn(
                                                                                "[&_p]:text-xs [&_p]:leading-snug [&_p]:text-white/70",
                                                                                "[&_p]:line-clamp-1",
                                                                            )}
                                                                        />
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-white/10 text-[10px]">—</span>
                                                        )}
                                                    </td>

                                                    {/* Spell Columns */}
                                                    {shouldShowSpellColumns && (
                                                        <>
                                                            {/* Cantrips */}
                                                            {showCantripColumn && (
                                                                <td className={cn(cellCls, "text-center")}>
                                                                    {isEditable && !isSubclassRow ? (
                                                                        <EditableCell
                                                                            value={row.spellSlotData?.cantrips}
                                                                            onChange={(v) =>
                                                                                handleSpellSlotChange(row.level, "cantrips", v)
                                                                            }
                                                                            numeric
                                                                        />
                                                                    ) : row.spellSlotData?.cantrips != null ? (
                                                                        <span className="font-mono text-[11px] text-amber-400/80">
                                                                            {row.spellSlotData.cantrips}
                                                                        </span>
                                                                    ) : null}
                                                                </td>
                                                            )}

                                                            {/* Prepared Spells */}
                                                            {showPreparedColumn && (
                                                                <td className={cn(cellCls, "text-center")}>
                                                                    {isEditable && !isSubclassRow ? (
                                                                        <EditableCell
                                                                            value={row.spellSlotData?.preparedSpells}
                                                                            onChange={(v) =>
                                                                                handleSpellSlotChange(
                                                                                    row.level,
                                                                                    "preparedSpells",
                                                                                    v,
                                                                                )
                                                                            }
                                                                            numeric
                                                                        />
                                                                    ) : row.spellSlotData?.preparedSpells != null ? (
                                                                        <span className="font-mono text-[11px] text-blue-300/70">
                                                                            {row.spellSlotData.preparedSpells}
                                                                        </span>
                                                                    ) : null}
                                                                </td>
                                                            )}

                                                            {/* Spell Circles */}
                                                            {visibleCircles.map((circle) => {
                                                                const slotCount =
                                                                    row.spellSlotData?.slots?.[
                                                                        circle as keyof typeof row.spellSlotData.slots
                                                                    ]
                                                                return (
                                                                    <td
                                                                        key={circle}
                                                                        className={cn(cellCls, "text-center w-10")}
                                                                    >
                                                                        {isEditable && !isSubclassRow ? (
                                                                            <EditableCell
                                                                                value={slotCount}
                                                                                onChange={(v) =>
                                                                                    handleSpellSlotChange(
                                                                                        row.level,
                                                                                        `slots.${circle}`,
                                                                                        v,
                                                                                    )
                                                                                }
                                                                                numeric
                                                                            />
                                                                        ) : slotCount != null ? (
                                                                            <span className="font-mono text-[11px] text-blue-400/80">
                                                                                {slotCount}
                                                                            </span>
                                                                        ) : null}
                                                                    </td>
                                                                )
                                                            })}
                                                        </>
                                                    )}

                                                    {/* Custom Columns */}
                                                    {allCustomColumns.map((col) => {
                                                        const cellValue = row.customValues?.[col.id] ?? null
                                                        const isSubclassOwnedCol = !!col.subclassColor
                                                        const canEdit =
                                                            isEditable &&
                                                            !isSubclassOwnedCol &&
                                                            row.source === "class"

                                                        return (
                                                            <td
                                                                key={col.id}
                                                                className={cn(cellCls, "text-center min-w-[80px]")}
                                                            >
                                                                {canEdit ? (
                                                                    <EditableCell
                                                                        value={cellValue}
                                                                        onChange={(v) =>
                                                                            handleCustomValueChange(
                                                                                col.id,
                                                                                row.level - 1,
                                                                                v,
                                                                            )
                                                                        }
                                                                        placeholder="—"
                                                                    />
                                                                ) : cellValue != null ? (
                                                                    renderCustomCellValue(cellValue, col.subclassColor)
                                                                ) : null}
                                                            </td>
                                                        )
                                                    })}
                                                </motion.tr>
                                            )
                                        })}
                                    </AnimatePresence>
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
