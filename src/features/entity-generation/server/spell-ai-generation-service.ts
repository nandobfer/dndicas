import fs from "node:fs/promises"
import path from "node:path"
import dbConnect from "@/core/database/db"
import { Spell } from "@/features/spells/models/spell"
import { updateSpell } from "@/features/spells/api/spells-service"
import type { AttributeType, CastingTime, CreateSpellInput, DiceType, Spell as SpellType, SpellComponent, SpellSchool } from "@/features/spells/types/spells.types"
import { GenAITranslator } from "../../../../scripts/seed-data/translation/genai-translator"
import { ENTITY_GENERATION_MODEL } from "./entity-generation-model"
import type {
    EntityGenerationProgress,
    FiveEToolsGenerationSpell,
    GeneratedSpellCandidate,
} from "../types/entity-generation.types"

interface SpellsDataFile {
    spell?: FiveEToolsGenerationSpell[]
}

interface TranslationCounter {
    current: number
    total: number
    onProgress?: (progress: EntityGenerationProgress) => void | Promise<void>
}

const DATA_ROOT = path.join(process.cwd(), "src/lib/5etools-data")

const SOURCE_NAMES: Record<string, string> = {
    PHB: "Manual do Jogador",
    XPHB: "Player's Handbook 2024",
    DMG: "Dungeon Master's Guide",
    MM: "Monster Manual",
    MPMM: "Mordenkainen Presents: Monsters of the Multiverse",
    SCAG: "Sword Coast Adventurer's Guide",
    ERLW: "Eberron: Rising from the Last War",
    VRGR: "Van Richten's Guide to Ravenloft",
}

const SCHOOL_MAP: Record<string, SpellSchool> = {
    A: "Abjuração",
    C: "Conjuração",
    D: "Adivinhação",
    E: "Encantamento",
    V: "Evocação",
    I: "Ilusão",
    N: "Necromancia",
    T: "Transmutação",
}

const SAVE_ATTRIBUTE_MAP: Record<string, AttributeType> = {
    strength: "Força",
    dexterity: "Destreza",
    constitution: "Constituição",
    intelligence: "Inteligência",
    wisdom: "Sabedoria",
    charisma: "Carisma",
}

const DURATION_TYPE_LABELS: Record<string, string> = {
    round: "rodada",
    rounds: "rodadas",
    minute: "minuto",
    minutes: "minutos",
    hour: "hora",
    hours: "horas",
    day: "dia",
    days: "dias",
}

const VALID_DICE = ["d4", "d6", "d8", "d10", "d12", "d20"] as const
const DICE_REGEX = /\{@(?:damage|hit)\s+(\d+)d(\d+)(?:[^}]*)?\}/
const SCALE_DICE_REGEX = /\{@scaledamage\s+[^|]*\|[^|]*\|(\d+)d(\d+)\}/

function normalize(value: string | undefined): string {
    return (value ?? "").trim().toLowerCase()
}

function feetToMeters(feet: number): string {
    const meters = feet * 0.3
    return Number.isInteger(meters) ? String(meters) : meters.toFixed(1).replace(".", ",")
}

function milesToKm(miles: number): string {
    const km = miles * 1.5
    return Number.isInteger(km) ? String(km) : km.toFixed(1).replace(".", ",")
}

function formatSource(source: string, page?: number): string {
    const book = SOURCE_NAMES[source] ?? source
    return page ? `${book} p. ${page}` : book
}

async function readJson<T>(fileName: string): Promise<T> {
    const raw = await fs.readFile(path.join(DATA_ROOT, fileName), "utf8")
    return JSON.parse(raw) as T
}

async function loadSpellsData(): Promise<FiveEToolsGenerationSpell[]> {
    const data = await readJson<SpellsDataFile>("spells-xphb.json")
    return data.spell ?? []
}

function createTranslator(): GenAITranslator {
    const translator = new GenAITranslator()
    translator.configure({ model: ENTITY_GENERATION_MODEL, rpm: 0, rpd: 0 })
    return translator
}

