import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import {
    MADDOX_SCENE_IMAGE_CAPTION_MAX,
    MADDOX_SCENE_IMAGE_CONCURRENCY,
    MADDOX_SCENE_IMAGE_CONSUMPTION_ORIGIN,
    MADDOX_SCENE_IMAGE_DESCRIPTION_MAX,
    MADDOX_SCENE_IMAGE_FAILED_MESSAGE,
    MADDOX_SCENE_IMAGE_SITUATION_DEFS,
    MADDOX_SCENE_IMAGE_SITUATIONS,
    MADDOX_SCENE_IMAGE_STALE_MS,
    MADDOX_SCENE_IMAGE_TIMEOUT_MS,
    MADDOX_SCENE_IMAGE_WINDOW_MS,
    type MaddoxSceneImageSituation,
    type MaddoxSceneImageSlot,
    type MaddoxSceneImageSource,
} from "../constants"
import type { MaddoxGameSceneImageDto, MaddoxSceneImageControlDto } from "../game-types"
import { INCLUDE_DISCARDED, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxNpcModel, MaddoxSceneImageModel, type IMaddoxCampaign, type IMaddoxNpc, type IMaddoxSceneImage } from "../models"
import { DEFAULT_MADDOX_SCENE_IMAGES, type MaddoxSettings, type MaddoxSceneImagesSettings } from "../schemas"
import { appearanceBlock, appearanceRecap, type CharacterAppearance } from "./scene-image-appearance"

/**
 * Imagens nas cenas (Maddox 10) — SOMENTE servidor. Quatro origens: a ferramenta do narrador (`request_scene_image`,
 * ligada à narração gravada), o fim de batalha (automático, com a cena final), o pedido manual do dono e o retrato de NPC
 * (`save_npc { gerarRetrato }`, "Gerar retrato" do dono ou o retrato automático do NPC conhecido, DND-43).
 *
 * - **Situações**: fixas (`MADDOX_SCENE_IMAGE_SITUATIONS`) e personalizadas da aba, cada uma com chave ativa; a chave da
 *   campanha (`campaign.sceneImages`) desliga as automáticas (o pedido manual continua).
 * - **Frequência**: as automáticas (`slot: "auto"`) respeitam o intervalo em turnos do mestre e no máximo uma por turno
 *   (índice único parcial); TODAS as origens contam no teto das últimas 24 h. `failed` e `skipped` liberam a vaga.
 * - **Geração em segundo plano**, fora da fila da campanha (o turno não espera), no máximo
 *   `MADDOX_SCENE_IMAGE_CONCURRENCY` por vez, com teto de duração; ao terminar, a mesa é avisada.
 */

const log = loggerFor({ module: "maddox", feature: "scene-images" })

// ── Configuração ───────────────────────────────────────────────────────────────

export interface SceneSituation {
    key: string
    label: string
    description: string
    custom: boolean
}

/** Situações ativas (fixas na ordem da lista + personalizadas ativas). */
export function activeSituations(settings: MaddoxSceneImagesSettings): SceneSituation[] {
    const fixed = MADDOX_SCENE_IMAGE_SITUATIONS.filter((key) => settings.situations?.[key]).map((key) => ({ key, ...MADDOX_SCENE_IMAGE_SITUATION_DEFS[key], custom: false }))
    const custom = (settings.custom ?? []).filter((item) => item.active).map((item) => ({ key: item.id, label: item.label, description: item.description, custom: true }))
    return [...fixed, ...custom]
}

/** Situações que o narrador pede pela ferramenta (fim de batalha é automático; retrato vem do `save_npc`). */
export function toolSituations(settings: MaddoxSceneImagesSettings): SceneSituation[] {
    return activeSituations(settings).filter((item) => item.key !== "combat-end" && item.key !== "npc-portrait")
}

/** Rótulo de uma situação fixa ou personalizada (mesmo inativa). */
export function situationLabel(settings: MaddoxSceneImagesSettings | null, key: string | null): string | null {
    if (!key) return null
    if ((MADDOX_SCENE_IMAGE_SITUATIONS as readonly string[]).includes(key)) return MADDOX_SCENE_IMAGE_SITUATION_DEFS[key as MaddoxSceneImageSituation].label
    return settings?.custom?.find((item) => item.id === key)?.label ?? null
}

export interface SceneImageEnvironment {
    settings: MaddoxSettings
    generator: { available: boolean; reason: string | null; supportsReferences: boolean }
}

/** Configuração do Maddox e disponibilidade do Gerador de imagens. */
export async function loadSceneImageEnvironment(): Promise<SceneImageEnvironment> {
    const [{ loadMaddoxSettings }, aiSettings, { imageModelSupportsReferences }, { isAiImageProviderId }] = await Promise.all([
        import("./settings"),
        import("@/features/ai/server/settings"),
        import("@/lib/ai/image"),
        import("@/lib/ai/providers"),
    ])
    const [{ settings }, { settings: generator }] = await Promise.all([loadMaddoxSettings(), aiSettings.loadImageGeneratorSettings()])
    const availability = await aiSettings.availabilityOfImageGenerator(generator)
    const available = availability.available && Boolean(generator.provider && generator.model)
    return {
        // Configurações de testes/legado sem o bloco recebem o padrão (tudo desligado).
        settings: { ...settings, sceneImages: settings.sceneImages ?? DEFAULT_MADDOX_SCENE_IMAGES },
        generator: {
            available,
            reason: available ? null : (availability.reason ?? "O Gerador de imagens não está configurado em Integrações › Provedores de IA."),
            supportsReferences: Boolean(generator.provider && generator.model && isAiImageProviderId(generator.provider) && imageModelSupportsReferences(generator.provider, generator.model)),
        },
    }
}

