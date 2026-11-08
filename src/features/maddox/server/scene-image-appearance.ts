import type { Types } from "mongoose"
import { loggerFor } from "@/lib/logger"
import type { CampaignMemoryView } from "@/features/engramind/campaign-memory-format"
import {
    MADDOX_APPEARANCE_TERMS,
    MADDOX_PROFILE_SECTIONS,
    MADDOX_SCENE_IMAGE_APPEARANCE_MEMORIES_MAX,
    MADDOX_SCENE_IMAGE_APPEARANCE_MEMORIES_TIMEOUT_MS,
    MADDOX_SCENE_IMAGE_APPEARANCE_MEMORY_TEXT_MAX,
} from "../constants"
import { normalizeCatalogName } from "../catalog-markup"
import { plainText } from "../journal-search"
import { MaddoxCharacterModel, type IMaddoxCharacter } from "../models"

/**
 * Aparência dos personagens nas imagens da cena (DND-33) — SOMENTE servidor. Junta, por personagem, só o que é visual e
 * já está registrado: campos físicos da ficha, as seções "Identidade e aparência" e "Equipamentos e recursos" do perfil
 * da entrevista, a condição atual e as anotações da campanha no Engramind (só o canal dos jogadores) que citam o
 * personagem e falam da aparência. Nada é deduzido: campo vazio não aparece e personagem sem dados é marcado como "não
 * registrada". As anotações valem sobre a ficha quando a contradizem (mudanças registradas na história).
 *
 * Decisão do plano: a anotação conta como de aparência pelo vocabulário fixo `MADDOX_APPEARANCE_TERMS` (começo de
 * palavra) e precisa citar o nome do personagem como palavra inteira. A busca tem prazo; falha = sem anotações.
 */

const log = loggerFor({ module: "maddox", feature: "scene-image-appearance" })

export interface SheetFields {
    _id: Types.ObjectId
    photo?: string | null
    race?: string
    class?: string
    subclass?: string
    level?: number
    age?: string
    height?: string
    weight?: string
    eyes?: string
    skin?: string
    hair?: string
    appearance?: string
}

export interface SceneCharacter {
    character: IMaddoxCharacter
    sheet: SheetFields | null
}

export interface AppearanceNote {
    title: string
    text: string
}

export interface CharacterAppearance {
    name: string
    race: string
    classes: string
    age: string
    height: string
    weight: string
    eyes: string
    skin: string
    hair: string
    sheetAppearance: string
    identity: string
    equipment: string
    currentState: string
    notes: AppearanceNote[]
}

const keyOf = (value: string) => normalizeCatalogName(value)
const clip = (value: string | null | undefined, max: number) => {
    const text = (value ?? "").replace(/\s+/g, " ").trim()
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" }

/** HTML da ficha (aparência gravada como HTML) → texto corrido. */
export function sheetText(html: string | null | undefined): string {
    const text = (html ?? "")
        .replace(/<\s*br\s*\/?>/gi, " ")
        .replace(/<\/\s*(p|div|li|h\d)\s*>/gi, " ")
        .replace(/<[^>]*>/g, "")
        .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/gi, (_, name: string) => ENTITIES[name.toLowerCase()] ?? " ")
    return plainText(text)
}

const profileOf = (character: Pick<IMaddoxCharacter, "profile">): Record<string, string> => (character.profile instanceof Map ? Object.fromEntries(character.profile) : { ...(character.profile ?? {}) })

