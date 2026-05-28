"use client"

import * as React from "react"
import { AlertTriangle, CheckCircle2, Loader2, Search } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/core/utils"
import { Tabs, TabsList, TabsTrigger } from "@/core/ui/tabs"
import { GlassModal, GlassModalContent, GlassModalDescription, GlassModalFooter, GlassModalHeader, GlassModalTitle } from "@/components/ui/glass-modal"
import { GlassSelector } from "@/components/ui/glass-selector"
import { GlassInput } from "@/components/ui/glass-input"
import { CompactRichInput } from "@/features/character-sheets/components/compact-rich-input"
import { SheetInput } from "@/features/character-sheets/components/sheet-input"
import { AttributeBlock } from "@/features/character-sheets/components/attribute-block"
import { RacePreview } from "@/features/races/components/race-preview"
import { BackgroundPreview } from "@/features/backgrounds/components/background-preview"
import { ClassPreview } from "@/features/classes/components/class-preview"
import { DiceRollerPanel } from "@/features/dice-roller/components/dice-roller-panel"
import { attributeColors } from "@/lib/config/colors"
import { useRaces } from "@/features/races/api/races-queries"
import { useBackgrounds } from "@/features/backgrounds/api/backgrounds-queries"
import { useClasses } from "@/features/classes/api/classes-queries"
import { useCreateAssistedSheet } from "@/features/character-sheets/api/character-sheets-queries"
import { useCharacterCalculations } from "@/features/character-sheets/hooks/use-character-calculations"
import { SKILL_ATTRIBUTE_MAP } from "@/features/character-sheets/utils/dnd-calculations"
import {
    ASSISTED_ATTRIBUTE_KEYS,
    ASSISTED_SKILLS,
    POINT_BUY_COSTS,
    STANDARD_ARRAY_VALUES,
    applyBackgroundToSheet,
    applyClassToSheet,
    applyRaceToSheet,
    buildAssistedSheetPayload,
    calculateDropLowestScore,
    calculateFinalDiceScore,
    createEmptySkills,
    createTemporaryAssistedSheet,
    getPointBuyCost,
    isValidPointBuy,
    type AssistedAttributeKey,
} from "@/features/character-sheets/utils/assisted-creation"
import type { Background } from "@/features/backgrounds/types/backgrounds.types"
import type { CharacterClass, SkillType } from "@/features/classes/types/classes.types"
import type { Race } from "@/features/races/types/races.types"
import type { DiceRollResponse } from "@/features/dice-roller/types"
import type { AttributeType, CharacterSheet, PatchSheetBody, SkillName } from "@/features/character-sheets/types/character-sheet.types"

type AssistantTab = "info" | "race" | "background" | "class" | "attributes"
type AttributeMethod = "point-buy" | "standard-array" | "dice-rolling"

interface AssistedSheetCreationModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onCreated?: (sheet: CharacterSheet) => void
}

const TAB_LABELS: Record<AssistantTab, string> = {
    info: "Informações",
    race: "Raça",
    background: "Origem",
    class: "Classe",
    attributes: "Atributos",
}

const ATTRIBUTE_LABELS: Record<AssistedAttributeKey, string> = {
    strength: "Força",
    dexterity: "Destreza",
    constitution: "Constituição",
    intelligence: "Inteligência",
    wisdom: "Sabedoria",
    charisma: "Carisma",
}

const METHOD_OPTIONS = [
    { value: "point-buy", label: "Compra de pontos" },
    { value: "standard-array", label: "Valores padrão" },
    { value: "dice-rolling", label: "Rolagem de dados" },
] as const

const ATTRIBUTE_COLOR_KEY: Record<AttributeType, keyof typeof attributeColors> = {
    strength: "Força",
    dexterity: "Destreza",
    constitution: "Constituição",
    intelligence: "Inteligência",
    wisdom: "Sabedoria",
    charisma: "Carisma",
}

function normalizeSkill(skill: SkillType): SkillName {
    return skill as SkillName
}

function buildSkills(background: Background | null, classSkills: SkillType[]) {
    const skills = createEmptySkills()
    for (const skill of background?.skillProficiencies ?? []) {
        skills[normalizeSkill(skill)] = { proficient: true, expertise: false }
    }
    for (const skill of classSkills) {
        skills[normalizeSkill(skill)] = { proficient: true, expertise: false }
    }
    return skills
}