// ── Cota ───────────────────────────────────────────────────────────────────────

export interface SceneImageQuota {
    allowed: boolean
    reason: string | null
    /** Primeiro turno em que a próxima automática pode sair (`null` = já pode, ou sem intervalo). */
    nextTurn: number | null
    remainingToday: number
}

const windowStart = () => new Date(Date.now() - MADDOX_SCENE_IMAGE_WINDOW_MS)

/** Cota da campanha para um pedido: teto diário (todas as origens) e, nas automáticas, intervalo e uma por turno. */
export async function sceneImageQuota(campaignId: Types.ObjectId, turnNumber: number, settings: MaddoxSceneImagesSettings, slot: MaddoxSceneImageSlot): Promise<SceneImageQuota> {
    // As imagens descartadas por uma volta a um turno (DND-44) continuam no teto diário.
    const today = await MaddoxSceneImageModel.countDocuments({ campaignId, counts: true, createdAt: { $gte: windowStart() } }).setOptions(INCLUDE_DISCARDED)
    const remainingToday = Math.max(0, settings.maxPerDay - today)
    if (remainingToday === 0) return { allowed: false, reason: `Limite de ${settings.maxPerDay} imagens por dia desta campanha atingido.`, nextTurn: null, remainingToday }
    if (slot !== "auto") return { allowed: true, reason: null, nextTurn: null, remainingToday }
    const last = await MaddoxSceneImageModel.findOne({ campaignId, slot: "auto", counts: true }).sort({ turnNumber: -1 }).select("turnNumber").lean<{ turnNumber: number }>()
    if (last && last.turnNumber === turnNumber) return { allowed: false, reason: "Já há uma imagem nesta narração: uma por turno.", nextTurn: turnNumber + 1, remainingToday }
    const nextTurn = last ? last.turnNumber + settings.minNarrationsBetween : null
    if (nextTurn !== null && turnNumber < nextTurn) return { allowed: false, reason: `Intervalo entre imagens: a próxima pode sair a partir do turno ${nextTurn}.`, nextTurn, remainingToday }
    return { allowed: true, reason: null, nextTurn: null, remainingToday }
}

// ── Pedido ─────────────────────────────────────────────────────────────────────

export interface SceneImageRequest {
    campaignId: Types.ObjectId
    source: MaddoxSceneImageSource
    turnNumber: number
    segment?: number
    messageId?: Types.ObjectId | null
    npcId?: Types.ObjectId | null
    situation: string | null
    description: string
    caption: string
    characters?: readonly string[]
    npcs?: readonly string[]
    catalog?: readonly { type: string; id: string }[]
    requestedBy?: string | null
    /** Pedido do dono (manual ou "Gerar retrato"): ignora situações, chave da campanha e intervalo; só o teto diário. */
    byOwner?: boolean
    /** Retrato automático (DND-43): a chave `autoPortraits` substitui a situação ativa; o resto da regra vale. */
    auto?: boolean
}

export type SceneImageDecision = { ok: true } | { ok: false; reason: string }

const slotOf = (source: MaddoxSceneImageSource): MaddoxSceneImageSlot => (source === "manual" ? "manual" : source === "npc-portrait" ? "portrait" : "auto")

/** Pode pedir? (configuração, situação, chave da campanha, Gerador e cota). Não grava nada. */
export async function checkSceneImageRequest(request: Pick<SceneImageRequest, "campaignId" | "source" | "turnNumber" | "situation" | "byOwner" | "auto">, env: SceneImageEnvironment): Promise<SceneImageDecision> {
    const scene = env.settings.sceneImages
    if (!request.byOwner) {
        if (!scene?.enabled) return { ok: false, reason: "As imagens nas cenas estão desligadas na configuração do Maddox." }
        const campaign = await MaddoxCampaignModel.findById(request.campaignId).select("sceneImages").lean<Pick<IMaddoxCampaign, "sceneImages">>()
        if (campaign?.sceneImages === false) return { ok: false, reason: "O dono desligou as imagens automáticas nesta campanha." }
        const active = activeSituations(scene)
        if (request.auto) {
            if (request.source !== "npc-portrait" || scene.autoPortraits !== true) return { ok: false, reason: "O retrato automático de NPC está desligado na configuração do Maddox." }
        } else if (!request.situation || !active.some((item) => item.key === request.situation)) {
            return { ok: false, reason: `Situação "${request.situation ?? ""}" não está ativa. Situações ativas: ${active.map((item) => `${item.key} (${item.label})`).join(", ") || "nenhuma"}.` }
        }
    }
    if (!env.generator.available) return { ok: false, reason: env.generator.reason ?? "O Gerador de imagens não está disponível." }
    const quota = await sceneImageQuota(request.campaignId, request.turnNumber, scene, slotOf(request.source))
    return quota.allowed ? { ok: true } : { ok: false, reason: quota.reason ?? "Limite de imagens atingido." }
}

