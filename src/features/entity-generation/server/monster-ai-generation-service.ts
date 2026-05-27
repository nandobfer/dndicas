import fs from "node:fs/promises"
import path from "node:path"
import dbConnect from "@/core/database/db"
import { formatSourceDisplay } from "@/core/utils/source-utils"
import { MonsterModel } from "@/features/monsters/models/monster"
import type { CreateMonsterInput, Monster, MonsterAlignment, MonsterSize, MonsterType, NpcParam } from "@/features/monsters/types/monsters.types"
import type { AttributeType, SkillName } from "@/features/character-sheets/types/character-sheet.types"
import type { DamageTypeKey } from "@/lib/config/damage-types-hex"
import { getMonsterXp } from "@/features/monsters/utils/monster-calculations"
import { createAuditLog } from "@/features/users/api/audit-service"
import { GenAITranslator } from "../../../../scripts/seed-data/translation/genai-translator"
import { ENTITY_GENERATION_MODEL } from "./entity-generation-model"
import type { EntityGenerationProgress, GeneratedMonsterCandidate } from "../types/entity-generation.types"

type RawEntry = string | { type?: string; name?: string; entry?: string; entries?: RawEntry[]; items?: RawEntry[] }
type MonsterFluffImage = { href?: { type?: string; path?: string; url?: string } }

interface FiveEToolsMonster {
    name: string
    source: string
    page?: number
    size?: string[]
    type?: string | { type?: string | { choose?: string[] }; tags?: string[] }
    alignment?: unknown[]
    ac?: Array<number | { ac?: number; special?: string; from?: string[] }>
    hp?: { average?: number; formula?: string; special?: string }
    speed?: Record<string, unknown>
    str?: number
    dex?: number
    con?: number
    int?: number
    wis?: number
    cha?: number
    save?: Record<string, unknown>
    skill?: Record<string, unknown>
    senses?: string[]
    passive?: number
    languages?: string[]
    cr?: string | { cr?: string; xp?: number; xpLair?: number } | null
    vulnerable?: unknown[]
    resist?: unknown[]
    immune?: unknown[]
    conditionImmune?: unknown[]
    trait?: FiveEToolsActionEntry[] | null
    action?: FiveEToolsActionEntry[] | null
    bonus?: FiveEToolsActionEntry[] | null
    reaction?: FiveEToolsActionEntry[] | null
    legendary?: FiveEToolsActionEntry[] | null
    spellcasting?: FiveEToolsSpellcasting[] | null
    legendaryGroup?: { name: string; source: string }
}

interface FiveEToolsActionEntry {
    name?: string
    entries?: RawEntry[]
    entry?: string
}

interface FiveEToolsSpellcasting {
    name?: string
    headerEntries?: string[]
    will?: string[]
    daily?: Record<string, string[]>
    spells?: Record<string, { spells?: string[]; slots?: number }>
    legendary?: Record<string, string[]>
    footerEntries?: string[]
    displayAs?: "action" | "bonus" | "reaction" | "legendary"
}

interface MonsterFluff {
    name: string
    source: string
    entries?: RawEntry[]
    images?: MonsterFluffImage[]
    _copy?: {
        name: string
        source: string
        _mod?: {
            entries?: { items?: RawEntry | RawEntry[] }
            images?: { items?: MonsterFluffImage | MonsterFluffImage[] }
        }
    }
}

interface LegendaryGroup {
    name: string
    source: string
    lairActions?: RawEntry[]
    regionalEffects?: RawEntry[]
}

interface LoadedMonsterData {
    monsters: FiveEToolsMonster[]
    fluff: Map<string, MonsterFluff>
    legendaryGroups: Map<string, LegendaryGroup>
}

interface TranslationCounter {
    current: number
    total: number
    onProgress?: (progress: EntityGenerationProgress) => void | Promise<void>
}

const BESTIARY_DIR = path.join(process.cwd(), "src/lib/5etools-data/bestiary")