/** Personagens jogadores ativos (pelos nomes, sem acento e sem caixa, ou todos com a entrevista concluída) e as fichas. */
export async function loadSceneCharacters(campaignId: Types.ObjectId, names: readonly string[] | "all"): Promise<SceneCharacter[]> {
    if (names !== "all" && !names.length) return []
    const characters = await (names === "all"
        ? MaddoxCharacterModel.find({ campaignId, status: "active", "interview.status": "done" })
        : MaddoxCharacterModel.find({ campaignId, status: "active" })
    ).lean<IMaddoxCharacter[]>()
    const wanted = names === "all" ? null : new Set(names.map(keyOf))
    const picked = wanted ? characters.filter((character) => wanted.has(keyOf(character.name))) : characters
    const sheetIds = picked.map((character) => character.sheetId).filter((id): id is Types.ObjectId => Boolean(id))
    let sheets = new Map<string, SheetFields>()
    if (sheetIds.length) {
        try {
            const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
            const docs = await CharacterSheet.find({ _id: { $in: sheetIds } })
                .select("photo race class subclass level age height weight eyes skin hair appearance")
                .lean<SheetFields[]>()
            sheets = new Map(docs.map((doc) => [String(doc._id), doc]))
        } catch (error) {
            log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaignId) }, "[maddox] fichas indisponíveis para a aparência da imagem")
        }
    }
    return picked.map((character) => ({ character, sheet: character.sheetId ? (sheets.get(String(character.sheetId)) ?? null) : null }))
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const wordsOf = (value: string) => keyOf(value).split(/[^a-z0-9]+/).filter(Boolean)