const isDuplicateKey = (error: unknown) => typeof error === "object" && error !== null && (error as { code?: number }).code === 11000
const clip = (value: string | null | undefined, max: number) => {
    const text = (value ?? "").trim()
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/**
 * Valida, reserva a vaga (documento `pending`) e dispara a geração em segundo plano. Devolve o documento reservado ou
 * `null` com o motivo (fora da cota, situação inativa…: nada é gerado, motivo no log).
 */
export async function scheduleSceneImage(request: SceneImageRequest, env?: SceneImageEnvironment): Promise<{ image: IMaddoxSceneImage | null; reason: string | null }> {
    const environment = env ?? (await loadSceneImageEnvironment())
    const decision = await checkSceneImageRequest(request, environment)
    if (!decision.ok) {
        log.info({ campaignId: String(request.campaignId), source: request.source, situation: request.situation, reason: decision.reason }, "[maddox] imagem da cena não pedida")
        return { image: null, reason: decision.reason }
    }
    const image = await reserveSceneImage(request, environment.settings.sceneImages)
    if (!image) return { image: null, reason: "Limite de imagens atingido." }
    startSceneImage(String(image._id))
    return { image, reason: null }
}

/** Grava o pedido ocupando a vaga. Corrida: a duplicata do turno e o que passou do teto viram `skipped` (sem vaga). */
export async function reserveSceneImage(request: SceneImageRequest, scene: MaddoxSceneImagesSettings): Promise<IMaddoxSceneImage | null> {
    const base = {
        campaignId: request.campaignId,
        turnNumber: request.turnNumber,
        segment: request.segment ?? 0,
        messageId: request.messageId ?? null,
        npcId: request.npcId ?? null,
        source: request.source,
        slot: slotOf(request.source),
        situation: request.situation,
        description: clip(request.description, MADDOX_SCENE_IMAGE_DESCRIPTION_MAX),
        caption: clip(request.caption, MADDOX_SCENE_IMAGE_CAPTION_MAX),
        references: { characters: [...(request.characters ?? [])], npcs: [...(request.npcs ?? [])], catalog: [...(request.catalog ?? [])] },
        requestedBy: request.requestedBy ?? null,
    }
    let created: IMaddoxSceneImage
    try {
        created = (await MaddoxSceneImageModel.create({ ...base, status: "pending", counts: true })).toObject()
    } catch (error) {
        if (!isDuplicateKey(error)) throw error
        await MaddoxSceneImageModel.create({ ...base, status: "skipped", counts: false, skipReason: "duplicate-turn" })
        log.info({ campaignId: String(request.campaignId), turnNumber: request.turnNumber, source: request.source }, "[maddox] imagem descartada: já há uma automática neste turno")
        return null
    }
    // Pedidos simultâneos: só os primeiros (pela ordem do `_id`) dentro do teto ficam com a vaga.
    const rank = await MaddoxSceneImageModel.countDocuments({ campaignId: request.campaignId, counts: true, createdAt: { $gte: windowStart() }, _id: { $lte: created._id } }).setOptions(INCLUDE_DISCARDED)
    if (rank > scene.maxPerDay) {
        await MaddoxSceneImageModel.updateOne({ _id: created._id }, { $set: { status: "skipped", counts: false, skipReason: "daily-limit" } })
        log.info({ campaignId: String(request.campaignId), source: request.source }, "[maddox] imagem descartada: teto diário atingido")
        return null
    }
    return created
}

// ── Geração em segundo plano ───────────────────────────────────────────────────

interface SceneImageRuntime {
    running: Map<string, Promise<void>>
    /** Imagens manuais reservadas que esperam a descrição na fila da campanha (ainda não começaram a gerar). */
    queued: Set<string>
    active: number
    waiting: (() => void)[]
}
const globalRuntime = globalThis as unknown as { __maddoxSceneImages?: SceneImageRuntime }
const runtime: SceneImageRuntime = (globalRuntime.__maddoxSceneImages ??= { running: new Map(), queued: new Set(), active: 0, waiting: [] })
runtime.queued ??= new Set()

async function acquire() {
    if (runtime.active < MADDOX_SCENE_IMAGE_CONCURRENCY) {
        runtime.active += 1
        return
    }
    await new Promise<void>((resolve) => runtime.waiting.push(resolve))
}
function release() {
    const next = runtime.waiting.shift()
    if (next) next()
    else runtime.active -= 1
}

/** Dispara a geração (nunca lança). */
export function startSceneImage(imageId: string): Promise<void> {
    runtime.queued.delete(imageId)
    const existing = runtime.running.get(imageId)
    if (existing) return existing
    const job = (async () => {
        await acquire()
        try {
            await runSceneImage(imageId)
        } catch (error) {
            log.error({ err: error instanceof Error ? error.message : String(error), imageId }, "[maddox] falha inesperada na geração da imagem da cena")
        } finally {
            release()
            runtime.running.delete(imageId)
        }
    })()
    runtime.running.set(imageId, job)
    return job
}

/** Espera as gerações em andamento (testes). */
export async function waitForSceneImages(): Promise<void> {
    while (runtime.running.size) await Promise.all([...runtime.running.values()])
}

async function notify(campaignId: Types.ObjectId) {
    const { publishGameChanged } = await import("./game")
    await publishGameChanged(campaignId)
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | null = null
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            controller.abort()
            reject(new Error(`a geração da imagem passou de ${Math.round(ms / 1000)} s`))
        }, ms)
    })
    try {
        return await Promise.race([run(controller.signal), timeout])
    } finally {
        if (timer) clearTimeout(timer)
    }
}