const VALID_MONSTER_TYPES: MonsterType[] = ["aberration", "beast", "celestial", "construct", "dragon", "elemental", "fey", "fiend", "giant", "humanoid", "monstrosity", "ooze", "plant", "undead"]
const VALID_SIZES: MonsterSize[] = ["F", "D", "T", "S", "M", "L", "H", "G", "C", "V"]

const ATTRIBUTE_MAP: Record<string, AttributeType> = {
    str: "strength",
    dex: "dexterity",
    con: "constitution",
    int: "intelligence",
    wis: "wisdom",
    cha: "charisma",
}

const SKILL_MAP: Record<string, SkillName> = {
    acrobatics: "Acrobacia",
    arcana: "Arcanismo",
    athletics: "Atletismo",
    performance: "Atuação",
    deception: "Enganação",
    stealth: "Furtividade",
    history: "História",
    intimidation: "Intimidação",
    insight: "Intuição",
    investigation: "Investigação",
    animalHandling: "Lidar com Animais",
    medicine: "Medicina",
    nature: "Natureza",
    perception: "Percepção",
    persuasion: "Persuasão",
    sleightOfHand: "Prestidigitação",
    religion: "Religião",
    survival: "Sobrevivência",
}

const DAMAGE_MAP: Record<string, DamageTypeKey> = {
    acid: "acid",
    cold: "cold",
    fire: "fire",
    force: "force",
    lightning: "lightning",
    necrotic: "necrotic",
    poison: "poison",
    radiant: "radiant",
    thunder: "thunder",
    psychic: "psychic",
    bludgeoning: "physical",
    piercing: "physical",
    slashing: "physical",
}

const DAMAGE_PT: Record<string, string> = {
    acid: "ácido",
    cold: "frio",
    fire: "fogo",
    force: "energia",
    lightning: "elétrico",
    necrotic: "necrótico",
    poison: "veneno",
    radiant: "radiante",
    thunder: "trovejante",
    psychic: "psíquico",
    bludgeoning: "concussão",
    piercing: "perfurante",
    slashing: "cortante",
}

const CONDITION_MAP = new Set(["blinded", "charmed", "deafened", "exhaustion", "frightened", "grappled", "incapacitated", "invisible", "paralyzed", "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious"])

const TAG_REPLACEMENTS: Array<[RegExp, string]> = [
    [/\{@actSaveFail\}/g, "Falha:"],
    [/\{@actSaveSuccess\}/g, "Sucesso:"],
    [/\{@actSaveSuccessOrFail\}/g, "Sucesso ou falha:"],
    [/\{@h\}/g, "Acerto: "],
    [/\{@atkr\s+m,r\}/g, "Ataque corpo a corpo ou à distância:"],
    [/\{@atkr\s+m\}/g, "Ataque corpo a corpo:"],
    [/\{@atkr\s+r\}/g, "Ataque à distância:"],
    [/\{@actSave\s+str\}/g, "Salvaguarda de Força"],
    [/\{@actSave\s+dex\}/g, "Salvaguarda de Destreza"],
    [/\{@actSave\s+con\}/g, "Salvaguarda de Constituição"],
    [/\{@actSave\s+int\}/g, "Salvaguarda de Inteligência"],
    [/\{@actSave\s+wis\}/g, "Salvaguarda de Sabedoria"],
    [/\{@actSave\s+cha\}/g, "Salvaguarda de Carisma"],
]

function createTranslator(): GenAITranslator {
    const translator = new GenAITranslator()
    translator.configure({ model: ENTITY_GENERATION_MODEL, rpm: 0, rpd: 0 })
    return translator
}

function key(name: string, source: string) {
    return `${name.toLowerCase()}|${source.toLowerCase()}`
}

function normalize(value: string | undefined): string {
    return (value ?? "").trim().toLowerCase()
}

function convertFeetToMeters(text: string): string {
    return text.replace(/(\d+)\s*ft\.?/gi, (_, feet: string) => {
        const meters = Number(feet) * 0.3
        const value = Number.isInteger(meters) ? String(meters) : meters.toFixed(1).replace(".", ",")
        return `${value}m`
    })
}

