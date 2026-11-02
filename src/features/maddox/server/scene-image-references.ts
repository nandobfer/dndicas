import { Types } from "mongoose"
import { loggerFor } from "@/lib/logger"
import type { AiReferenceImage } from "@/lib/ai/image"
import { MADDOX_PROFILE_SECTIONS, MADDOX_SCENE_IMAGE_REFERENCE_BYTES_MAX, MADDOX_SCENE_IMAGE_REFERENCE_TIMEOUT_MS, MADDOX_SCENE_IMAGE_REFERENCES_MAX } from "../constants"
import { normalizeCatalogName } from "../catalog-markup"
import { MaddoxCampaignModel, MaddoxCharacterModel, MaddoxNpcModel, type IMaddoxCampaign, type IMaddoxCharacter, type IMaddoxNpc } from "../models"

/**
 * Referências de aparência das imagens do Maddox (Maddox 10) — SOMENTE servidor. Como na geração da imagem da ficha
 * (`formData`), os DADOS de quem aparece vão em JSON (perfil e ficha dos personagens, descrição pública dos NPCs — nunca as
 * notas do mestre —, entidades do catálogo) e as IMAGENS cadastradas (retrato do personagem ou, sem ele, a foto da ficha;
 * retrato do NPC; imagem do catálogo) vão ao gerador como referência, até `MADDOX_SCENE_IMAGE_REFERENCES_MAX`, na ordem
 * personagens → NPCs → catálogo. Imagem que não carrega sai da lista (aviso no log).
 */

const log = loggerFor({ module: "maddox", feature: "scene-image-references" })

export interface SceneReferenceRequest {
    campaignId: Types.ObjectId
    characters: readonly string[]
    npcs: readonly string[]
    catalog: readonly { type: string; id: string }[]
}

export interface SceneReferences {
    /** Dados de aparência (JSON do pedido ao gerador). */
    context: Record<string, unknown>
    images: AiReferenceImage[]
    /** Quem tem imagem de referência, na ordem das imagens ("Lyra (personagem)"). */
    imageLabels: string[]
}

const TEXT_MAX = 1500
const clip = (value: string | null | undefined, max = TEXT_MAX) => {
    const text = (value ?? "").trim()
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}
const keyOf = (value: string) => normalizeCatalogName(value)
const isEmpty = (item: unknown) => item === "" || item === null || item === undefined || (Array.isArray(item) ? item.length === 0 : typeof item === "object" && Object.keys(item as object).length === 0)
const compact = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([, item]) => !isEmpty(item)))

const profileOf = (character: Pick<IMaddoxCharacter, "profile">): Record<string, string> => (character.profile instanceof Map ? Object.fromEntries(character.profile) : { ...(character.profile ?? {}) })

/** Chave do storage de uma URL do proxy do app (`/api/upload?key=…`); `null` para outras URLs. */
export function storageKeyOfUrl(url: string): string | null {
    const match = /^(?:https?:\/\/[^/]+)?\/api\/upload\?(?:.*&)?key=([^&#]+)/i.exec(url.trim())
    if (!match) return null
    try {
        return decodeURIComponent(match[1]!)
    } catch {
        return null
    }
}

async function readLimited(stream: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array | null> {
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > max) {
            await reader.cancel().catch(() => undefined)
            return null
        }
        chunks.push(value)
    }
    const out = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
        out.set(chunk, offset)
        offset += chunk.byteLength
    }
    return out
}

/** Carrega uma imagem cadastrada: do storage (URL do proxy) ou por `fetch` (URL externa), com teto de tamanho e tempo. */
export async function loadReferenceImage(url: string): Promise<AiReferenceImage | null> {
    const key = storageKeyOfUrl(url)
    try {
        if (key) {
            const { getFile } = await import("@/core/storage/s3")
            const file = await getFile(key)
            if (!file.Body) return null
            const data = await readLimited(file.Body, MADDOX_SCENE_IMAGE_REFERENCE_BYTES_MAX)
            const mediaType = file.ContentType ?? ""
            return data && mediaType.startsWith("image/") ? { data, mediaType } : null
        }
        if (!/^https?:\/\//i.test(url)) return null
        const response = await fetch(url, { signal: AbortSignal.timeout(MADDOX_SCENE_IMAGE_REFERENCE_TIMEOUT_MS), cache: "no-store" })
        const mediaType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? ""
        if (!response.ok || !response.body || !mediaType.startsWith("image/")) return null
        const data = await readLimited(response.body, MADDOX_SCENE_IMAGE_REFERENCE_BYTES_MAX)
        return data ? { data, mediaType } : null
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), storageKey: key }, "[maddox] imagem de referência indisponível; seguindo sem ela")
        return null
    }
}

