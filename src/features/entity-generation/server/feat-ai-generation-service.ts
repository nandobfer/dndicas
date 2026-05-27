import fs from "node:fs/promises"
import path from "node:path"
import dbConnect from "@/core/database/db"
import { formatSourceDisplay } from "@/core/utils/source-utils"
import { updateFeat } from "@/features/feats/api/feats-service"
import { Feat } from "@/features/feats/models/feat"
import type { CreateFeatInput, Feat as FeatType } from "@/features/feats/types/feats.types"
import type { FeatCategory } from "@/features/feats/lib/feat-categories"
import { GenAITranslator } from "../../../../scripts/seed-data/translation/genai-translator"
import { ENTITY_GENERATION_MODEL } from "./entity-generation-model"
import type { EntityGenerationProgress, GeneratedFeatCandidate } from "../types/entity-generation.types"

interface FiveEToolsAbilityChoice {
    from?: string[]
    amount?: number
}

interface FiveEToolsAbility {
    str?: number
    dex?: number
    con?: number
    int?: number
    wis?: number
    cha?: number
    choose?: FiveEToolsAbilityChoice
    hidden?: boolean
}

interface FiveEToolsPrerequisite {
    level?: number
    ability?: Array<Record<string, number | FiveEToolsAbilityChoice | undefined>>
    feat?: string[]
    feature?: string[]
    race?: { name: string; subrace?: string }[]
    spellcasting2020?: boolean
    spellcastingFeature?: boolean
    proficiency?: { armor?: string; weapon?: string; weaponGroup?: string }[]
    background?: { name: string }[]
    otherSummary?: { entrySummary?: string }
    other?: string
}

interface FiveEToolsEntry {
    type?: string
    name?: string
    entries?: (string | FiveEToolsEntry)[]
    items?: (string | FiveEToolsEntry)[]
    entry?: string
    caption?: string
    colLabels?: string[]
    rows?: unknown[][]
}

interface FiveEToolsFeat {
    name: string
    source: string
    page?: number
    category?: string
    prerequisite?: FiveEToolsPrerequisite[]
    ability?: FiveEToolsAbility[]
    entries: (string | FiveEToolsEntry)[]
    reprintedAs?: string[]
}

interface FeatsDataFile {
    feat?: FiveEToolsFeat[]
}

interface TranslationCounter {
    current: number
    total: number
    onProgress?: (progress: EntityGenerationProgress) => void | Promise<void>
}

const DATA_ROOT = path.join(process.cwd(), "src/lib/5etools-data")

const CATEGORY_MAP: Record<string, FeatCategory | undefined> = {
    G: "Geral",
    O: "Origem",
    FS: "Estilo de Luta",
    "FS:P": "Estilo de Luta",
    "FS:R": "Estilo de Luta",
    EB: "Dádiva Épica",
}

const ATTRIBUTE_MAP: Record<string, string> = {
    str: "Força",
    dex: "Destreza",
    con: "Constituição",
    int: "Inteligência",
    wis: "Sabedoria",
    cha: "Carisma",
}

const ATTRIBUTE_KEYS = Object.keys(ATTRIBUTE_MAP)

const ARMOR_MAP: Record<string, string> = {
    light: "armadura leve",
    medium: "armadura média",
    heavy: "armadura pesada",
    shield: "escudo",
}

function normalize(value: string | undefined): string {
    return (value ?? "").trim().toLowerCase()
}

function createTranslator(): GenAITranslator {
    const translator = new GenAITranslator()
    translator.configure({ model: ENTITY_GENERATION_MODEL, rpm: 0, rpd: 0 })
    return translator
}

function cleanText(text: string): string {
    return text
        .replace(/\{@damage\s+([^}]+)\}/g, "$1")
        .replace(/\{@scaledamage\s+([^|]+)\|[^|]+\|([^}]+)\}/g, "$2")
        .replace(/\{@dice\s+([^}]+)\}/g, "$1")
        .replace(/\{@hit\s+([^}]+)\}/g, "+$1")
        .replace(/\{@dc\s+([^}]+)\}/g, "CD $1")
        .replace(/\{@[a-z]+\s+([^}|]+)(?:\|[^}]*)?\}/gi, "$1")
        .trim()
}