function metersFromFeet(feet: number): string {
    const meters = feet * 0.3
    return `${Number.isInteger(meters) ? meters : meters.toFixed(1).replace(".", ",")}m`
}

function cleanText(text: string): string {
    let result = text
    for (const [regex, replacement] of TAG_REPLACEMENTS) result = result.replace(regex, replacement)
    return convertFeetToMeters(result)
        .replace(/\{@recharge\s+(\d+)\}/gi, "(Recarga $1-6)")
        .replace(/\{@damage\s+([^}]+)\}/gi, "$1")
        .replace(/\{@dice\s+([^}]+)\}/gi, "$1")
        .replace(/\{@hit\s+([^}]+)\}/gi, "+$1")
        .replace(/\{@dc\s+([^}]+)\}/gi, "CD $1")
        .replace(/\{@[a-zA-Z]+\s+([^}|]+)(?:\|[^}]*)?\}/g, "$1")
        .replace(/\s+/g, " ")
        .trim()
}

function buildEntryHtml(entry: RawEntry): string {
    if (typeof entry === "string") return `<p>${cleanText(entry)}</p>`
    if (entry.entry) return `<p>${entry.name ? `<strong>${cleanText(entry.name)}.</strong> ` : ""}${cleanText(entry.entry)}</p>`
    if (entry.items?.length) return `<ul>${entry.items.map((item) => `<li>${stripParagraph(buildEntryHtml(item))}</li>`).join("")}</ul>`
    if (entry.entries?.length) {
        const content = entry.entries.map(buildEntryHtml).join("")
        return entry.name ? `<p><strong>${cleanText(entry.name)}.</strong></p>${content}` : content
    }
    return ""
}

function stripParagraph(html: string): string {
    return html.replace(/^<p>/, "").replace(/<\/p>$/, "")
}

function buildEntriesHtml(entries?: RawEntry[]): string {
    return (entries ?? []).map(buildEntryHtml).join("")
}

function formatSpeedValue(value: unknown): string | undefined {
    if (typeof value === "number") return metersFromFeet(value)
    if (typeof value === "object" && value !== null) {
        const obj = value as { number?: number; condition?: string }
        if (typeof obj.number === "number") return `${metersFromFeet(obj.number)}${obj.condition ? ` ${cleanText(obj.condition)}` : ""}`
    }
    if (value === true) return "igual ao deslocamento"
    return undefined
}

function mapSpeed(speed?: Record<string, unknown>) {
    const walk = formatSpeedValue(speed?.walk) ?? "9m"
    const burrow = formatSpeedValue(speed?.burrow)
    return {
        speed: burrow ? `${walk}, escavação ${burrow}` : walk,
        flySpeed: formatSpeedValue(speed?.fly),
        swimSpeed: formatSpeedValue(speed?.swim),
        climbSpeed: formatSpeedValue(speed?.climb),
    }
}

function mapMonsterType(type: FiveEToolsMonster["type"]): MonsterType {
    if (typeof type === "string" && VALID_MONSTER_TYPES.includes(type as MonsterType)) return type as MonsterType
    if (typeof type === "object" && type) {
        if (typeof type.type === "string" && VALID_MONSTER_TYPES.includes(type.type as MonsterType)) return type.type as MonsterType
        if (typeof type.type === "object") {
            const chosen = type.type.choose?.find((item) => VALID_MONSTER_TYPES.includes(item as MonsterType))
            if (chosen) return chosen as MonsterType
        }
    }
    return "monstrosity"
}

function mapSize(size?: string[]): MonsterSize {
    if (!size?.length) return "M"
    if (size.length > 1) return "V"
    return VALID_SIZES.includes(size[0] as MonsterSize) ? (size[0] as MonsterSize) : "M"
}

function mapAlignment(alignment?: unknown[]): MonsterAlignment {
    if (!alignment?.length) return "unaligned"
    if (alignment.some((item) => item === "U")) return "unaligned"
    if (alignment.some((item) => item === "A" || typeof item === "object")) return "any"
    const joined = alignment.filter((item): item is string => typeof item === "string").join("")
    if (["LG", "NG", "CG", "LN", "N", "CN", "LE", "NE", "CE"].includes(joined)) return joined as MonsterAlignment
    return "any"
}