interface SheetFields {
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

/** Personagens jogadores da campanha pelo nome (sem acento e sem caixa). */
async function loadCharacters(campaignId: Types.ObjectId, names: readonly string[]) {
    if (!names.length) return []
    const wanted = new Set(names.map(keyOf))
    const characters = await MaddoxCharacterModel.find({ campaignId, status: "active" }).lean<IMaddoxCharacter[]>()
    const picked = characters.filter((character) => wanted.has(keyOf(character.name)))
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
            log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaignId) }, "[maddox] fichas indisponíveis para as referências da imagem")
        }
    }
    return picked.map((character) => ({ character, sheet: character.sheetId ? (sheets.get(String(character.sheetId)) ?? null) : null }))
}

function characterContext(character: IMaddoxCharacter, sheet: SheetFields | null): Record<string, unknown> {
    const profile = profileOf(character)
    const sections = Object.fromEntries(MADDOX_PROFILE_SECTIONS.map((section) => [section.label, clip(profile[section.key])]).filter(([, text]) => text))
    return compact({
        nome: character.name,
        perfil: sections,
        condicaoAtual: clip(character.currentState, 600),
        ficha: sheet
            ? compact({
                  raca: sheet.race ?? "",
                  classe: [sheet.class, sheet.subclass].filter(Boolean).join(" / "),
                  nivel: sheet.level ?? null,
                  idade: sheet.age ?? "",
                  altura: sheet.height ?? "",
                  peso: sheet.weight ?? "",
                  olhos: sheet.eyes ?? "",
                  pele: sheet.skin ?? "",
                  cabelo: sheet.hair ?? "",
                  aparencia: clip(sheet.appearance),
              })
            : null,
    })
}

/** Monta as referências (dados e imagens) de uma imagem. Nada aqui lança: o que falha fica de fora com aviso. */
export async function buildSceneReferences(request: SceneReferenceRequest): Promise<SceneReferences> {
    const [campaign, characters, npcs] = await Promise.all([
        MaddoxCampaignModel.findById(request.campaignId).select("name setting state").lean<Pick<IMaddoxCampaign, "name" | "setting" | "state">>(),
        loadCharacters(request.campaignId, request.characters).catch(() => []),
        request.npcs.length ? MaddoxNpcModel.find({ campaignId: request.campaignId, nameKey: { $in: request.npcs.map(keyOf) } }).lean<IMaddoxNpc[]>() : Promise.resolve([] as IMaddoxNpc[]),
    ])
    const catalog: { type: string; id: string; entity: Record<string, unknown>; image: string | null }[] = []
    if (request.catalog.length) {
        try {
            const [{ getCatalogEntity }, { compactCatalogEntity }] = await Promise.all([import("@/features/mcp/server/catalog-entity-service"), import("./catalog-tools")])
            for (const ref of request.catalog) {
                const entity = (await getCatalogEntity({ type: ref.type as never, id: ref.id }).catch(() => null)) as Record<string, unknown> | null
                if (!entity) continue
                const image = [entity.image, entity.imageUrl].find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? null
                catalog.push({ ...ref, entity: compactCatalogEntity(entity).entity, image })
            }
        } catch (error) {
            log.warn({ err: error instanceof Error ? error.message : String(error) }, "[maddox] catálogo indisponível para as referências da imagem")
        }
    }

    const candidates: { label: string; url: string }[] = []
    for (const { character, sheet } of characters) {
        const url = character.portraitUrl || sheet?.photo || null
        if (url) candidates.push({ label: `${character.name} (personagem)`, url })
    }
    for (const npc of npcs) if (npc.portraitUrl) candidates.push({ label: `${npc.name} (NPC)`, url: npc.portraitUrl })
    for (const item of catalog) if (item.image) candidates.push({ label: `${String(item.entity.name ?? item.id)} (${item.type})`, url: item.image })

    const images: AiReferenceImage[] = []
    const imageLabels: string[] = []
    for (const candidate of candidates) {
        if (images.length >= MADDOX_SCENE_IMAGE_REFERENCES_MAX) break
        const image = await loadReferenceImage(candidate.url)
        if (!image) continue
        images.push(image)
        imageLabels.push(candidate.label)
    }

    const context = compact({
        campanha: compact({ nome: campaign?.name ?? "", cenario: clip(campaign?.setting), localAtual: clip(campaign?.state?.location, 400) }),
        personagens: characters.map(({ character, sheet }) => characterContext(character, sheet)),
        npcs: npcs.map((npc) => compact({ nome: npc.name, descricao: clip(npc.publicDescription), situacao: npc.status })),
        catalogo: catalog.map((item) => ({ tipo: item.type, ...item.entity })),
    })
    return { context, images, imageLabels }
}
