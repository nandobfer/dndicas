import fs from "node:fs/promises"
import path from "node:path"
import dbConnect from "@/core/database/db"
import { RaceModel } from "@/features/races/models/race"
import { Trait } from "@/features/traits/database/trait"
import { Spell } from "@/features/spells/models/spell"
import { createSpell } from "@/features/spells/api/spells-service"
import { logUpdate } from "@/features/users/api/audit-service"
import type { CreateSpellInput, SpellSchool, SpellComponent, AttributeType, CastingTime } from "@/features/spells/types/spells.types"
import type { Race, RaceTrait, RaceVariation, SizeCategory } from "@/features/races/types/races.types"
import { GenAITranslator } from "../../../../scripts/seed-data/translation/genai-translator"
import type {
    AdditionalSpellGroup,
    FiveEToolsGenerationEntry,
    FiveEToolsGenerationRace,
    FiveEToolsGenerationSubrace,
    FiveEToolsGenerationSpell,
    FluffGenerationRaceEntry,
    GeneratedRaceCandidate,
    GeneratedRaceTrait,
    GeneratedRaceVariation,
    RawGenerationSpellRef,
    EntityGenerationProgress,
} from "../types/entity-generation.types"

interface RacesDataFile {
    race?: FiveEToolsGenerationRace[]
    subrace?: FiveEToolsGenerationSubrace[]
}

interface FluffDataFile {
    raceFluff?: FluffGenerationRaceEntry[]
}

interface SpellsDataFile {
    spell?: FiveEToolsGenerationSpell[]
}

interface SpellGrant {
    nameEN: string
    charLevel: number
    isCantrip: boolean
}

type DescriptionEntries = (string | FiveEToolsGenerationEntry)[] | undefined

interface SpellMentionDoc {
    _id: unknown
    name: string
    circle?: number
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
    str: "Força",
    dex: "Destreza",
    con: "Constituição",
    int: "Inteligência",
    wis: "Sabedoria",
    cha: "Carisma",
}

const SIZE_MAP: Record<string, SizeCategory> = {
    S: "Pequeno",
    M: "Médio",
    L: "Grande",
}

const SPEED_LABELS: Record<string, string> = {
    walk: "a pé",
    fly: "voando",
    swim: "nadando",
    climb: "escalando",
    burrow: "escavando",
}

function feetToMetersNum(feet: number): string {
    const meters = feet * 0.3
    return Number.isInteger(meters) ? String(meters) : meters.toFixed(1).replace(".", ",")
}

function mapSize(sizeArr: string[] | undefined): SizeCategory {
    if (!sizeArr?.length) return "Médio"
    for (const size of sizeArr) {
        const mapped = SIZE_MAP[size]
        if (mapped) return mapped
    }
    return "Médio"
}