function mapChallengeRating(cr: FiveEToolsMonster["cr"]): string {
    if (typeof cr === "string") return cr
    if (cr?.cr) return cr.cr
    return "0"
}

function parseSigned(value: unknown): number | undefined {
    if (typeof value === "number") return Number.isFinite(value) ? value : undefined
    if (typeof value !== "string") return undefined
    const parsed = Number(value.replace("+", "").trim())
    return Number.isFinite(parsed) ? parsed : undefined
}

function mapSavingThrows(save?: Record<string, unknown>): CreateMonsterInput["savingThrows"] {
    return Object.fromEntries(
        Object.entries(save ?? {})
            .map(([rawKey, value]) => {
                const attribute = ATTRIBUTE_MAP[rawKey]
                const override = parseSigned(value)
                return attribute && override !== undefined ? [attribute, { proficient: false, override }] : null
            })
            .filter((item): item is [AttributeType, { proficient: boolean; override: number }] => item !== null),
    )
}

function mapSkills(skill?: Record<string, unknown>): CreateMonsterInput["skills"] {
    return Object.fromEntries(
        Object.entries(skill ?? {})
            .map(([rawKey, value]) => {
                const skillName = SKILL_MAP[rawKey]
                const override = parseSigned(value)
                return skillName && override !== undefined ? [skillName, { proficient: false, expertise: false, override }] : null
            })
            .filter((item): item is [SkillName, { proficient: boolean; expertise: boolean; override: number }] => item !== null),
    )
}

function flattenStrings(values: unknown[] | undefined): string[] {
    const result: string[] = []
    for (const value of values ?? []) {
        if (typeof value === "string") result.push(value)
        else if (typeof value === "object" && value !== null) {
            const obj = value as Record<string, unknown>
            for (const nested of ["resist", "immune", "vulnerable", "conditionImmune"]) {
                if (Array.isArray(obj[nested])) result.push(...flattenStrings(obj[nested] as unknown[]))
            }
        }
    }
    return result
}

function mapDamageList(values: unknown[] | undefined): DamageTypeKey[] {
    return Array.from(new Set(flattenStrings(values).map((value) => DAMAGE_MAP[value.toLowerCase()]).filter(Boolean)))
}

function mapConditionImmunities(values: unknown[] | undefined) {
    const names = flattenStrings(values).filter((value) => CONDITION_MAP.has(value))
    const notes = (values ?? [])
        .filter((value) => typeof value === "object" && value !== null && typeof (value as { note?: unknown }).note === "string")
        .map((value) => cleanText(String((value as { note: string }).note)))
    return {
        conditionImmunities: Array.from(new Set(names)) as CreateMonsterInput["conditionImmunities"],
        conditionImmunityNotes: notes.join("; ") || undefined,
    }
}

function extractAttackRoll(text: string): number | undefined {
    const match = text.match(/\{@hit\s+([+-]?\d+)\}/i)
    return match ? Number(match[1]) : undefined
}

function extractHitRoll(text: string): string | undefined {
    const parts: string[] = []
    const regex = /\{@(?:damage|dice)\s+([^}]+)\}/gi
    const matches = Array.from(text.matchAll(regex))
    matches.forEach((match, index) => {
        const dice = cleanText(match[1])
        const nextIndex = matches[index + 1]?.index
        const tail = text.slice((match.index ?? 0) + match[0].length, nextIndex ?? undefined)
        const damage = Object.keys(DAMAGE_PT).find((type) => new RegExp(`\\b${type}\\b`, "i").test(tail))
        parts.push(damage ? `${dice} ${DAMAGE_PT[damage]}` : dice)
    })
    return parts.length ? parts.join(" + ") : undefined
}

function extractRecharge(name?: string): string | undefined {
    const match = name?.match(/\{@recharge\s+(\d+)\}/i)
    return match ? `${match[1]}-6` : undefined
}