function buildTabIcon(isComplete: boolean) {
    return isComplete
        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
        : <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />
}

function getAttributeColor(attr: AttributeType) {
    return attributeColors[ATTRIBUTE_COLOR_KEY[attr]]
}

function CatalogSearch<TItem extends { _id: string; name: string }>({
    label,
    search,
    onSearchChange,
    items,
    selectedId,
    isLoading,
    onSelect,
}: {
    label: string
    search: string
    onSearchChange: (value: string) => void
    items: TItem[]
    selectedId: string | null
    isLoading: boolean
    onSelect: (item: TItem) => void
}) {
    return (
        <div className="space-y-3">
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <GlassInput
                    value={search}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder={`Buscar ${label.toLowerCase()}`}
                    className="pl-9"
                />
            </div>

            <div className="grid max-h-52 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {isLoading && <p className="text-sm text-white/45">Carregando...</p>}
                {!isLoading && items.length === 0 && <p className="text-sm text-white/45">Nenhum resultado encontrado.</p>}
                {items.map((item) => {
                    const selected = selectedId === item._id
                    return (
                        <button
                            key={item._id}
                            type="button"
                            onClick={() => onSelect(item)}
                            className={cn(
                                "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                                selected
                                    ? "border-violet-300/40 bg-violet-500/15 text-white"
                                    : "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                            )}
                        >
                            {item.name}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

function PointBuyControls({
    scores,
    onChange,
}: {
    scores: Record<AttributeType, number>
    onChange: (attr: AttributeType, value: number) => void
}) {
    const spent = getPointBuyCost(scores)
    const remaining = Math.max(0, 27 - spent)

    return (
        <div className="space-y-3">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/70">
                Pontos disponíveis: <span className="font-bold text-white">{remaining}</span>/27
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {ASSISTED_ATTRIBUTE_KEYS.map((attr) => {
                    const value = scores[attr]
                    const colors = getAttributeColor(attr)
                    const decrementDisabled = value <= 8
                    const nextCost = POINT_BUY_COSTS[value + 1]
                    const incrementDisabled = value >= 15 || nextCost == null || spent - POINT_BUY_COSTS[value] + nextCost > 27

                    return (
                        <div key={attr} className={cn("rounded-lg border p-3", colors.border, colors.bgAlpha)}>
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <span className={cn("text-[10px] font-black uppercase tracking-[0.2em]", colors.text)}>{ATTRIBUTE_LABELS[attr]}</span>
                                <span className="text-[10px] text-white/45">custo {POINT_BUY_COSTS[value]}</span>
                            </div>
                            <div className="grid grid-cols-[40px_minmax(0,1fr)_40px] items-center gap-2">
                                <button
                                    type="button"
                                    disabled={decrementDisabled}
                                    onClick={() => onChange(attr, value - 1)}
                                    className="h-10 rounded-lg border border-white/10 bg-white/[0.04] text-lg font-bold text-white/70 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
                                >
                                    -
                                </button>
                                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-center text-2xl font-black text-white">
                                    {value}
                                </div>
                                <button
                                    type="button"
                                    disabled={incrementDisabled}
                                    onClick={() => onChange(attr, value + 1)}
                                    className="h-10 rounded-lg border border-white/10 bg-white/[0.04] text-lg font-bold text-white/70 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
                                >
                                    +
                                </button>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

export function AssistedSheetCreationModal({ open, onOpenChange, onCreated }: AssistedSheetCreationModalProps) {
    const [activeTab, setActiveTab] = React.useState<AssistantTab>("info")
    const [sheet, setSheet] = React.useState(() => createTemporaryAssistedSheet())
    const [selectedRace, setSelectedRace] = React.useState<Race | null>(null)
    const [selectedBackground, setSelectedBackground] = React.useState<Background | null>(null)
    const [selectedClass, setSelectedClass] = React.useState<CharacterClass | null>(null)
    const [selectedClassSkills, setSelectedClassSkills] = React.useState<SkillType[]>([])
    const [raceSearch, setRaceSearch] = React.useState("")
    const [backgroundSearch, setBackgroundSearch] = React.useState("")
    const [classSearch, setClassSearch] = React.useState("")
    const [attributeMethod, setAttributeMethod] = React.useState<AttributeMethod>("point-buy")
    const [attributesTouched, setAttributesTouched] = React.useState(false)
    const [standardAssignments, setStandardAssignments] = React.useState<Partial<Record<AttributeType, number>>>({})
    const [diceScores, setDiceScores] = React.useState<number[]>([])
    const [diceAssignments, setDiceAssignments] = React.useState<Partial<Record<AttributeType, number>>>({})
    const [diceError, setDiceError] = React.useState<string | null>(null)
    const createAssistedSheet = useCreateAssistedSheet()

    const { data: racesData, isLoading: isLoadingRaces } = useRaces({ search: raceSearch, status: "active" }, 1, 20, { enabled: open })
    const { data: backgroundsData, isLoading: isLoadingBackgrounds } = useBackgrounds({ search: backgroundSearch, status: "active" }, 1, 20, { enabled: open })
    const { data: classesData, isLoading: isLoadingClasses } = useClasses({ search: classSearch, status: "active" }, 1, 20, { enabled: open })

    const currentSheet = sheet as CharacterSheet
    const calc = useCharacterCalculations(currentSheet)

    const form = React.useMemo(() => ({
        watch: ((field?: keyof PatchSheetBody) => {
            if (!field) return sheet as PatchSheetBody
            return sheet[field as keyof typeof sheet]
        }) as {
            (): PatchSheetBody
            <TFieldName extends keyof PatchSheetBody>(field: TFieldName): PatchSheetBody[TFieldName]
        },
        setFieldLocally: (field: keyof PatchSheetBody, value: unknown) => {
            setSheet((current) => ({ ...current, [field]: value }))
        },
        patchField: (field: keyof PatchSheetBody, value: unknown) => {
            setSheet((current) => ({ ...current, [field]: value }))
        },
        patchFields: (values: Partial<PatchSheetBody>) => {
            setSheet((current) => ({ ...current, ...values }))
        },
    }), [sheet])

    const originSkillSet = React.useMemo(
        () => new Set((selectedBackground?.skillProficiencies ?? []).map(String)),
        [selectedBackground]
    )
    const availableClassSkills = selectedClass?.availableSkills ?? []
    const requiredClassSkillCount = selectedClass?.skillCount ?? 0
    const pointBuyScores = React.useMemo(
        () => Object.fromEntries(ASSISTED_ATTRIBUTE_KEYS.map((attr) => [attr, sheet[attr]])) as Record<AttributeType, number>,
        [sheet]
    )

    const standardComplete = ASSISTED_ATTRIBUTE_KEYS.every((attr) => standardAssignments[attr] !== undefined)
    const diceComplete = ASSISTED_ATTRIBUTE_KEYS.every((attr) => diceAssignments[attr] !== undefined)
    const attributesComplete = attributeMethod === "point-buy"
        ? attributesTouched && isValidPointBuy(pointBuyScores)
        : attributeMethod === "standard-array"
            ? standardComplete
            : diceComplete

    const completion: Record<AssistantTab, boolean> = {
        info: sheet.name.trim().length > 0,
        race: Boolean(selectedRace),
        background: Boolean(selectedBackground),
        class: Boolean(selectedClass) && selectedClassSkills.length === requiredClassSkillCount,
        attributes: attributesComplete,
    }
    const canSave = Object.values(completion).every(Boolean)

    const setAttributesTo = React.useCallback((values: Partial<Record<AttributeType, number>>, fallback = 10) => {
        setSheet((current) => {
            const next = { ...current }
            for (const attr of ASSISTED_ATTRIBUTE_KEYS) {
                next[attr] = values[attr] ?? fallback
            }
            return next
        })
    }, [])

    const resetAttributeMethod = React.useCallback((method: AttributeMethod) => {
        setAttributeMethod(method)
        setAttributesTouched(false)
        setStandardAssignments({})
        setDiceScores([])
        setDiceAssignments({})
        setDiceError(null)

        if (method === "point-buy") {
            const scores = Object.fromEntries(ASSISTED_ATTRIBUTE_KEYS.map((attr) => [attr, 8])) as Record<AttributeType, number>
            setAttributesTo(scores, 8)
            return
        }

        setAttributesTo({}, 10)
    }, [setAttributesTo])

    React.useEffect(() => {
        if (!open) return
        setActiveTab("info")
        setSheet(createTemporaryAssistedSheet())
        setSelectedRace(null)
        setSelectedBackground(null)
        setSelectedClass(null)
        setSelectedClassSkills([])
        setRaceSearch("")
        setBackgroundSearch("")
        setClassSearch("")
        resetAttributeMethod("point-buy")
    }, [open, resetAttributeMethod])

    const patchAttribute = React.useCallback((attr: AttributeType, value: number) => {
        setAttributesTouched(true)
        setSheet((current) => ({ ...current, [attr]: value }))
    }, [])

    const handleRaceSelect = (race: Race) => {
        setSelectedRace(race)
        setSheet((current) => applyRaceToSheet(current, race))
    }

    const handleBackgroundSelect = (background: Background) => {
        setSelectedBackground(background)
        const nextClassSkills = selectedClassSkills.filter((skill) => !background.skillProficiencies?.includes(skill))
        setSelectedClassSkills(nextClassSkills)
        setSheet((current) => {
            const withBackground = applyBackgroundToSheet({ ...current, skills: createEmptySkills() }, background)
            return selectedClass ? applyClassToSheet(withBackground, selectedClass, nextClassSkills) : withBackground
        })
    }

    const handleClassSelect = (characterClass: CharacterClass) => {
        setSelectedClass(characterClass)
        setSelectedClassSkills([])
        setSheet((current) => applyClassToSheet({ ...current, skills: buildSkills(selectedBackground, []) }, characterClass, []))
    }

    const handleClassSkillChange = (value: string | number | Array<string | number> | undefined) => {
        if (!selectedClass) return
        const next = (Array.isArray(value) ? value : [value])
            .map(String)
            .filter((skill): skill is SkillType => availableClassSkills.includes(skill as SkillType) && !originSkillSet.has(skill))
            .slice(0, requiredClassSkillCount)
        setSelectedClassSkills(next)
        setSheet((current) => applyClassToSheet({ ...current, skills: buildSkills(selectedBackground, next) }, selectedClass, next))
    }

    const handleStandardAssignment = (attr: AttributeType, value: string | number | Array<string | number> | undefined) => {
        if (value === undefined) {
            setStandardAssignments((current) => {
                const next = { ...current }
                delete next[attr]
                return next
            })
            patchAttribute(attr, 10)
            return
        }

        const parsed = Number(Array.isArray(value) ? value[0] : value)
        if (!Number.isFinite(parsed)) return
        setStandardAssignments((current) => {
            const next = Object.fromEntries(
                Object.entries(current).filter(([key, existing]) => key === attr || existing !== parsed)
            ) as Partial<Record<AttributeType, number>>
            next[attr] = parsed
            return next
        })
        patchAttribute(attr, parsed)
    }

    const handleDiceAssignment = (attr: AttributeType, value: string | number | Array<string | number> | undefined) => {
        if (value === undefined) {
            setDiceAssignments((current) => {
                const next = { ...current }
                delete next[attr]
                return next
            })
            patchAttribute(attr, 10)
            return
        }

        const parsedIndex = Number(Array.isArray(value) ? value[0] : value)
        const parsedValue = diceScores[parsedIndex]
        if (!Number.isInteger(parsedIndex) || parsedValue == null) return
        setDiceAssignments((current) => {
            const next = Object.fromEntries(
                Object.entries(current).filter(([key, existing]) => key === attr || existing !== parsedIndex)
            ) as Partial<Record<AttributeType, number>>
            next[attr] = parsedIndex
            return next
        })
        patchAttribute(attr, parsedValue)
    }

    const handleDiceRollResolved = (result: DiceRollResponse) => {
        const d6Term = result.terms.find((term) => term.dice === "d6" && term.quantity === 4)
        const score = d6Term ? calculateDropLowestScore(d6Term.results) : null
        if (score == null) return

        setDiceScores((current) => {
            if (current.length >= 6) return current
            const nextFirstFive = current.length < 5 ? [...current, score] : current
            if (nextFirstFive.length < 5) {
                setDiceError(null)
                return nextFirstFive
            }

            const finalScore = calculateFinalDiceScore(nextFirstFive)
            if (finalScore == null) {
                setDiceError("A sexta pontuação ficou fora do intervalo 3-18. Reinicie as rolagens desta etapa.")
                return nextFirstFive
            }

            setDiceError(null)
            return [...nextFirstFive, finalScore]
        })
    }

    const resetDiceScores = () => {
        setDiceScores([])
        setDiceAssignments({})
        setDiceError(null)
    }

    const handleSave = async () => {
        if (!canSave) return
        try {
            const created = await createAssistedSheet.mutateAsync({
                sheet: buildAssistedSheetPayload(sheet) as PatchSheetBody & { name: string },
            })
            toast.success("Ficha criada.")
            onOpenChange(false)
            onCreated?.(created)
        } catch {
            toast.error("Não foi possível criar a ficha.")
        }
    }

    const renderAttributeBlocks = () => (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {ASSISTED_ATTRIBUTE_KEYS.map((attr) => (
                <AttributeBlock
                    key={attr}
                    attributeKey={attr}
                    value={sheet[attr]}
                    onValueChange={(value) => patchAttribute(attr, value)}
                    modifier={calc.attrMods[attr].value}
                    modifierFormula={calc.attrMods[attr].formula}
                    modifierParts={calc.attrMods[attr].parts}
                    modifierResult={calc.attrMods[attr].result}
                    savingThrow={{
                        proficient: !!sheet.savingThrows[attr],
                        value: calc.savingThrows[attr].value,
                        formula: calc.savingThrows[attr].formula,
                        parts: calc.savingThrows[attr].parts,
                        result: calc.savingThrows[attr].result,
                    }}
                    onSavingThrowToggle={() => undefined}
                    skills={ASSISTED_SKILLS
                        .filter((skill) => SKILL_ATTRIBUTE_MAP[skill] === attr)
                        .map((skill) => ({
                            name: skill,
                            proficient: !!sheet.skills[skill]?.proficient,
                            expertise: !!sheet.skills[skill]?.expertise,
                            value: calc.skills[skill]?.value ?? 0,
                            formula: calc.skills[skill]?.formula ?? "",
                            parts: calc.skills[skill]?.parts,
                            result: calc.skills[skill]?.result,
                        }))}
                    onSkillChange={() => undefined}
                    isReadOnly
                />
            ))}
        </div>
    )

    const usedStandardValues = new Set(Object.values(standardAssignments))
    const usedDiceIndexes = new Set(Object.values(diceAssignments))

    return (
        <GlassModal open={open} onOpenChange={onOpenChange}>
            <GlassModalContent size="full" className="max-w-[96vw] lg:max-w-6xl" bodyClassName="p-4 sm:p-6">
                <GlassModalHeader className="pr-8">
                    <GlassModalTitle>Assistente de criação</GlassModalTitle>
                    <GlassModalDescription>Monte a ficha em qualquer ordem. Nada será salvo até o final.</GlassModalDescription>
                </GlassModalHeader>

                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as AssistantTab)} className="mt-5">
                    <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-white/5">
                        {(Object.keys(TAB_LABELS) as AssistantTab[]).map((tab) => (
                            <TabsTrigger key={tab} value={tab} className="gap-1.5">
                                {buildTabIcon(completion[tab])}
                                {TAB_LABELS[tab]}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    <div className="mt-4 min-h-[560px] space-y-4">
                        <section className={cn(activeTab === "info" ? "block" : "hidden")} aria-hidden={activeTab !== "info"}>
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                                <SheetInput
                                    label="Nome do Personagem"
                                    placeholder="NOME DO PERSONAGEM"
                                    value={sheet.name}
                                    onChangeValue={(value) => form.patchField("name", value)}
                                    className="lg:col-span-1"
                                />
                                <CompactRichInput
                                    variant="full"
                                    label="Aparência"
                                    value={sheet.appearance}
                                    onChange={(value) => form.setFieldLocally("appearance", value)}
                                    onBlur={(value) => form.patchField("appearance", value)}
                                    placeholder="Descrição física, roupas, marcas, postura..."
                                    minRows={8}
                                    excludeId={sheet._id}
                                />
                                <CompactRichInput
                                    variant="full"
                                    label="História"
                                    value={sheet.history}
                                    onChange={(value) => form.setFieldLocally("history", value)}
                                    onBlur={(value) => form.patchField("history", value)}
                                    placeholder="Origem, jornada, vínculos, eventos marcantes..."
                                    minRows={8}
                                    excludeId={sheet._id}
                                />
                            </div>
                        </section>

                        <section className={cn(activeTab === "race" ? "block" : "hidden", "space-y-4")} aria-hidden={activeTab !== "race"}>
                            <CompactRichInput
                                label="Raça"
                                value={sheet.race}
                                onChange={(value) => form.setFieldLocally("race", value)}
                                onBlur={(value) => form.patchField("race", value)}
                                placeholder="@Elfo"
                                specificEntityMention="Raça"
                                openMentionsOnFocus
                                excludeId={sheet._id}
                            />
                            <CatalogSearch
                                label="Raça"
                                search={raceSearch}
                                onSearchChange={setRaceSearch}
                                items={racesData?.items ?? []}
                                selectedId={selectedRace?._id ?? null}
                                isLoading={isLoadingRaces}
                                onSelect={handleRaceSelect}
                            />
                            {selectedRace && <RacePreview race={selectedRace} showStatus={false} />}
                        </section>

                        <section className={cn(activeTab === "background" ? "block" : "hidden", "space-y-4")} aria-hidden={activeTab !== "background"}>
                            <CompactRichInput
                                label="Origem"
                                value={sheet.origin}
                                onChange={(value) => form.setFieldLocally("origin", value)}
                                onBlur={(value) => form.patchField("origin", value)}
                                placeholder="@Sábio"
                                specificEntityMention="Origem"
                                openMentionsOnFocus
                                excludeId={sheet._id}
                            />
                            <CatalogSearch
                                label="Origem"
                                search={backgroundSearch}
                                onSearchChange={setBackgroundSearch}
                                items={backgroundsData?.items ?? []}
                                selectedId={selectedBackground?._id ?? null}
                                isLoading={isLoadingBackgrounds}
                                onSelect={handleBackgroundSelect}
                            />
                            {selectedBackground && <BackgroundPreview background={selectedBackground} showStatus={false} />}
                        </section>

                        <section className={cn(activeTab === "class" ? "block" : "hidden", "space-y-4")} aria-hidden={activeTab !== "class"}>
                            <CompactRichInput
                                label="Classe"
                                value={sheet.class}
                                onChange={(value) => form.setFieldLocally("class", value)}
                                onBlur={(value) => form.patchField("class", value)}
                                placeholder="@Mago"
                                specificEntityMention="Classe"
                                openMentionsOnFocus
                                excludeId={sheet._id}
                            />
                            <CatalogSearch
                                label="Classe"
                                search={classSearch}
                                onSearchChange={setClassSearch}
                                items={classesData?.classes ?? []}
                                selectedId={selectedClass?._id ?? null}
                                isLoading={isLoadingClasses}
                                onSelect={handleClassSelect}
                            />
                            {selectedClass && (
                                <div className="space-y-4">
                                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                        <div className="mb-2 flex items-center justify-between gap-3">
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Perícias de classe</span>
                                            <span className="text-xs text-white/45">{selectedClassSkills.length}/{requiredClassSkillCount}</span>
                                        </div>
                                        <GlassSelector
                                            mode="multi"
                                            layout="grid"
                                            cols={3}
                                            smCols={2}
                                            value={selectedClassSkills}
                                            onChange={handleClassSkillChange}
                                            options={availableClassSkills.map((skill) => ({
                                                value: skill,
                                                label: originSkillSet.has(skill) ? `${skill} (origem)` : skill,
                                                activeColor: getAttributeColor(SKILL_ATTRIBUTE_MAP[normalizeSkill(skill)]).hex,
                                                textColor: getAttributeColor(SKILL_ATTRIBUTE_MAP[normalizeSkill(skill)]).hex,
                                                disabled: originSkillSet.has(skill) || (!selectedClassSkills.includes(skill) && selectedClassSkills.length >= requiredClassSkillCount),
                                            }))}
                                            layoutId="assisted-class-skills"
                                        />
                                    </div>
                                    <ClassPreview characterClass={selectedClass} showStatus={false} />
                                </div>
                            )}
                        </section>

                        <section className={cn(activeTab === "attributes" ? "block" : "hidden", "space-y-4")} aria-hidden={activeTab !== "attributes"}>
                            <GlassSelector
                                value={attributeMethod}
                                onChange={(value) => {
                                    if (value) resetAttributeMethod(value as AttributeMethod)
                                }}
                                options={METHOD_OPTIONS.map((option) => ({ ...option }))}
                                fullWidth
                                layoutId="assisted-attribute-method"
                            />

                            {attributeMethod === "point-buy" && (
                                <div className="space-y-3">
                                    <PointBuyControls scores={pointBuyScores} onChange={patchAttribute} />
                                    {renderAttributeBlocks()}
                                </div>
                            )}

                            {attributeMethod === "standard-array" && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                        {ASSISTED_ATTRIBUTE_KEYS.map((attr) => {
                                            const colors = getAttributeColor(attr)
                                            const options = STANDARD_ARRAY_VALUES
                                                .filter((value) => !usedStandardValues.has(value) || standardAssignments[attr] === value)
                                                .map((value) => ({ value, label: String(value), activeColor: colors.hex, textColor: colors.hex }))
                                            return (
                                                <div key={attr} className={cn("rounded-lg border p-3", colors.border, colors.bgAlpha)}>
                                                    <p className={cn("mb-2 text-[10px] font-black uppercase tracking-[0.2em]", colors.text)}>{ATTRIBUTE_LABELS[attr]}</p>
                                                    <GlassSelector
                                                        value={standardAssignments[attr]}
                                                        onChange={(value) => handleStandardAssignment(attr, value)}
                                                        options={options}
                                                        layout="grid"
                                                        cols={3}
                                                        fullWidth
                                                        allowDeselect
                                                        layoutId={`standard-${attr}`}
                                                    />
                                                </div>
                                            )
                                        })}
                                    </div>
                                    {renderAttributeBlocks()}
                                </div>
                            )}

                            {attributeMethod === "dice-rolling" && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                                        <DiceRollerPanel
                                            preset={{ label: "Atributo", terms: [{ dice: "d6", quantity: 4 }], modifier: 0, mode: "normal", source: "manual" }}
                                            onRollResolved={handleDiceRollResolved}
                                            hideConfigurationControls
                                        />
                                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                            <div className="mb-3 flex items-center justify-between">
                                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Pontuações</span>
                                                <button type="button" onClick={resetDiceScores} className="text-xs text-white/45 hover:text-white">Reiniciar</button>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {diceScores.map((score, index) => (
                                                    <span key={`${score}-${index}`} className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-sm font-bold text-white/80">
                                                        {score}
                                                    </span>
                                                ))}
                                            </div>
                                            {diceScores.length < 6 && <p className="mt-3 text-sm text-white/45">Faça {5 - Math.min(5, diceScores.length)} rolagem(ns) 4d6. A sexta pontuação será calculada automaticamente.</p>}
                                            {diceError && <p className="mt-3 text-sm text-amber-300">{diceError}</p>}
                                        </div>
                                    </div>

                                    {diceScores.length === 6 && (
                                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                            {ASSISTED_ATTRIBUTE_KEYS.map((attr) => {
                                                const colors = getAttributeColor(attr)
                                                const options = diceScores
                                                    .map((score, index) => ({ value: index, label: String(score), activeColor: colors.hex, textColor: colors.hex }))
                                                    .filter((option) => !usedDiceIndexes.has(option.value) || diceAssignments[attr] === option.value)
                                                return (
                                                    <div key={attr} className={cn("rounded-lg border p-3", colors.border, colors.bgAlpha)}>
                                                        <p className={cn("mb-2 text-[10px] font-black uppercase tracking-[0.2em]", colors.text)}>{ATTRIBUTE_LABELS[attr]}</p>
                                                        <GlassSelector
                                                            value={diceAssignments[attr]}
                                                            onChange={(value) => handleDiceAssignment(attr, value)}
                                                            options={options}
                                                            layout="grid"
                                                            cols={3}
                                                            fullWidth
                                                            allowDeselect
                                                            layoutId={`dice-${attr}`}
                                                        />
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                    {renderAttributeBlocks()}
                                </div>
                            )}
                        </section>
                    </div>
                </Tabs>

                <GlassModalFooter className="mt-5">
                    <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={!canSave || createAssistedSheet.isPending}
                        className={cn(
                            "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors",
                            "bg-violet-600 hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                        )}
                    >
                        {createAssistedSheet.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        Salvar
                    </button>
                </GlassModalFooter>
            </GlassModalContent>
        </GlassModal>
    )
}