/**
 * Pedido ao gerador (DND-33): abertura e estilo da mesa (sem mudança de estética), a cena a retratar AGORA, a aparência
 * obrigatória de quem aparece, as imagens de referência, o restante dos dados (JSON) e a conferência final da aparência.
 */
export function buildSceneImagePrompt(input: {
    kind: "scene" | "portrait"
    campaignName: string
    style: string
    situation: string | null
    description: string
    imageLabels: readonly string[]
    context: Record<string, unknown>
    appearances?: readonly CharacterAppearance[]
}): string {
    const appearances = input.kind === "portrait" ? [] : (input.appearances ?? [])
    const parts = [
        input.kind === "portrait"
            ? `Retrato de um personagem não jogador (NPC) da campanha de RPG "${input.campaignName}", do peito para cima, como um avatar.`
            : `Ilustração de uma cena da campanha de RPG "${input.campaignName}", narrada pelo mestre Maddox.`,
    ]
    if (input.style.trim()) parts.push(`Estilo visual desta mesa: ${input.style.trim()}`)
    if (input.kind === "portrait") {
        if (input.situation) parts.push(`Momento: ${input.situation}.`)
        parts.push(`Quem é: ${input.description.trim()}`)
    } else {
        parts.push(["## Cena a retratar (o que acontece AGORA)", ...(input.situation ? [`Momento: ${input.situation}.`] : []), input.description.trim()].join("\n"))
    }
    if (appearances.length) {
        parts.push(
            [
                "## Aparência de quem aparece (obrigatória)",
                "Siga exatamente estes traços registrados (cabelo, olhos, pele, porte, roupas e marcas). Detalhes não listados ficam livres, mas nunca contradizem os listados.",
                appearanceBlock(appearances),
            ].join("\n\n"),
        )
    }
    if (input.imageLabels.length) {
        parts.push(`As imagens anexadas mostram, nesta ordem, a aparência de: ${input.imageLabels.join("; ")}. Mantenha a aparência deles (rosto, corpo, roupas e cores) fiel às imagens.`)
    }
    parts.push(appearances.length ? "Demais dados da cena (respeite-os):" : "Dados de aparência de quem aparece (respeite-os):", JSON.stringify(input.context, null, 2))
    const recap = appearanceRecap(appearances)
    if (recap.length) parts.push(["Conferência final da aparência (não troque estas cores):", ...recap.map((line) => `- ${line}`)].join("\n"))
    parts.push("Sem texto, letras, legendas, balões ou molduras na imagem.")
    return parts.join("\n\n")
}