function mapNpcParams(entries?: FiveEToolsActionEntry[] | null): NpcParam[] {
    return (entries ?? []).map((entry, index) => {
        const rawText = [entry.name ?? "", ...(entry.entries ?? []), entry.entry ?? ""].map((part) => (typeof part === "string" ? part : JSON.stringify(part))).join(" ")
        return {
            label: cleanText(entry.name || `Opção ${index + 1}`),
            description: buildEntriesHtml(entry.entries ?? (entry.entry ? [entry.entry] : [])) || `<p>${cleanText(entry.name || `Opção ${index + 1}`)}</p>`,
            attackRoll: extractAttackRoll(rawText),
            hitRoll: extractHitRoll(rawText),
            recharge: extractRecharge(entry.name),
        }
    })
}

function mapLegendaryEntries(entries?: RawEntry[]): NpcParam[] {
    if (!entries?.length) return []
    const params: NpcParam[] = []
    let intro: string[] = []
    entries.forEach((entry) => {
        if (typeof entry === "string") {
            intro.push(entry)
            return
        }
        if (entry.items?.length) {
            entry.items.forEach((item, index) => {
                if (typeof item === "object" && item.name) params.push({ label: cleanText(item.name), description: buildEntriesHtml([...intro, item]) })
                else params.push({ label: `Opção ${params.length + index + 1}`, description: buildEntriesHtml([...intro, item]) })
            })
            intro = []
            return
        }
        params.push({ label: cleanText(entry.name || `Opção ${params.length + 1}`), description: buildEntriesHtml([...intro, entry]) })
        intro = []
    })
    if (intro.length) params.push({ label: "Descrição", description: buildEntriesHtml(intro) })
    return params
}

function spellcastingToParam(spellcasting: FiveEToolsSpellcasting): NpcParam {
    const entries: RawEntry[] = [...(spellcasting.headerEntries ?? [])]
    if (spellcasting.will?.length) entries.push({ type: "list", name: "À vontade", items: spellcasting.will })
    for (const [uses, spells] of Object.entries(spellcasting.daily ?? {})) entries.push({ type: "list", name: `${uses}/dia`, items: spells })
    for (const [level, data] of Object.entries(spellcasting.spells ?? {})) entries.push({ type: "list", name: `Círculo ${level}`, items: data.spells ?? [] })
    for (const [uses, spells] of Object.entries(spellcasting.legendary ?? {})) entries.push({ type: "list", name: `${uses} ação lendária`, items: spells })
    entries.push(...(spellcasting.footerEntries ?? []))
    return {
        label: cleanText(spellcasting.name || "Spellcasting"),
        description: buildEntriesHtml(entries),
        attackRoll: extractAttackRoll(entries.join(" ")),
    }
}

function buildImageUrl(fluff?: MonsterFluff): string {
    const image = fluff?.images?.[0]
    if (image?.href?.type === "internal" && image.href.path) return `https://5e.tools/img/${image.href.path}`
    if (image?.href?.url) return image.href.url
    return ""
}

function normalizeFluffItems<T>(items?: T | T[]): T[] {
    if (items === undefined) return []
    return Array.isArray(items) ? items : [items]
}

function resolveFluff(monster: FiveEToolsMonster, fluffMap: Map<string, MonsterFluff>): MonsterFluff | undefined {
    const direct = fluffMap.get(key(monster.name, monster.source))
    if (!direct?._copy) return direct
    const base = fluffMap.get(key(direct._copy.name, direct._copy.source))
    const mod = direct._copy._mod
    return {
        ...direct,
        entries: [...normalizeFluffItems(mod?.entries?.items), ...(direct.entries ?? []), ...(base?.entries ?? [])],
        images: [...normalizeFluffItems(mod?.images?.items), ...(direct.images ?? []), ...(base?.images ?? [])],
    }
}