async function loadFeatsData(): Promise<FiveEToolsFeat[]> {
    const raw = await fs.readFile(path.join(DATA_ROOT, "feats.json"), "utf8")
    const data = JSON.parse(raw) as FeatsDataFile
    return data.feat ?? []
}

function extractLevel(prerequisites?: FiveEToolsPrerequisite[]): number {
    for (const prerequisite of prerequisites ?? []) {
        if (typeof prerequisite.level === "number" && prerequisite.level >= 1 && prerequisite.level <= 20) return prerequisite.level
    }
    return 1
}

function buildPrerequisiteText(prereq: FiveEToolsPrerequisite): string | null {
    const parts: string[] = []
    if (prereq.level) parts.push(`Nível ${prereq.level}`)
    for (const abilityObj of prereq.ability ?? []) {
        for (const key of ATTRIBUTE_KEYS) {
            const val = abilityObj[key]
            if (typeof val === "number") parts.push(`${ATTRIBUTE_MAP[key]} ${val} ou superior`)
        }
    }
    if (prereq.feat?.length) parts.push(`Talento: ${prereq.feat.map((entry) => entry.split("|")[0]).join(" ou ")}`)
    if (prereq.feature?.length) parts.push(`Habilidade de Classe: ${prereq.feature.join(" ou ")}`)
    if (prereq.spellcasting2020 || prereq.spellcastingFeature) parts.push("Habilidade de Conjuração")
    for (const proficiency of prereq.proficiency ?? []) {
        if (proficiency.armor) parts.push(`Proficiência com ${ARMOR_MAP[proficiency.armor] ?? proficiency.armor}`)
        if (proficiency.weapon) parts.push(`Proficiência com armas ${proficiency.weapon}`)
        if (proficiency.weaponGroup) parts.push(`Proficiência com armas ${proficiency.weaponGroup}`)
    }
    if (prereq.race?.length) parts.push(`Raça: ${prereq.race.map((race) => (race.subrace ? `${race.name} (${race.subrace})` : race.name)).join(" ou ")}`)
    if (prereq.background?.length) parts.push(`Antecedente: ${prereq.background.map((background) => background.name).join(" ou ")}`)
    if (prereq.otherSummary?.entrySummary) parts.push(prereq.otherSummary.entrySummary)
    else if (prereq.other) parts.push(prereq.other)
    return parts.length ? parts.join(", ") : null
}

function buildPrerequisites(prerequisites?: FiveEToolsPrerequisite[]): string[] {
    return (prerequisites ?? []).map(buildPrerequisiteText).filter((value): value is string => value !== null)
}

function buildAttributeBonuses(ability?: FiveEToolsAbility[]): CreateFeatInput["attributeBonuses"] {
    const bonuses: NonNullable<CreateFeatInput["attributeBonuses"]> = []
    for (const abilityObj of ability ?? []) {
        if (abilityObj.hidden) continue
        for (const key of ATTRIBUTE_KEYS) {
            const val = abilityObj[key as keyof FiveEToolsAbility]
            if (typeof val === "number" && val >= 1 && val <= 3) bonuses.push({ attribute: ATTRIBUTE_MAP[key], value: val })
        }
        if (abilityObj.choose?.from) {
            const value = abilityObj.choose.amount ?? 1
            for (const key of abilityObj.choose.from) {
                const attribute = ATTRIBUTE_MAP[key]
                if (attribute) bonuses.push({ attribute, value })
            }
        }
    }
    return bonuses
}

function renderListItems(items: (string | FiveEToolsEntry)[]): string {
    return items
        .map((item) => {
            if (typeof item === "string") return `<li>${cleanText(item)}</li>`
            if (item.entry) return `<li>${cleanText(item.entry)}</li>`
            if (!item.entries) return ""
            const inner = item.entries.filter((entry): entry is string => typeof entry === "string").map(cleanText).join(" ")
            return item.name ? `<li><strong>${cleanText(item.name)}.</strong> ${inner}</li>` : `<li>${inner}</li>`
        })
        .filter(Boolean)
        .join("")
}