function mapSpeed(speed: number | Record<string, number | boolean> | undefined): string {
    if (speed === undefined) return "9 metros"
    if (typeof speed === "number") return `${feetToMetersNum(speed)} metros`

    const parts: string[] = []
    for (const [key, value] of Object.entries(speed)) {
        const label = SPEED_LABELS[key] ?? key
        if (typeof value === "number") {
            parts.push(`${feetToMetersNum(value)} metros (${label})`)
        } else if (value === true) {
            parts.push(key === "fly" ? "voo igual ao deslocamento a pé" : `deslocamento de ${label} igual ao deslocamento a pé`)
        }
    }

    return parts.join(", ") || "9 metros"
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

function buildEntryHtml(entry: FiveEToolsGenerationEntry | string): string {
    if (typeof entry === "string") return `<p>${cleanText(entry)}</p>`

    const parts: string[] = []
    if (entry.type === "list" && Array.isArray(entry.items)) {
        const items = entry.items
            .map((item) => {
                if (typeof item === "string") return `<li>${cleanText(item)}</li>`
                if (item.name && item.entry) return `<li><strong>${cleanText(item.name)}.</strong> ${cleanText(item.entry)}</li>`
                if (item.entry) return `<li>${cleanText(item.entry)}</li>`
                if (item.entries) return `<li>${item.entries.map(buildEntryHtml).join("")}</li>`
                return ""
            })
            .filter(Boolean)
        parts.push(`<ul>${items.join("")}</ul>`)
    } else if (Array.isArray(entry.entries)) {
        const entries = entry.entries.map(buildEntryHtml).join("")
        parts.push(entry.name ? `<p><strong>${cleanText(entry.name)}.</strong></p>${entries}` : entries)
    }

    return parts.join("")
}

function buildDescriptionHtml(entries: DescriptionEntries): string {
    if (!entries?.length) return ""
    return entries.map(buildEntryHtml).join("")
}

function extractTraits(entries: FiveEToolsGenerationEntry[] | undefined): RaceTrait[] {
    if (!entries?.length) return []
    const traits: RaceTrait[] = []
    for (const entry of entries) {
        if (entry.name && Array.isArray(entry.entries)) {
            const description = buildDescriptionHtml(entry.entries)
            if (description) traits.push({ name: cleanText(entry.name), description, level: 1 })
        }
    }
    return traits
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function normalize(value: string | undefined): string {
    return (value ?? "").trim().toLowerCase()
}

function formatSource(source: string, page?: number): string {
    const book = SOURCE_NAMES[source] ?? source
    return page ? `${book} p. ${page}` : book
}

async function readJson<T>(fileName: string): Promise<T> {
    const raw = await fs.readFile(path.join(DATA_ROOT, fileName), "utf8")
    return JSON.parse(raw) as T
}

async function loadGenerationData() {
    const [racesData, fluffData, spellsData] = await Promise.all([
        readJson<RacesDataFile>("races.json"),
        readJson<FluffDataFile>("fluff-races.json").catch(() => ({ raceFluff: [] })),
        readJson<SpellsDataFile>("spells-xphb.json").catch(() => ({ spell: [] })),
    ])

    return {
        races: racesData.race ?? [],
        subraces: racesData.subrace ?? [],
        fluff: fluffData.raceFluff ?? [],
        spells: spellsData.spell ?? [],
    }
}

function getRaceImage(fluff: FluffGenerationRaceEntry | undefined): string {
    const image = fluff?.images?.[0]
    if (!image) return ""
    if (image.href.type === "external") return image.href.url ?? ""
    if (image.href.path) return `https://5e.tools/img/${image.href.path}`
    return ""
}

function createTranslator(): GenAITranslator {
    const translator = new GenAITranslator()
    translator.configure({ model: "", rpm: 0, rpd: 0 })
    return translator
}

async function translateItem(
    translator: GenAITranslator,
    counter: TranslationCounter,
    name: string,
    description: string,
    message: string,
): Promise<{ name: string; description: string }> {
    const translated = await translator.translateItem(name, description)
    counter.current += 1
    await counter.onProgress?.({ current: counter.current, total: counter.total, message })
    return translated
}

function collectAdditionalSpells(additionalSpells: AdditionalSpellGroup[] | undefined): SpellGrant[] {
    if (!additionalSpells?.length) return []

    const result: SpellGrant[] = []
    const stripSuffix = (raw: string) => raw.replace(/#[a-z]+$/i, "").trim()

    const collectList = (list: (string | Record<string, unknown>)[] | undefined, charLevel: number): void => {
        for (const entry of list ?? []) {
            if (typeof entry !== "string") continue
            const nameEN = stripSuffix(entry)
            if (!nameEN) continue
            result.push({ nameEN, charLevel, isCantrip: /#c$/i.test(entry) })
        }
    }

    for (const group of additionalSpells) {
        for (const section of [group.known, group.innate]) {
            if (!section) continue
            for (const [levelStr, atLevel] of Object.entries(section)) {
                const charLevel = Number.parseInt(levelStr, 10)
                if (Number.isNaN(charLevel)) continue
                if (Array.isArray(atLevel)) {
                    collectList(atLevel, charLevel)
                } else if (atLevel && typeof atLevel === "object") {
                    collectList(atLevel._, charLevel)
                    collectList(atLevel.will, charLevel)
                    for (const list of Object.values(atLevel.daily ?? {})) collectList(list, charLevel)
                    for (const list of Object.values(atLevel.rest ?? {})) collectList(list, charLevel)
                }
            }
        }
    }

    return result
}

function buildSpellDescriptionHtml(spell: FiveEToolsGenerationSpell): string {
    const entries = [...(spell.entries ?? []), ...(spell.entriesHigherLevel ?? [])]
    return buildDescriptionHtml(entries as DescriptionEntries)
}

function formatCastingTime(time: FiveEToolsGenerationSpell["time"]): CastingTime | undefined {
    const unit = time?.[0]?.unit
    if (unit === "bonus") return "Ação Bônus"
    if (unit === "reaction") return "Reação"
    if (unit === "action") return "Ação"
    return undefined
}

function formatRange(range: FiveEToolsGenerationSpell["range"]): string | undefined {
    if (!range) return undefined
    if (range.type === "point" && range.distance) {
        if (range.distance.type === "self") return "Pessoal"
        if (range.distance.type === "touch") return "Toque"
        if (typeof range.distance.amount === "number") return `${range.distance.amount} feet`
    }
    return cleanText(range.type)
}

function formatDuration(duration: FiveEToolsGenerationSpell["duration"]): string | undefined {
    const first = duration?.[0]
    if (!first) return undefined
    if (first.type === "instant") return "Instantânea"
    if (first.type === "permanent") return "Permanente"
    if (first.duration) {
        return `${first.concentration ? "Concentração, até " : ""}${first.duration.amount ?? ""} ${first.duration.type}`.trim()
    }
    return cleanText(first.type)
}

function formatComponents(components: FiveEToolsGenerationSpell["components"], duration: FiveEToolsGenerationSpell["duration"]): SpellComponent[] {
    const result: SpellComponent[] = []
    if (components?.v) result.push("Verbal")
    if (components?.s) result.push("Somático")
    if (components?.m) result.push("Material")
    if (duration?.some((entry) => entry.concentration)) result.push("Concentração")
    return result
}

function buildCreateSpellInput(spell: FiveEToolsGenerationSpell, translated: { name: string; description: string }): CreateSpellInput {
    return {
        name: translated.name,
        originalName: spell.name,
        description: translated.description,
        circle: spell.level,
        school: SCHOOL_MAP[spell.school] ?? "Evocação",
        castingTime: spell.meta?.ritual ? "Ritual" : formatCastingTime(spell.time),
        component: formatComponents(spell.components, spell.duration),
        range: formatRange(spell.range),
        duration: formatDuration(spell.duration),
        saveAttribute: spell.savingThrow?.[0] ? SAVE_ATTRIBUTE_MAP[spell.savingThrow[0]] : undefined,
        source: formatSource(spell.source, spell.page),
        status: "active",
    }
}

function minimalSpellInput(spell: RawGenerationSpellRef, raceName: string): CreateSpellInput {
    return {
        name: spell.name,
        originalName: spell.originalName,
        description: `<p><strong>Cadastro incompleto.</strong> Esta magia foi criada automaticamente pela geração com IA da raça ${raceName}. A fonte original não foi encontrada nos dados locais e precisa ser revisada manualmente.</p>`,
        circle: spell.circle ?? 1,
        school: "Evocação",
        component: [],
        source: `Geração IA: ${raceName}${spell.source ? ` (${spell.source})` : ""}`,
        status: "active",
    }
}

function countTranslationUnits(race: FiveEToolsGenerationRace, subraces: FiveEToolsGenerationSubrace[]): number {
    const baseTraits = extractTraits(race.entries).length
    const baseSpells = collectAdditionalSpells(race.additionalSpells).length
    return subraces.reduce(
        (total, subrace) => total + 1 + extractTraits(subrace.entries).length + collectAdditionalSpells(subrace.additionalSpells).length,
        1 + baseTraits + baseSpells,
    )
}

function findMatchingRaces(current: Race, races: FiveEToolsGenerationRace[]): FiveEToolsGenerationRace[] {
    const originalName = normalize(current.originalName)
    const name = normalize(current.name)
    const exact = races.filter((race) => originalName && normalize(race.name) === originalName)
    if (exact.length) return exact
    return races.filter((race) => normalize(race.name) === name)
}

async function translateTraits(
    translator: GenAITranslator,
    counter: TranslationCounter,
    rawTraits: RaceTrait[],
): Promise<GeneratedRaceTrait[]> {
    const result: GeneratedRaceTrait[] = []
    for (const trait of rawTraits) {
        const translated = await translateItem(translator, counter, trait.name, trait.description, "Gerando características")
        result.push({ name: translated.name, originalName: trait.name, description: translated.description, level: trait.level ?? 1 })
    }
    return result
}

async function translateSpells(
    translator: GenAITranslator,
    counter: TranslationCounter,
    rawSpells: SpellGrant[],
    spellSources: FiveEToolsGenerationSpell[],
): Promise<RawGenerationSpellRef[]> {
    const result: RawGenerationSpellRef[] = []
    for (const spell of rawSpells) {
        const sourceSpell = spellSources.find((item) => normalize(item.name) === normalize(spell.nameEN))
        const circle = sourceSpell?.level ?? (spell.isCantrip ? 0 : undefined)
        const translated = await translateItem(translator, counter, spell.nameEN, sourceSpell ? buildSpellDescriptionHtml(sourceSpell) : "", `Gerando magia ${spell.nameEN}`)
        result.push({
            _raw: true,
            name: translated.name,
            originalName: spell.nameEN,
            level: spell.charLevel,
            circle,
            source: sourceSpell ? formatSource(sourceSpell.source, sourceSpell.page) : undefined,
            createInput: sourceSpell ? buildCreateSpellInput(sourceSpell, translated) : undefined,
            requiresManualReview: !sourceSpell,
        })
    }
    return result
}

async function buildCandidate(
    race: FiveEToolsGenerationRace,
    allSubraces: FiveEToolsGenerationSubrace[],
    fluffEntries: FluffGenerationRaceEntry[],
    spellSources: FiveEToolsGenerationSpell[],
    translator: GenAITranslator,
    counter: TranslationCounter,
): Promise<GeneratedRaceCandidate> {
    const fluff = fluffEntries.find((item) => normalize(item.name) === normalize(race.name) && item.source === race.source)
    const description = buildDescriptionHtml(fluff?.entries ?? race.entries)
    const translatedRace = await translateItem(translator, counter, race.name, description, `Gerando raça ${race.name}`)
    const subraces = allSubraces.filter((subrace) => normalize(subrace.raceName) === normalize(race.name) && subrace.raceSource === race.source)

    const traits = await translateTraits(translator, counter, extractTraits(race.entries))
    const spells = await translateSpells(translator, counter, collectAdditionalSpells(race.additionalSpells), spellSources)

    const variations: GeneratedRaceVariation[] = []
    for (const subrace of subraces) {
        const subraceName = subrace.name ? `${subrace.name} ${race.name}` : race.name
        const translatedVariation = await translateItem(translator, counter, subraceName, buildDescriptionHtml(subrace.entries), `Gerando variação ${subraceName}`)
        variations.push({
            name: translatedVariation.name,
            description: translatedVariation.description,
            source: formatSource(subrace.source, subrace.page),
            image: getRaceImage(fluff),
            traits: await translateTraits(translator, counter, extractTraits(subrace.entries)),
            spells: await translateSpells(translator, counter, collectAdditionalSpells(subrace.additionalSpells), spellSources),
            size: mapSize(subrace.size),
            speed: subrace.speed ? mapSpeed(subrace.speed) : undefined,
        })
    }

    return {
        candidateId: `${race.name}:${race.source}:${race.page ?? ""}`,
        matchLabel: `${race.name} (${formatSource(race.source, race.page)})`,
        name: translatedRace.name,
        originalName: race.name,
        description: translatedRace.description,
        image: getRaceImage(fluff),
        source: formatSource(race.source, race.page),
        status: "active",
        size: mapSize(race.size),
        speed: mapSpeed(race.speed),
        traits,
        spells,
        variations,
    }
}

function serializeRace<T extends { _id: unknown; createdAt?: Date; updatedAt?: Date }>(race: T): Race {
    return {
        ...race,
        _id: String(race._id),
        createdAt: race.createdAt,
        updatedAt: race.updatedAt,
    } as unknown as Race
}

async function findOrCreateTraitMention(trait: GeneratedRaceTrait, scopeName: string, source: string): Promise<RaceTrait> {
    const exactName = `${trait.name} (${scopeName})`
    const query = { name: new RegExp(`^${escapeRegex(exactName)}$`, "i") }
    const update = {
        name: exactName,
        originalName: trait.originalName,
        description: trait.description,
        source,
        status: "active" as const,
    }

    let doc = await Trait.findOneAndUpdate(query, update, { new: true })
    if (!doc) {
        try {
            doc = await Trait.create(update)
        } catch (error) {
            if (typeof error === "object" && error && "code" in error && error.code === 11000) {
                doc = await Trait.findOneAndUpdate(query, update, { new: true })
            }
            if (!doc) throw error
        }
    }

    const id = String(doc._id)
    const mention = `<span data-type="mention" data-id="${id}" data-entity-type="Habilidade" class="mention">${doc.name}</span>`
    return { name: "Habilidade sem Nome", level: trait.level ?? 1, description: mention }
}

async function resolveSpellMention(spell: RawGenerationSpellRef, raceName: string, userId: string) {
    const originalQuery = { originalName: new RegExp(`^${escapeRegex(spell.originalName)}$`, "i") }
    const nameQuery = { name: new RegExp(`^${escapeRegex(spell.name)}$`, "i") }
    let doc = await Spell.findOne(originalQuery).lean<SpellMentionDoc>()
    if (!doc) doc = await Spell.findOne(nameQuery).lean<SpellMentionDoc>()

    if (!doc) {
        const input = spell.createInput ?? minimalSpellInput(spell, raceName)
        try {
            const created = await createSpell(input, userId)
            doc = { _id: created._id, name: created.name, circle: created.circle }
        } catch (error) {
            doc = await Spell.findOne(originalQuery).lean<SpellMentionDoc>()
            if (!doc) doc = await Spell.findOne(nameQuery).lean<SpellMentionDoc>()
            if (!doc) throw error
        }
    }

    return {
        id: String(doc._id),
        name: doc.name,
        level: spell.level,
        circle: doc.circle ?? spell.circle ?? 1,
    }
}

async function resolveRaceTraits(traits: GeneratedRaceTrait[], scopeName: string, source: string): Promise<RaceTrait[]> {
    const resolved: RaceTrait[] = []
    for (const trait of traits) resolved.push(await findOrCreateTraitMention(trait, scopeName, source))
    return resolved
}

async function resolveRaceSpells(spells: RawGenerationSpellRef[], scopeName: string, userId: string) {
    const resolved = []
    for (const spell of spells) resolved.push(await resolveSpellMention(spell, scopeName, userId))
    return resolved
}

export async function generateRaceCandidates(
    raceId: string,
    onProgress?: (progress: EntityGenerationProgress) => void | Promise<void>,
): Promise<{ current: Race; candidates: GeneratedRaceCandidate[] }> {
    await dbConnect()
    const currentDoc = await RaceModel.findById(raceId).lean()
    if (!currentDoc) throw new Error("Raça não encontrada.")

    const current = serializeRace(currentDoc)
    const data = await loadGenerationData()
    const matches = findMatchingRaces(current, data.races)
    if (!matches.length) return { current, candidates: [] }

    const total = matches.reduce((sum, race) => {
        const subraces = data.subraces.filter((subrace) => normalize(subrace.raceName) === normalize(race.name) && subrace.raceSource === race.source)
        return sum + countTranslationUnits(race, subraces)
    }, 0)
    const counter: TranslationCounter = { current: 0, total: Math.max(total, 1), onProgress }
    const translator = createTranslator()
    const candidates: GeneratedRaceCandidate[] = []

    for (const race of matches) {
        candidates.push(await buildCandidate(race, data.subraces, data.fluff, data.spells, translator, counter))
    }

    return { current, candidates }
}

export async function applyRaceGenerationCandidate(raceId: string, candidate: GeneratedRaceCandidate, userId: string): Promise<Race> {
    await dbConnect()
    const previousDoc = await RaceModel.findById(raceId).lean()
    if (!previousDoc) throw new Error("Raça não encontrada.")

    const traits = await resolveRaceTraits(candidate.traits, candidate.name, candidate.source)
    const spells = await resolveRaceSpells(candidate.spells, candidate.name, userId)
    const variations: RaceVariation[] = []

    for (const variation of candidate.variations) {
        variations.push({
            name: variation.name,
            description: variation.description,
            source: variation.source,
            image: variation.image,
            color: variation.color,
            size: variation.size,
            speed: variation.speed,
            traits: await resolveRaceTraits(variation.traits, variation.name, variation.source ?? candidate.source),
            spells: await resolveRaceSpells(variation.spells, variation.name, userId),
        })
    }

    const update = {
        name: candidate.name,
        originalName: candidate.originalName,
        description: candidate.description,
        image: candidate.image,
        source: candidate.source,
        status: candidate.status,
        size: candidate.size,
        speed: candidate.speed,
        traits,
        spells,
        variations,
    }

    const updated = await RaceModel.findByIdAndUpdate(raceId, update, { new: true, runValidators: true }).lean()
    if (!updated) throw new Error("Raça não encontrada após atualização.")

    await logUpdate("Race", raceId, userId, previousDoc as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>, {
        reason: "Geração com IA a partir dos dados 5etools",
    })

    return serializeRace(updated)
}