async function loadMonsterData(): Promise<LoadedMonsterData> {
    const files = await fs.readdir(BESTIARY_DIR)
    const bestiaryFiles = files.sort().filter((file) => /^bestiary-.*\.json$/.test(file))
    const monsters: FiveEToolsMonster[] = []
    const fluff = new Map<string, MonsterFluff>()
    const legendaryGroups = new Map<string, LegendaryGroup>()

    for (const file of bestiaryFiles) {
        const data = JSON.parse(await fs.readFile(path.join(BESTIARY_DIR, file), "utf8")) as { monster?: FiveEToolsMonster[] }
        monsters.push(...(data.monster ?? []))

        const fluffFile = `fluff-${file}`
        if (files.includes(fluffFile)) {
            const fluffData = JSON.parse(await fs.readFile(path.join(BESTIARY_DIR, fluffFile), "utf8")) as { monsterFluff?: MonsterFluff[] }
            for (const item of fluffData.monsterFluff ?? []) fluff.set(key(item.name, item.source), item)
        }
    }

    const legendaryPath = path.join(BESTIARY_DIR, "legendarygroups.json")
    const legendaryData = JSON.parse(await fs.readFile(legendaryPath, "utf8")) as { legendaryGroup?: LegendaryGroup[] }
    for (const item of legendaryData.legendaryGroup ?? []) legendaryGroups.set(key(item.name, item.source), item)

    return { monsters, fluff, legendaryGroups }
}

function shouldTranslateSpecialStatText(value: string): boolean {
    const normalized = cleanText(value)
    const leftover = normalized
        .toLowerCase()
        .replace(/\b\d+d\d+\b/g, "")
        .replace(/\b\d+\b/g, "")
        .replace(/[+\-*/x×÷=<>~\s()[\]{}.,;:/\\|%]+/g, "")
    return leftover.length > 0
}

async function translateSpecialStatValue(translator: GenAITranslator, value: string): Promise<string> {
    const normalized = cleanText(value)
    if (!shouldTranslateSpecialStatText(normalized)) return normalized
    const { name } = await translator.translateItem(normalized, `<p>${normalized}</p>`)
    return name.trim()
}

async function mapArmorClass(monster: FiveEToolsMonster, translator: GenAITranslator): Promise<string> {
    const first = monster.ac?.[0]
    if (typeof first === "number") return String(first)
    if (first?.ac !== undefined) return String(first.ac)
    if (first?.special) return translateSpecialStatValue(translator, first.special)
    return "10"
}

async function mapHitPoints(monster: FiveEToolsMonster, translator: GenAITranslator): Promise<string> {
    if (monster.hp?.formula) return monster.hp.formula
    if (monster.hp?.special) return translateSpecialStatValue(translator, monster.hp.special)
    if (monster.hp?.average !== undefined) return String(monster.hp.average)
    return "1"
}

async function translateParams(params: NpcParam[], translator: GenAITranslator, counter: TranslationCounter, message: string): Promise<NpcParam[]> {
    const translated: NpcParam[] = []
    for (const param of params) {
        const result = await translator.translateItem(param.label, param.description)
        counter.current += 1
        await counter.onProgress?.({ current: counter.current, total: counter.total, message })
        translated.push({ ...param, label: result.name, description: result.description })
    }
    return translated
}

function countParams(monster: FiveEToolsMonster, legendaryGroup?: LegendaryGroup): number {
    const spellcasting = monster.spellcasting ?? []
    return (
        1 +
        (monster.senses?.length ? 3 : 2) +
        mapNpcParams(monster.trait).length +
        mapNpcParams(monster.action).length +
        mapNpcParams(monster.bonus).length +
        mapNpcParams(monster.reaction).length +
        mapNpcParams(monster.legendary).length +
        spellcasting.length +
        mapLegendaryEntries(legendaryGroup?.lairActions).length +
        mapLegendaryEntries(legendaryGroup?.regionalEffects).length
    )
}