function renderEntry(entry: string | FiveEToolsEntry): string {
    if (typeof entry === "string") return `<p>${cleanText(entry)}</p>`
    if (entry.type === "list" && entry.items) return `<ul>${renderListItems(entry.items)}</ul>`
    if ((entry.type === "entries" || entry.type === "inset" || entry.type === "section") && entry.entries) {
        const inner = entry.entries.map(renderEntry).join("")
        return entry.name ? `<p><strong>${cleanText(entry.name)}.</strong></p>${inner}` : inner
    }
    if (entry.type === "table" && entry.colLabels && entry.rows) {
        const headers = entry.colLabels.map((header) => `<th>${cleanText(String(header))}</th>`).join("")
        const rows = entry.rows.map((row) => `<tr>${row.map((cell) => `<td>${cleanText(String(cell))}</td>`).join("")}</tr>`).join("")
        const caption = entry.caption ? `<caption>${cleanText(entry.caption)}</caption>` : ""
        return `<table>${caption}<thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`
    }
    if (entry.entries) return entry.entries.map(renderEntry).join("")
    return ""
}

function buildEntriesHtml(feat: FiveEToolsFeat): string {
    return feat.entries.map(renderEntry).join("")
}

function findMatchingFeats(current: FeatType, feats: FiveEToolsFeat[]): FiveEToolsFeat[] {
    const available = feats.filter((feat) => !feat.reprintedAs)
    const originalName = normalize(current.originalName)
    const currentName = normalize(current.name)
    const exactOriginal = available.filter((feat) => originalName && normalize(feat.name) === originalName)
    if (exactOriginal.length) return exactOriginal
    return available.filter((feat) => normalize(feat.name) === currentName)
}

function serializeFeat<T extends { _id: unknown; createdAt?: Date | string; updatedAt?: Date | string }>(feat: T): FeatType {
    return {
        ...feat,
        _id: String(feat._id),
        createdAt: feat.createdAt instanceof Date ? feat.createdAt.toISOString() : String(feat.createdAt ?? ""),
        updatedAt: feat.updatedAt instanceof Date ? feat.updatedAt.toISOString() : String(feat.updatedAt ?? ""),
    } as unknown as FeatType
}

async function buildCandidate(feat: FiveEToolsFeat, translator: GenAITranslator, counter: TranslationCounter): Promise<GeneratedFeatCandidate | null> {
    const category = feat.category ? CATEGORY_MAP[feat.category] : undefined
    if (!category) return null

    const translated = await translator.translateItem(feat.name, buildEntriesHtml(feat))
    counter.current += 1
    await counter.onProgress?.({ current: counter.current, total: counter.total, message: `Gerando talento ${feat.name}` })

    return {
        candidateId: `${feat.name}:${feat.source}:${feat.page ?? ""}`,
        matchLabel: `${feat.name} (${formatSourceDisplay(feat.source, feat.page)})`,
        name: translated.name,
        originalName: feat.name,
        description: translated.description,
        source: formatSourceDisplay(feat.source, feat.page),
        level: extractLevel(feat.prerequisite),
        prerequisites: buildPrerequisites(feat.prerequisite),
        attributeBonuses: buildAttributeBonuses(feat.ability),
        category,
        status: "active",
    }
}

export async function generateFeatCandidates(
    featId: string,
    onProgress?: (progress: EntityGenerationProgress) => void | Promise<void>,
): Promise<{ current: FeatType; candidates: GeneratedFeatCandidate[] }> {
    await dbConnect()

    const currentDoc = await Feat.findById(featId).lean()
    if (!currentDoc) throw new Error("Talento não encontrado.")

    const current = serializeFeat(currentDoc)
    const matches = findMatchingFeats(current, await loadFeatsData())
    const counter: TranslationCounter = { current: 0, total: Math.max(matches.length, 1), onProgress }

    if (!matches.length) {
        await onProgress?.({ current: 1, total: 1, message: "Nenhuma correspondência encontrada." })
        return { current, candidates: [] }
    }

    const translator = createTranslator()
    const candidates: GeneratedFeatCandidate[] = []
    for (const match of matches) {
        const candidate = await buildCandidate(match, translator, counter)
        if (candidate) candidates.push(candidate)
    }

    return { current, candidates }
}

export async function applyFeatGenerationCandidate(featId: string, candidate: GeneratedFeatCandidate, userId: string): Promise<FeatType> {
    const updated = await updateFeat(featId, candidate, userId)
    if (!updated) throw new Error("Talento não encontrado após atualização.")
    return serializeFeat(updated)
}