/** Gera uma imagem reservada: JEV (só a ferramenta), referências, gerador, gravação e aviso à mesa. */
export async function runSceneImage(imageId: string): Promise<void> {
    const claimed = await MaddoxSceneImageModel.findOneAndUpdate({ _id: imageId, status: "pending" }, { $set: { status: "generating", startedAt: new Date() } }, { returnDocument: "after" }).lean<IMaddoxSceneImage>()
    if (!claimed) return
    const campaignId = claimed.campaignId
    const fail = async (reason: string) => {
        await MaddoxSceneImageModel.updateOne({ _id: claimed._id }, { $set: { status: "failed", counts: false, error: MADDOX_SCENE_IMAGE_FAILED_MESSAGE, completedAt: new Date() } })
        log.warn({ campaignId: String(campaignId), imageId, source: claimed.source, err: reason }, "[maddox] a imagem da cena falhou")
    }
    try {
        const env = await loadSceneImageEnvironment()
        const campaign = await MaddoxCampaignModel.findById(campaignId).select("name rigor setting state").lean<Pick<IMaddoxCampaign, "_id" | "name" | "rigor" | "setting" | "state">>()
        if (!campaign) return fail("campanha não encontrada")
        const scene = env.settings.sceneImages

        // JEV "Gerar imagem na cena": filtro só no pedido do narrador.
        if (claimed.source === "tool" && env.settings.jev?.["scene-image"] && claimed.messageId) {
            const message = await MaddoxCampaignMessageModel.findById(claimed.messageId).select("content").lean<{ content: string }>()
            const situation = activeSituations(scene).find((item) => item.key === claimed.situation) ?? { label: situationLabel(scene, claimed.situation) ?? claimed.situation ?? "", description: "" }
            const { sceneImageMatches } = await import("./scene-image-hints")
            const score = await sceneImageMatches(campaign, situation, message?.content ?? "")
            if (score !== null && score < 0.5) {
                await MaddoxSceneImageModel.updateOne({ _id: claimed._id }, { $set: { status: "skipped", counts: false, skipReason: "jev", jevScore: score, completedAt: new Date() } })
                log.info({ campaignId: String(campaignId), imageId, score }, "[maddox] JEV descartou a imagem da cena")
                await notify(campaignId)
                return
            }
            if (score !== null) await MaddoxSceneImageModel.updateOne({ _id: claimed._id }, { $set: { jevScore: score } })
        }

        const { buildSceneReferences } = await import("./scene-image-references")
        const references = await buildSceneReferences({ campaignId, characters: claimed.references?.characters ?? [], npcs: claimed.references?.npcs ?? [], catalog: claimed.references?.catalog ?? [] })
        const portrait = claimed.source === "npc-portrait"
        const images = env.generator.supportsReferences ? references.images : []
        if (references.images.length && !env.generator.supportsReferences) log.warn({ campaignId: String(campaignId), imageId, referencesIgnored: references.images.length }, "[maddox] o modelo de imagem não aceita imagens de referência; gerando só com os dados")
        const prompt = buildSceneImagePrompt({
            kind: portrait ? "portrait" : "scene",
            campaignName: campaign.name,
            style: scene.style,
            situation: situationLabel(scene, claimed.situation),
            description: claimed.description,
            imageLabels: images.length ? references.imageLabels : [],
            context: references.context,
            appearances: references.appearances,
        })
        const { generateAndStoreDndImage } = await import("@/features/ai/server/image-generator")
        const folder = portrait ? `maddox/campaigns/${String(campaignId)}/npcs/${String(claimed.npcId)}-${Date.now()}` : `maddox/campaigns/${String(campaignId)}/scenes/${String(claimed._id)}`
        const stored = await withTimeout(
            (signal) =>
                generateAndStoreDndImage({
                    prompt,
                    entityLabel: portrait ? `Retrato de NPC · ${campaign.name}` : `Cena · ${campaign.name}`,
                    preferredAspectRatio: portrait ? "1:1" : scene.aspectRatio,
                    userId: claimed.requestedBy ?? "maddox",
                    referenceImages: images,
                    storageKey: folder,
                    consumptionOrigin: MADDOX_SCENE_IMAGE_CONSUMPTION_ORIGIN,
                    consumptionSubject: String(campaignId),
                    signal,
                }),
            MADDOX_SCENE_IMAGE_TIMEOUT_MS,
        )
        await MaddoxSceneImageModel.updateOne({ _id: claimed._id }, { $set: { status: "done", url: stored.url, key: stored.key, referencesUsed: stored.referencesUsed ?? 0, completedAt: new Date() } })
        if (portrait && claimed.npcId) await MaddoxNpcModel.updateOne({ _id: claimed.npcId, campaignId }, { $set: { portraitUrl: stored.url } })
        log.info({ campaignId: String(campaignId), imageId, source: claimed.source, situation: claimed.situation, referencesUsed: stored.referencesUsed ?? 0 }, "[maddox] imagem da cena gerada")
    } catch (error) {
        await fail(error instanceof Error ? error.message : String(error))
    }
    await notify(campaignId)
}

/** Imagens presas (processo reiniciado no meio da geração) viram falha e liberam a vaga. */
export async function expireStaleSceneImages(campaignId: Types.ObjectId): Promise<number> {
    const limit = new Date(Date.now() - MADDOX_SCENE_IMAGE_STALE_MS)
    const stale = await MaddoxSceneImageModel.find({ campaignId, status: { $in: ["pending", "generating"] }, updatedAt: { $lt: limit } }).select("_id").lean<{ _id: Types.ObjectId }[]>()
    // As que estão gerando ou esperando a vez na fila da campanha (pedido manual) neste processo não estão presas.
    const ids = stale.map((item) => item._id).filter((id) => !runtime.running.has(String(id)) && !runtime.queued.has(String(id)))
    if (!ids.length) return 0
    const result = await MaddoxSceneImageModel.updateMany({ _id: { $in: ids }, status: { $in: ["pending", "generating"] } }, { $set: { status: "failed", counts: false, error: MADDOX_SCENE_IMAGE_FAILED_MESSAGE, completedAt: new Date() } })
    if (result.modifiedCount) log.warn({ campaignId: String(campaignId), expired: result.modifiedCount }, "[maddox] imagens da cena presas marcadas como falha")
    return result.modifiedCount
}

// ── Leitura ────────────────────────────────────────────────────────────────────

export function sceneImageDto(image: IMaddoxSceneImage, settings: MaddoxSceneImagesSettings | null): MaddoxGameSceneImageDto | null {
    if (image.status === "skipped") return null
    return {
        id: String(image._id),
        status: image.status,
        url: image.status === "done" ? image.url : null,
        caption: image.caption ?? "",
        situationLabel: situationLabel(settings, image.situation),
        source: image.source,
        error: image.status === "failed" ? (image.error ?? MADDOX_SCENE_IMAGE_FAILED_MESSAGE) : null,
    }
}

/**
 * Imagens visíveis de cada mensagem, na ordem do pedido (uma narração pode ter a do Maddox e a pedida pelo dono). As
 * descartadas não aparecem e uma falha nunca esconde uma imagem pronta: com alguma `done`, as `failed` saem da lista.
 */