async function buildCandidate(monster: FiveEToolsMonster, data: LoadedMonsterData, translator: GenAITranslator, counter: TranslationCounter, currentImage?: string): Promise<GeneratedMonsterCandidate> {
    const fluff = resolveFluff(monster, data.fluff)
    const descriptionHtml = buildEntriesHtml(fluff?.entries) || `<p>${monster.name}</p>`
    const translated = await translator.translateItem(monster.name, descriptionHtml)
    counter.current += 1
    await counter.onProgress?.({ current: counter.current, total: counter.total, message: `Gerando monstro ${monster.name}` })

    const spellcasting = monster.spellcasting ?? []
    const spellParams = spellcasting.map(spellcastingToParam)
    const actionSpells = spellParams.filter((_, index) => (spellcasting[index].displayAs ?? "action") === "action")
    const bonusSpells = spellParams.filter((_, index) => spellcasting[index].displayAs === "bonus")
    const reactionSpells = spellParams.filter((_, index) => spellcasting[index].displayAs === "reaction")
    const legendarySpells = spellParams.filter((_, index) => spellcasting[index].displayAs === "legendary")
    const legendaryGroup = monster.legendaryGroup ? data.legendaryGroups.get(key(monster.legendaryGroup.name, monster.legendaryGroup.source)) : undefined
    const challengeRating = mapChallengeRating(monster.cr)
    const { conditionImmunities, conditionImmunityNotes } = mapConditionImmunities(monster.conditionImmune)
    const image = buildImageUrl(fluff) || currentImage || ""

    return {
        candidateId: `${monster.name}:${monster.source}:${monster.page ?? ""}`,
        matchLabel: `${monster.name} (${formatSourceDisplay(monster.source, monster.page)})`,
        name: translated.name,
        originalName: monster.name,
        source: formatSourceDisplay(monster.source, monster.page),
        description: translated.description,
        image,
        status: "active",
        type: mapMonsterType(monster.type),
        size: mapSize(monster.size),
        alignment: mapAlignment(monster.alignment),
        armorClass: await mapArmorClass(monster, translator),
        initiative: undefined,
        hitPointsFormula: await mapHitPoints(monster, translator),
        ...mapSpeed(monster.speed),
        attributes: {
            strength: monster.str ?? 10,
            dexterity: monster.dex ?? 10,
            constitution: monster.con ?? 10,
            intelligence: monster.int ?? 10,
            wisdom: monster.wis ?? 10,
            charisma: monster.cha ?? 10,
        },
        savingThrows: mapSavingThrows(monster.save),
        skills: mapSkills(monster.skill),
        senses: { passivePerception: monster.passive },
        sensesAndLanguages: await translateParams(
            [
                ...(monster.senses?.length ? [{ label: "Senses", description: `<p>${cleanText(monster.senses.join(", "))}</p>` }] : []),
                { label: "Passive Perception", description: `<p>${monster.passive ?? 10}</p>` },
                { label: "Languages", description: `<p>${cleanText(monster.languages?.join(", ") || "—")}</p>` },
            ],
            translator,
            counter,
            "Gerando monstro",
        ),
        challengeRating,
        experience: monster.cr ? getMonsterXp(challengeRating) : 0,
        languages: cleanText(monster.languages?.join(", ") || "—"),
        damageVulnerabilities: mapDamageList(monster.vulnerable),
        damageResistances: mapDamageList(monster.resist),
        damageImmunities: mapDamageList(monster.immune),
        conditionImmunities,
        conditionImmunityNotes,
        traits: await translateParams(mapNpcParams(monster.trait), translator, counter, "Gerando características"),
        actions: await translateParams([...mapNpcParams(monster.action), ...actionSpells], translator, counter, "Gerando ações"),
        bonusActions: await translateParams([...mapNpcParams(monster.bonus), ...bonusSpells], translator, counter, "Gerando ações bônus"),
        reactions: await translateParams([...mapNpcParams(monster.reaction), ...reactionSpells], translator, counter, "Gerando reações"),
        legendaryActions: await translateParams([...mapNpcParams(monster.legendary), ...legendarySpells], translator, counter, "Gerando ações lendárias"),
        legendaryActionUses: monster.legendary?.length || legendarySpells.length ? 3 : undefined,
        lairActions: await translateParams(mapLegendaryEntries(legendaryGroup?.lairActions), translator, counter, "Gerando ações de covil"),
        lairActionInitiative: legendaryGroup?.lairActions?.length ? 20 : undefined,
        regionalEffects: await translateParams(mapLegendaryEntries(legendaryGroup?.regionalEffects), translator, counter, "Gerando efeitos regionais"),
    }
}