/** Anotação do canal dos jogadores que cita o personagem (palavra inteira) e fala da aparência. */
export function isAppearanceMemory(memory: Pick<CampaignMemoryView, "title" | "text" | "tags" | "visibility" | "archived">, name: string): boolean {
    if (memory.visibility !== "players" || memory.archived) return false
    const needle = keyOf(name)
    if (!needle) return false
    const mentions = new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}($|[^a-z0-9])`)
    const haystack = [memory.title, memory.text, ...(memory.tags ?? [])].map(keyOf)
    if (!haystack.some((value) => mentions.test(value))) return false
    const words = wordsOf(`${memory.title} ${memory.text}`)
    return words.some((word) => MADDOX_APPEARANCE_TERMS.some((term) => word.startsWith(term)))
}

/**
 * Anotações de aparência por personagem (nome canônico → anotações), com prazo. Nunca lança: rede fora, token recusado
 * ou prazo estourado = mapa vazio (aviso no log), e a imagem segue com a ficha e o perfil.
 */
export async function appearanceMemoriesFor(campaignId: Types.ObjectId | string, names: readonly string[]): Promise<Map<string, AppearanceNote[]>> {
    const out = new Map<string, AppearanceNote[]>()
    if (!names.length) return out
    let timer: ReturnType<typeof setTimeout> | null = null
    try {
        const { searchCampaignMemories } = await import("@/features/engramind/server/campaign-memories")
        const work = Promise.all(
            names.map(async (name) => {
                const found = await searchCampaignMemories(String(campaignId), { query: name, scope: "players", reader: "maddox", limit: 20 })
                const notes = found
                    .filter((memory) => isAppearanceMemory(memory, name))
                    .slice(0, MADDOX_SCENE_IMAGE_APPEARANCE_MEMORIES_MAX)
                    .map((memory) => ({ title: clip(plainText(memory.title), 120), text: clip(plainText(memory.text), MADDOX_SCENE_IMAGE_APPEARANCE_MEMORY_TEXT_MAX) }))
                return [name, notes] as const
            }),
        )
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`busca das anotações passou de ${MADDOX_SCENE_IMAGE_APPEARANCE_MEMORIES_TIMEOUT_MS} ms`)), MADDOX_SCENE_IMAGE_APPEARANCE_MEMORIES_TIMEOUT_MS)
        })
        for (const [name, notes] of await Promise.race([work, timeout])) if (notes.length) out.set(name, notes)
        return out
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaignId) }, "[maddox] anotações de aparência indisponíveis; imagem só com a ficha e o perfil")
        return new Map()
    } finally {
        if (timer) clearTimeout(timer)
    }
}

const IDENTITY = MADDOX_PROFILE_SECTIONS.find((section) => section.key === "identidade")!.key
const EQUIPMENT = MADDOX_PROFILE_SECTIONS.find((section) => section.key === "equipamentos")!.key

/** Só o que é visual de um personagem (sem deduzir nada). */
export function characterAppearance({ character, sheet }: SceneCharacter, notes: readonly AppearanceNote[] = []): CharacterAppearance {
    const profile = profileOf(character)
    return {
        name: character.name,
        race: clip(sheet?.race, 80),
        classes: clip([sheet?.class, sheet?.subclass].filter(Boolean).join(" / "), 120),
        age: clip(sheet?.age, 60),
        height: clip(sheet?.height, 60),
        weight: clip(sheet?.weight, 60),
        eyes: clip(sheet?.eyes, 120),
        skin: clip(sheet?.skin, 120),
        hair: clip(sheet?.hair, 160),
        sheetAppearance: clip(sheetText(sheet?.appearance), 800),
        identity: clip(plainText(profile[IDENTITY] ?? ""), 600),
        equipment: clip(plainText(profile[EQUIPMENT] ?? ""), 400),
        currentState: clip(plainText(character.currentState ?? ""), 400),
        notes: [...notes],
    }
}

/** Aparências dos personagens pedidos (ou de todos os ativos com entrevista concluída), com as anotações. */
export async function loadCharacterAppearances(campaignId: Types.ObjectId, names: readonly string[] | "all"): Promise<CharacterAppearance[]> {
    const characters = await loadSceneCharacters(campaignId, names)
    const notes = await appearanceMemoriesFor(campaignId, characters.map(({ character }) => character.name))
    return characters.map((item) => characterAppearance(item, notes.get(item.character.name) ?? []))
}

const FIELDS: readonly [keyof CharacterAppearance, string][] = [
    ["race", "Raça"],
    ["classes", "Classe"],
    ["age", "Idade"],
    ["height", "Altura"],
    ["weight", "Peso"],
    ["hair", "Cabelo"],
    ["eyes", "Olhos"],
    ["skin", "Pele"],
    ["sheetAppearance", "Aparência (ficha)"],
    ["identity", "Identidade e aparência (perfil)"],
    ["equipment", "Equipamentos e recursos"],
    ["currentState", "Condição atual"],
]

const hasData = (item: CharacterAppearance) => FIELDS.some(([key]) => String(item[key] ?? "").trim()) || item.notes.length > 0

/** Bloco de aparência (texto) de cada personagem; sem dados = "não registrada", nunca um valor inventado. */
export function appearanceBlock(list: readonly CharacterAppearance[]): string {
    return list
        .map((item) => {
            const lines = [`### ${item.name}`]
            if (!hasData(item)) {
                lines.push("- (aparência não registrada: não invente traços marcantes como fatos)")
                return lines.join("\n")
            }
            for (const [key, label] of FIELDS) {
                const value = String(item[key] ?? "").trim()
                if (value) lines.push(`- ${label}: ${value}`)
            }
            if (item.notes.length) {
                lines.push("- Mudanças registradas na história (valem sobre a ficha quando a contradizem):")
                for (const note of item.notes) lines.push(`  - ${note.title ? `${note.title}: ` : ""}${note.text}`)
            }
            return lines.join("\n")
        })
        .join("\n\n")
}

/** Conferência final: uma linha por personagem com os traços físicos registrados (sem linha para quem não tem). */
export function appearanceRecap(list: readonly CharacterAppearance[]): string[] {
    return list
        .map((item) => {
            const traits = (
                [
                    ["cabelo", item.hair],
                    ["olhos", item.eyes],
                    ["pele", item.skin],
                    ["raça", item.race],
                ] as const
            )
                .filter(([, value]) => value.trim())
                .map(([label, value]) => `${label}: ${value}`)
            if (item.notes.length) traits.push("com as mudanças registradas na história")
            return traits.length ? `${item.name} — ${traits.join("; ")}` : null
        })
        .filter((line): line is string => Boolean(line))
}