export function visibleSceneImages(images: readonly MaddoxGameSceneImageDto[]): MaddoxGameSceneImageDto[] {
    return images.some((image) => image.status === "done") ? images.filter((image) => image.status !== "failed") : [...images]
}

export async function sceneImagesByMessage(messageIds: readonly Types.ObjectId[]): Promise<Map<string, MaddoxGameSceneImageDto[]>> {
    const out = new Map<string, MaddoxGameSceneImageDto[]>()
    if (!messageIds.length) return out
    const images = await MaddoxSceneImageModel.find({ messageId: { $in: messageIds }, status: { $ne: "skipped" } }).sort({ _id: 1 }).lean<IMaddoxSceneImage[]>()
    if (!images.length) return out
    let settings: MaddoxSceneImagesSettings | null = null
    try {
        const { loadMaddoxSettings } = await import("./settings")
        settings = (await loadMaddoxSettings()).settings.sceneImages
    } catch {
        settings = null
    }
    for (const image of images) {
        const dto = sceneImageDto(image, settings)
        if (dto) out.set(String(image.messageId), [...(out.get(String(image.messageId)) ?? []), dto])
    }
    for (const [id, list] of out) out.set(id, visibleSceneImages(list))
    return out
}

/** NPCs com retrato sendo gerado. */
export async function generatingPortraitNpcIds(campaignId: Types.ObjectId): Promise<Set<string>> {
    const items = await MaddoxSceneImageModel.find({ campaignId, source: "npc-portrait", status: { $in: ["pending", "generating"] } }).select("npcId").lean<{ npcId: Types.ObjectId | null }[]>()
    return new Set(items.map((item) => String(item.npcId)))
}

/** Situação do botão manual para quem abre a mesa (só o dono pede). */
export async function sceneImageControl(campaign: Pick<IMaddoxCampaign, "_id" | "ownerId" | "status" | "sceneImages">, userId: string): Promise<MaddoxSceneImageControlDto> {
    const owner = campaign.ownerId === userId
    const campaignEnabled = campaign.sceneImages !== false
    if (!owner) return { owner, canRequest: false, reason: null, generating: false, remainingToday: 0, campaignEnabled, canRequestPortrait: false }
    const generating = (await MaddoxSceneImageModel.exists({ campaignId: campaign._id, source: "manual", status: { $in: ["pending", "generating"] } })) !== null
    let remainingToday = 0
    let reason: string | null = null
    try {
        const env = await loadSceneImageEnvironment()
        const quota = await sceneImageQuota(campaign._id, 0, env.settings.sceneImages, "manual")
        remainingToday = quota.remainingToday
        if (!env.generator.available) reason = env.generator.reason
        else if (!quota.allowed) reason = quota.reason
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaign._id) }, "[maddox] situação das imagens indisponível")
        reason = "Não foi possível consultar o Gerador de imagens agora."
    }
    if (!reason && campaign.status !== "active") reason = "A campanha não está em andamento."
    const canRequestPortrait = !reason
    if (!reason && generating) reason = "O Maddox já está pintando uma cena."
    return { owner, canRequest: !reason, reason, generating, remainingToday, campaignEnabled, canRequestPortrait }
}

// ── Pedidos do dono ────────────────────────────────────────────────────────────

async function loadOwnedCampaign(campaignId: string, userId: string): Promise<IMaddoxCampaign> {
    if (!Types.ObjectId.isValid(campaignId)) throw new DomainError(404, "Campanha não encontrada", "NOT_FOUND")
    const { loadAsMember } = await import("./game")
    const { campaign } = await loadAsMember(campaignId, userId)
    if (campaign.ownerId !== userId) throw new DomainError(403, "Só o dono da campanha pode pedir imagens.", "FORBIDDEN")
    if (campaign.status !== "active") throw new DomainError(409, "A campanha não está em andamento.", "CAMPAIGN_NOT_ACTIVE")
    return campaign
}

async function assertCanAfford(campaign: IMaddoxCampaign, slot: MaddoxSceneImageSlot): Promise<SceneImageEnvironment> {
    const env = await loadSceneImageEnvironment()
    if (!env.generator.available) throw new DomainError(409, env.generator.reason ?? "O Gerador de imagens não está disponível.", "AI_IMAGE_UNAVAILABLE")
    const quota = await sceneImageQuota(campaign._id, campaign.turn?.number ?? 0, env.settings.sceneImages, slot)
    if (!quota.allowed) throw new DomainError(409, quota.reason ?? "Limite de imagens atingido.", "SCENE_IMAGE_LIMIT")
    return env
}

/**
 * "Gerar imagem da cena" (dono, a qualquer momento): reserva logo (o placeholder aparece na última narração) e põe na
 * fila da campanha a descrição da cena atual pelo Maddox (com o último turno em destaque e a aparência registrada dos
 * personagens, DND-33); depois gera. Só o teto diário e uma manual por vez.
 */