function findMatchingMonsters(current: Monster, monsters: FiveEToolsMonster[]): FiveEToolsMonster[] {
    const originalName = normalize(current.originalName)
    const currentName = normalize(current.name)
    const exactOriginal = monsters.filter((monster) => originalName && normalize(monster.name) === originalName)
    if (exactOriginal.length) return exactOriginal
    return monsters.filter((monster) => normalize(monster.name) === currentName)
}

function serializeMonster(value: Record<string, unknown>): Monster {
    const savingThrows = value.savingThrows instanceof Map ? Object.fromEntries(value.savingThrows) : value.savingThrows || {}
    const skills = value.skills instanceof Map ? Object.fromEntries(value.skills) : value.skills || {}
    return {
        ...value,
        id: String(value._id),
        _id: String(value._id),
        savingThrows,
        skills,
        createdAt: value.createdAt instanceof Date ? value.createdAt.toISOString() : String(value.createdAt ?? ""),
        updatedAt: value.updatedAt instanceof Date ? value.updatedAt.toISOString() : String(value.updatedAt ?? ""),
    } as unknown as Monster
}

export async function generateMonsterCandidates(
    monsterId: string,
    onProgress?: (progress: EntityGenerationProgress) => void | Promise<void>,
): Promise<{ current: Monster; candidates: GeneratedMonsterCandidate[] }> {
    await dbConnect()

    const currentDoc = await MonsterModel.findById(monsterId).lean()
    if (!currentDoc) throw new Error("Monstro não encontrado.")

    const current = serializeMonster(currentDoc as unknown as Record<string, unknown>)
    const data = await loadMonsterData()
    const matches = findMatchingMonsters(current, data.monsters)

    if (!matches.length) {
        await onProgress?.({ current: 1, total: 1, message: "Nenhuma correspondência encontrada." })
        return { current, candidates: [] }
    }

    const total = matches.reduce((sum, monster) => {
        const legendaryGroup = monster.legendaryGroup ? data.legendaryGroups.get(key(monster.legendaryGroup.name, monster.legendaryGroup.source)) : undefined
        return sum + countParams(monster, legendaryGroup)
    }, 0)
    const counter: TranslationCounter = { current: 0, total: Math.max(total, 1), onProgress }
    const translator = createTranslator()
    const candidates: GeneratedMonsterCandidate[] = []
    for (const match of matches) {
        candidates.push(await buildCandidate(match, data, translator, counter, current.image))
    }

    return { current, candidates }
}

export async function applyMonsterGenerationCandidate(monsterId: string, candidate: GeneratedMonsterCandidate, userId: string): Promise<Monster> {
    await dbConnect()

    const previous = await MonsterModel.findById(monsterId).lean()
    if (!previous) throw new Error("Monstro não encontrado.")

    const update: CreateMonsterInput = {
        ...candidate,
        image: candidate.image || String(previous.image ?? ""),
    }

    const updated = await MonsterModel.findByIdAndUpdate(monsterId, { $set: update }, { new: true, runValidators: true }).lean()
    if (!updated) throw new Error("Monstro não encontrado após atualização.")

    const previousSerialized = serializeMonster(previous as unknown as Record<string, unknown>)
    const updatedSerialized = serializeMonster(updated as unknown as Record<string, unknown>)
    await createAuditLog({
        action: "UPDATE",
        entity: "Monstro",
        entityId: String(updatedSerialized._id),
        performedBy: userId,
        previousData: previousSerialized as unknown as Record<string, unknown>,
        newData: updatedSerialized as unknown as Record<string, unknown>,
    })

    return updatedSerialized
}