function cleanEntryText(text: string): string {
    return text
        .replace(/\{@damage\s+([^}]+)\}/g, "$1")
        .replace(/\{@scaledamage\s+([^|]+)\|[^|]+\|([^}]+)\}/g, "$2")
        .replace(/\{@dice\s+([^}]+)\}/g, "$1")
        .replace(/\{@hit\s+([^}]+)\}/g, "+$1")
        .replace(/\{@dc\s+([^}]+)\}/g, "DC $1")
        .replace(/\{@[a-z]+\s+([^}|]+)(?:\|[^}]*)?\}/gi, "$1")
        .trim()
}

function buildEntriesHtml(spell: FiveEToolsGenerationSpell): string {
    const parts: string[] = []

    for (const entry of spell.entries ?? []) {
        if (typeof entry === "string") {
            parts.push(`<p>${cleanEntryText(entry)}</p>`)
        } else if (entry && typeof entry === "object") {
            const nested = entry as { name?: string; entries?: unknown[] }
            const texts = (nested.entries ?? []).filter((value): value is string => typeof value === "string").map(cleanEntryText)
            if (!texts.length) continue
            if (nested.name) {
                parts.push(`<p><strong>${cleanEntryText(nested.name)}.</strong> ${texts.join(" ")}</p>`)
            } else {
                texts.forEach((text) => parts.push(`<p>${text}</p>`))
            }
        }
    }

    for (const section of spell.entriesHigherLevel ?? []) {
        const text = section.entries.map(cleanEntryText).join(" ")
        parts.push(`<p><strong>At Higher Levels.</strong> ${text}</p>`)
    }

    return parts.join("")
}

function extractDiceFromEntries(entries: (string | Record<string, unknown>)[] | undefined, higherLevel: FiveEToolsGenerationSpell["entriesHigherLevel"], regex: RegExp) {
    const allEntries = [
        ...(entries ?? []).filter((entry): entry is string => typeof entry === "string"),
        ...(higherLevel?.flatMap((entry) => entry.entries) ?? []),
    ]

    for (const entry of allEntries) {
        const match = entry.match(regex)
        const diceType = match ? `d${match[2]}` : undefined
        if (match && diceType && (VALID_DICE as readonly string[]).includes(diceType)) {
            return {
                quantidade: Number.parseInt(match[1], 10),
                tipo: diceType as DiceType,
            }
        }
    }

    return undefined
}

function mapCastingTime(spell: FiveEToolsGenerationSpell): CastingTime | undefined {
    if (spell.meta?.ritual) return "Ritual"
    switch (spell.time?.[0]?.unit) {
        case "action":
            return "Ação"
        case "bonus":
            return "Ação Bônus"
        case "reaction":
            return "Reação"
        default:
            return undefined
    }
}

function mapComponents(spell: FiveEToolsGenerationSpell): SpellComponent[] {
    const result: SpellComponent[] = []
    if (spell.components?.v) result.push("Verbal")
    if (spell.components?.s) result.push("Somático")
    if (spell.components?.m) result.push("Material")
    if (spell.duration?.some((entry) => entry.concentration)) result.push("Concentração")
    return result
}

function mapRange(range: FiveEToolsGenerationSpell["range"]): string | undefined {
    if (!range) return undefined
    if (range.type === "self") return "Pessoal"
    if (range.type === "touch") return "Toque"
    if (range.type === "sight") return "Linha de visão"
    if (range.type === "unlimited") return "Ilimitado"
    if (range.distance?.amount !== undefined) {
        if (range.distance.type === "feet") return `${feetToMeters(range.distance.amount)} metros`
        if (range.distance.type === "miles") return `${milesToKm(range.distance.amount)} km`
        return `${range.distance.amount} ${range.distance.type}`
    }
    return undefined
}

function mapDuration(duration: FiveEToolsGenerationSpell["duration"]): string | undefined {
    const first = duration?.[0]
    if (!first) return undefined
    if (first.type === "instant") return "Instantâneo"
    if (first.type === "permanent") return "Permanente"
    if (first.type === "special") return "Especial"
    if (first.type === "timed" && first.duration) {
        const amount = first.duration.amount ?? 1
        const unit = DURATION_TYPE_LABELS[first.duration.type] ?? first.duration.type
        const prefix = first.concentration ? "Concentração, até " : ""
        return `${prefix}${amount} ${amount === 1 ? unit : `${unit}s`}`.replace(/ss$/, "s")
    }
    return undefined
}