export async function requestManualSceneImage(campaignId: string, userId: string): Promise<MaddoxGameSceneImageDto> {
    const campaign = await loadOwnedCampaign(campaignId, userId)
    if (await MaddoxSceneImageModel.exists({ campaignId: campaign._id, source: "manual", status: { $in: ["pending", "generating"] } })) {
        throw new DomainError(409, "O Maddox já está pintando uma cena. Aguarde ela ficar pronta.", "SCENE_IMAGE_BUSY")
    }
    const env = await assertCanAfford(campaign, "manual")
    const narration = await MaddoxCampaignMessageModel.findOne({ campaignId: campaign._id, kind: "narration", error: null }).sort({ _id: -1 }).select("_id turnNumber segment content").lean<{ _id: Types.ObjectId; turnNumber: number; segment: number; content: string }>()
    if (!narration) throw new DomainError(409, "O Maddox ainda não narrou nenhuma cena nesta campanha.", "NO_NARRATION")
    const image = await reserveSceneImage(
        { campaignId: campaign._id, source: "manual", turnNumber: narration.turnNumber, segment: narration.segment, messageId: narration._id, situation: null, description: "", caption: "", requestedBy: userId, byOwner: true },
        env.settings.sceneImages,
    )
    if (!image) throw new DomainError(409, `Limite de ${env.settings.sceneImages.maxPerDay} imagens por dia desta campanha atingido.`, "SCENE_IMAGE_LIMIT")
    log.info({ campaignId: campaignId, userId, imageId: String(image._id) }, "[maddox] dono pediu imagem da cena")
    const { enqueueMaddoxJob } = await import("./game-live")
    runtime.queued.add(String(image._id))
    void enqueueMaddoxJob(campaignId, "descrição da imagem da cena", async () => {
        try {
            const { describeCurrentScene, lastTurnContext } = await import("./scene-image-describer")
            const described = await describeCurrentScene(campaign._id, await lastTurnContext(campaign._id, narration))
            await MaddoxSceneImageModel.updateOne(
                { _id: image._id, status: "pending" },
                {
                    $set: {
                        description: clip(described.description, MADDOX_SCENE_IMAGE_DESCRIPTION_MAX),
                        caption: clip(described.caption, MADDOX_SCENE_IMAGE_CAPTION_MAX),
                        references: { characters: described.characters, npcs: described.npcs, catalog: described.catalog },
                    },
                },
            )
        } catch (error) {
            // Sem a descrição gravada, a imagem sai da última narração (o gerador recebe a cena vazia como "Cena:").
            await MaddoxSceneImageModel.updateOne({ _id: image._id, status: "pending" }, { $set: { description: clip(narration.content, MADDOX_SCENE_IMAGE_DESCRIPTION_MAX) } }).catch(() => undefined)
            log.warn({ err: error instanceof Error ? error.message : String(error), campaignId }, "[maddox] falha ao gravar a descrição da imagem manual")
        } finally {
            startSceneImage(String(image._id))
        }
    })
    await notify(campaign._id)
    return sceneImageDto(image, env.settings.sceneImages)!
}

/** "Gerar retrato" (dono): NPC conhecido pelos jogadores, a partir da descrição pública. Só o teto diário. */
export async function requestNpcPortrait(campaignId: string, npcId: string, userId: string): Promise<{ npcId: string; status: "pending" }> {
    const campaign = await loadOwnedCampaign(campaignId, userId)
    if (!Types.ObjectId.isValid(npcId)) throw new DomainError(404, "NPC não encontrado", "NOT_FOUND")
    const npc = await MaddoxNpcModel.findOne({ _id: npcId, campaignId: campaign._id }).lean<IMaddoxNpc>()
    if (!npc || npc.visibility !== "players") throw new DomainError(404, "NPC não encontrado", "NOT_FOUND")
    if (await MaddoxSceneImageModel.exists({ npcId: npc._id, status: { $in: ["pending", "generating"] } })) throw new DomainError(409, "O retrato deste NPC já está sendo pintado.", "SCENE_IMAGE_BUSY")
    const env = await assertCanAfford(campaign, "portrait")
    const image = await reserveSceneImage(npcPortraitRequest(campaign, npc, userId, true), env.settings.sceneImages)
    if (!image) throw new DomainError(409, `Limite de ${env.settings.sceneImages.maxPerDay} imagens por dia desta campanha atingido.`, "SCENE_IMAGE_LIMIT")
    log.info({ campaignId, userId, npcId, imageId: String(image._id) }, "[maddox] dono pediu retrato de NPC")
    startSceneImage(String(image._id))
    await notify(campaign._id)
    return { npcId: String(npc._id), status: "pending" }
}

export function npcPortraitRequest(campaign: Pick<IMaddoxCampaign, "_id" | "turn">, npc: Pick<IMaddoxNpc, "_id" | "name" | "publicDescription">, requestedBy: string | null, byOwner: boolean): SceneImageRequest {
    return {
        campaignId: campaign._id,
        source: "npc-portrait",
        turnNumber: campaign.turn?.number ?? 0,
        npcId: npc._id,
        situation: "npc-portrait",
        description: `${npc.name}. ${npc.publicDescription ?? ""}`.trim(),
        caption: npc.name,
        npcs: [npc.name],
        requestedBy,
        byOwner,
    }
}

/** Retratos marcados pelo narrador (`save_npc { gerarRetrato }`): uma vez por NPC, só sem retrato. */
export async function scheduleNpcPortraits(campaignId: Types.ObjectId, npcIds: readonly string[], env?: SceneImageEnvironment): Promise<void> {
    if (!npcIds.length) return
    const environment = env ?? (await loadSceneImageEnvironment())
    const campaign = await MaddoxCampaignModel.findById(campaignId).select("turn").lean<Pick<IMaddoxCampaign, "_id" | "turn">>()
    if (!campaign) return
    for (const id of npcIds) {
        const npc = await MaddoxNpcModel.findOne({ _id: id, campaignId }).lean<IMaddoxNpc>()
        if (!npc || npc.portraitUrl) continue
        if (await MaddoxSceneImageModel.exists({ npcId: npc._id, source: "npc-portrait", status: { $in: ["pending", "generating", "done"] } })) continue
        await scheduleSceneImage(npcPortraitRequest(campaign, npc, null, false), environment)
    }
}

export type AutoNpcPortraitTrigger = "save_npc" | "combat"

/**
 * Retrato automático (DND-43): NPC conhecido dos jogadores, sem retrato e sem pedido anterior (nem `failed`: a nova
 * tentativa fica com o dono), com "Imagens nas cenas", "Retrato automático de NPC" e a chave da campanha ligados. Pede na
 * hora, dentro ou fora da narração; o slot "portrait" só conta no teto diário (sem intervalo nem uma por turno). Nunca
 * lança: recusa e erro vão para o log, a criação do NPC e a narração seguem. Devolve os NPCs com pedido reservado. A mesa
 * fica sabendo pelo aviso do job que salvou o NPC e, de novo, quando o retrato fica pronto.
 */
export async function scheduleAutoNpcPortraits(campaignId: Types.ObjectId, npcIds: readonly (Types.ObjectId | string)[], trigger: AutoNpcPortraitTrigger): Promise<string[]> {
    const requested: string[] = []
    if (!npcIds.length) return requested
    try {
        // Checagem barata antes de carregar o Gerador: com a função desligada, nada além disso roda.
        const { loadMaddoxSettings } = await import("./settings")
        const scene = (await loadMaddoxSettings()).settings.sceneImages
        if (!scene?.enabled || scene.autoPortraits !== true) return requested
        const campaign = await MaddoxCampaignModel.findById(campaignId).select("turn sceneImages").lean<Pick<IMaddoxCampaign, "_id" | "turn" | "sceneImages">>()
        if (!campaign || campaign.sceneImages === false) return requested
        let env: SceneImageEnvironment | null = null
        for (const id of npcIds) {
            const npc = await MaddoxNpcModel.findOne({ _id: id, campaignId }).lean<IMaddoxNpc>()
            if (!npc || npc.visibility !== "players" || npc.portraitUrl) continue
            if (await MaddoxSceneImageModel.exists({ npcId: npc._id, source: "npc-portrait", status: { $in: ["pending", "generating", "done", "failed"] } })) continue
            env ??= await loadSceneImageEnvironment()
            const { image, reason } = await scheduleSceneImage({ ...npcPortraitRequest(campaign, npc, null, false), auto: true }, env)
            if (!image) {
                log.info({ campaignId: String(campaignId), npcId: String(npc._id), origin: "auto", trigger, reason }, "[maddox] retrato automático de NPC não pedido")
                // Gerador indisponível ou teto: os próximos NPCs teriam o mesmo motivo.
                if (!env.generator.available || reason?.startsWith("Limite")) break
                continue
            }
            requested.push(String(npc._id))
            log.info({ campaignId: String(campaignId), npcId: String(npc._id), imageId: String(image._id), origin: "auto", trigger }, "[maddox] retrato automático de NPC pedido")
        }
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaignId), origin: "auto", trigger }, "[maddox] falha ao pedir o retrato automático de NPC")
    }
    return requested
}

// ── Narrador ───────────────────────────────────────────────────────────────────

/**
 * Regra das imagens para a narração (Maddox 10): situações ativas e a cota agora. `null` = imagens desligadas (na aba ou
 * na campanha), Gerador indisponível ou nenhuma situação pedida pelo narrador ativa. Falha = `null` (aviso no log).
 */
export async function narratorSceneImageContext(campaign: Pick<IMaddoxCampaign, "_id" | "sceneImages">, turnNumber: number): Promise<import("./narrator-prompt").NarratorSceneImages | null> {
    try {
        if (campaign.sceneImages === false) return null
        const env = await loadSceneImageEnvironment()
        const scene = env.settings.sceneImages
        if (!scene?.enabled || !env.generator.available) return null
        const situations = toolSituations(scene).map(({ key, label, description }) => ({ key, label, description }))
        const portraits = Boolean(scene.situations["npc-portrait"])
        const autoPortraits = scene.autoPortraits === true
        if (!situations.length && !portraits && !autoPortraits) return null
        const quota = await sceneImageQuota(campaign._id, turnNumber, scene, "auto")
        return { situations, portraits, autoPortraits, blocked: quota.allowed ? null : quota.reason }
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaign._id) }, "[maddox] situação das imagens indisponível; narrando sem elas")
        return null
    }
}