function findMatchingSpells(current: SpellType, spells: FiveEToolsGenerationSpell[]): FiveEToolsGenerationSpell[] {
    const originalName = normalize(current.originalName)
    const currentName = normalize(current.name)
    const exactOriginal = spells.filter((spell) => originalName && normalize(spell.name) === originalName)
    if (exactOriginal.length) return exactOriginal
    return spells.filter((spell) => normalize(spell.name) === currentName)
}

function serializeSpell<T extends { _id: unknown; createdAt?: Date; updatedAt?: Date }>(spell: T): SpellType {
    return {
        ...spell,
        _id: String(spell._id),
        createdAt: spell.createdAt,
        updatedAt: spell.updatedAt,
    } as unknown as SpellType
}

async function buildCandidate(
    spell: FiveEToolsGenerationSpell,
    translator: GenAITranslator,
    counter: TranslationCounter,
    currentImage?: string,
): Promise<GeneratedSpellCandidate> {
    const translated = await translator.translateItem(spell.name, buildEntriesHtml(spell))
    counter.current += 1
    await counter.onProgress?.({ current: counter.current, total: counter.total, message: `Gerando magia ${spell.name}` })

    return {
        candidateId: `${spell.name}:${spell.source}:${spell.page ?? ""}`,
        matchLabel: `${spell.name} (${formatSource(spell.source, spell.page)})`,
        name: translated.name,
        originalName: spell.name,
        description: translated.description,
        circle: spell.level,
        school: SCHOOL_MAP[spell.school] ?? "Evocação",
        castingTime: mapCastingTime(spell),
        component: mapComponents(spell),
        range: mapRange(spell.range),
        duration: mapDuration(spell.duration),
        saveAttribute: spell.savingThrow?.[0] ? SAVE_ATTRIBUTE_MAP[spell.savingThrow[0]] : undefined,
        baseDice: extractDiceFromEntries(spell.entries, undefined, DICE_REGEX),
        extraDicePerLevel: extractDiceFromEntries(spell.entries, spell.entriesHigherLevel, SCALE_DICE_REGEX),
        image: currentImage,
        source: formatSource(spell.source, spell.page),
        status: "active",
    }
}

export async function generateSpellCandidates(
    spellId: string,
    onProgress?: (progress: EntityGenerationProgress) => void | Promise<void>,
): Promise<{ current: SpellType; candidates: GeneratedSpellCandidate[] }> {
    await dbConnect()

    const currentDoc = await Spell.findById(spellId).lean()
    if (!currentDoc) throw new Error("Magia não encontrada.")

    const current = serializeSpell(currentDoc)
    const sourceSpells = await loadSpellsData()
    const matches = findMatchingSpells(current, sourceSpells)

    const counter: TranslationCounter = {
        current: 0,
        total: Math.max(matches.length, 1),
        onProgress,
    }

    if (!matches.length) {
        await onProgress?.({ current: 1, total: 1, message: "Nenhuma correspondência encontrada." })
        return { current, candidates: [] }
    }

    const translator = createTranslator()
    const candidates: GeneratedSpellCandidate[] = []
    for (const match of matches) {
        candidates.push(await buildCandidate(match, translator, counter, current.image))
    }

    return { current, candidates }
}

export async function applySpellGenerationCandidate(spellId: string, candidate: GeneratedSpellCandidate, userId: string): Promise<SpellType> {
    await dbConnect()

    const previous = await Spell.findById(spellId).lean()
    if (!previous) throw new Error("Magia não encontrada.")

    const update: CreateSpellInput = {
        ...candidate,
        image: candidate.image ?? previous.image ?? undefined,
    }
    const updated = await updateSpell(spellId, update, userId)
    if (!updated) throw new Error("Magia não encontrada após atualização.")
    return serializeSpell(updated)
}
