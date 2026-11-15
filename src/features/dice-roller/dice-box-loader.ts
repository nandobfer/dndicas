import type DiceBox from "@3d-dice/dice-box-threejs"

export type DiceBoxConstructor = new (container: string | HTMLElement, config?: Record<string, unknown>) => DiceBox

declare global {
    // Test-only escape hatch so jsdom tests do not import Three/Cannon.
    var __DNDICAS_DICE_BOX_LOADER__: (() => DiceBoxConstructor | Promise<DiceBoxConstructor>) | undefined
}

export interface SharedDiceBox {
    box: DiceBox
    container: HTMLDivElement
}

/** Depois do `load` da página, espera isto antes de aquecer o primeiro motor (não disputa as requisições iniciais). */
export const DICE_BOX_PRELOAD_DELAY_MS = 1500
/** Teto do `requestIdleCallback`: numa aba sempre ocupada o aquecimento não fica esperando para sempre. */
export const DICE_BOX_IDLE_TIMEOUT_MS = 2000
/** Motores prontos (parados ou aquecendo) que o pool tenta manter: um no boot e um de reserva. */
export const DICE_BOX_WARM_TARGET = 2
/** Teto de motores parados: o que passar disso é descartado ao ser liberado (cada um é um contexto WebGL). */
export const DICE_BOX_MAX_IDLE = 2

interface WarmingEntry {
    promise: Promise<SharedDiceBox>
    claimed: boolean
}

interface DiceBoxPoolState {
    idle: SharedDiceBox[]
    warming: WarmingEntry[]
    inUse: Set<SharedDiceBox>
    bootScheduled: boolean
    replenishScheduled: boolean
    autoReplenish: boolean | null
    /** Sobe a cada reset dos testes: motor de uma geração anterior é descartado ao ser liberado, nunca volta ao pool. */
    generation: number
}

const generationOf = new WeakMap<SharedDiceBox, number>()

const pool: DiceBoxPoolState = {
    idle: [],
    warming: [],
    inUse: new Set(),
    bootScheduled: false,
    replenishScheduled: false,
    autoReplenish: null,
    generation: 0,
}

const DICE_BOX_CONFIG = {
    assetPath: "/",
    sounds: true,
    volume: 100,
    sound_dieMaterial: "plastic",
    shadows: true,
    theme_surface: "default",
    theme_texture: "none",
    theme_material: "glass",
    theme_customColorset: {
        name: "dndicas",
        foreground: "#f8fafc",
        background: ["#0f172a", "#1f2937", "#334155", "#111827"],
        outline: "#f8fafc",
        texture: "stainedglass",
        material: "glass",
    },
    gravity_multiplier: 280,
    light_intensity: 0.85,
    baseScale: 67,
    strength: 2.0,
}

interface ThrowableDiceBox {
    rolling?: boolean
    strength: number
    display?: { currentWidth?: number; currentHeight?: number }
    clearDice?: () => void
    startClickThrow?: (notation: string) => unknown
    getNotationVectors?: (notation: string, vector: { x: number; y: number }, boost: number, dist: number) => unknown
}

/** Container fora da tela em 450×260: sem `visibility: hidden` nem `display: none`, para o WebGL e o ResizeObserver medirem. */
function parkContainer(container: HTMLDivElement) {
    container.style.inset = ""
    container.style.position = "absolute"
    container.style.left = "-10000px"
    container.style.top = "0"
    container.style.width = "450px"
    container.style.height = "260px"
    container.style.pointerEvents = "none"
    container.style.zIndex = "-9999"
    if (container.parentElement !== document.body) {
        document.body.appendChild(container)
    }
}

/** Monta e inicializa um motor na hora (quem chama decide se espera o idle antes). */
async function buildDiceBox(): Promise<SharedDiceBox> {
    const generation = pool.generation
    try {
        const DiceBoxCtor = await loadDiceBox()
        const containerId = "dndicas-shared-dice-box-" + Math.random().toString(36).slice(2, 9)
        const container = document.createElement("div")
        container.id = containerId
        parkContainer(container)

        const box = new DiceBoxCtor(`#${containerId}`, DICE_BOX_CONFIG)
        await box.initialize()

        // Override startClickThrow to ensure throws are consistently strong and cover distance
        const throwable = box as unknown as ThrowableDiceBox
        if (throwable.startClickThrow && throwable.getNotationVectors && throwable.display) {
            throwable.startClickThrow = function (this: ThrowableDiceBox, notation: string) {
                if (this.rolling) {
                    this.clearDice?.()
                    this.rolling = false
                }
                const w = this.display?.currentWidth || 800
                const h = this.display?.currentHeight || 600
                const maxDim = Math.max(w, h)
                const angle = Math.random() * Math.PI * 2
                const distance = (0.75 + Math.random() * 0.25) * maxDim
                const t = {
                    x: Math.cos(angle) * distance,
                    y: Math.sin(angle) * distance,
                }
                const n = Math.sqrt(t.x * t.x + t.y * t.y) + 100
                const forceMultiplier = 3.2 + Math.random() * 0.6
                const i = forceMultiplier * n * this.strength
                return this.getNotationVectors?.(notation, t, i, n)
            }
        }

        const shared = { box, container }
        generationOf.set(shared, generation)
        return shared
    } catch (error) {
        console.error("Failed to initialize shared dice box", error)
        throw error
    }
}

function scheduleIdle(callback: () => void) {
    if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => callback(), { timeout: DICE_BOX_IDLE_TIMEOUT_MS })
    } else {
        window.setTimeout(callback, 50)
    }
}

function removeWarming(entry: WarmingEntry) {
    const index = pool.warming.indexOf(entry)
    if (index >= 0) pool.warming.splice(index, 1)
}

function startWarming(): WarmingEntry {
    const entry: WarmingEntry = { promise: buildDiceBox(), claimed: false }
    pool.warming.push(entry)
    entry.promise.then(
        (shared) => {
            removeWarming(entry)
            if (entry.claimed) return
            if (generationOf.get(shared) === pool.generation) pool.idle.push(shared)
            else disposeDiceBox(shared)
        },
        () => removeWarming(entry)
    )
    return entry
}

function readyCount() {
    return pool.idle.length + pool.warming.length
}

/**
 * Aquece motores até o pool ter `target` prontos ou aquecendo, um de cada vez (nunca dois `initialize` juntos na
 * thread principal). Usado pelo preload do boot e pela reposição da reserva.
 */
export async function warmDiceBoxPool(target: number = DICE_BOX_WARM_TARGET): Promise<void> {
    if (typeof window === "undefined") return
    // Cada chamada aquece no máximo o que faltava ao começar: um motor pego no meio do caminho é reposto por
    // `scheduleReplenish`, não por este laço.
    let missing = target - readyCount()
    while (missing > 0 && readyCount() < target) {
        missing -= 1
        const entry = startWarming()
        try {
            await entry.promise
        } catch {
            return
        }
        if (missing > 0 && readyCount() < target) await new Promise<void>((resolve) => scheduleIdle(resolve))
    }
}

function replenishEnabled() {
    return pool.autoReplenish ?? !globalThis.__DNDICAS_DICE_BOX_LOADER__
}

function scheduleReplenish() {
    if (!replenishEnabled() || pool.replenishScheduled) return
    pool.replenishScheduled = true
    scheduleIdle(() => {
        pool.replenishScheduled = false
        void warmDiceBoxPool()
    })
}

/**
 * Preload global do boot (DND-61): uma vez por documento, depois do `load` + `DICE_BOX_PRELOAD_DELAY_MS` + idle,
 * aquece um motor e, em seguida, o de reserva. Chamar de novo não agenda outro. Desligado só no servidor e nos testes
 * (`__DNDICAS_DICE_BOX_LOADER__`).
 */
export function preloadDiceBoxAssets() {
    if (typeof window === "undefined" || globalThis.__DNDICAS_DICE_BOX_LOADER__) return
    if (pool.bootScheduled) return
    pool.bootScheduled = true

    const start = () => {
        window.setTimeout(() => scheduleIdle(() => void warmDiceBoxPool()), DICE_BOX_PRELOAD_DELAY_MS)
    }
    if (document.readyState === "complete") start()
    else window.addEventListener("load", start, { once: true })
}

/** Pega um motor já pronto, sem esperar nada; `null` quando o pool está vazio. */
export function acquireWarmDiceBox(): SharedDiceBox | null {
    if (typeof window === "undefined") return null
    const shared = pool.idle.shift()
    if (!shared) return null
    pool.inUse.add(shared)
    scheduleReplenish()
    return shared
}

/**
 * Motor para um palco: um parado do pool, senão um que já está aquecendo, senão um criado na hora (sem esperar o
 * idle; módulo e assets já estão em cache depois do preload).
 */
export function getSharedDiceBox(): Promise<SharedDiceBox> {
    if (typeof window === "undefined") {
        return Promise.reject(new Error("Server side"))
    }

    const warm = acquireWarmDiceBox()
    if (warm) return Promise.resolve(warm)

    const pending = pool.warming.find((entry) => !entry.claimed)
    let promise: Promise<SharedDiceBox>
    if (pending) {
        pending.claimed = true
        removeWarming(pending)
        promise = pending.promise
    } else {
        promise = buildDiceBox()
    }
    scheduleReplenish()
    return promise.then((shared) => {
        pool.inUse.add(shared)
        return shared
    })
}

function disposeDiceBox(shared: SharedDiceBox) {
    const renderer = (shared.box as unknown as { renderer?: { dispose?: () => void; forceContextLoss?: () => void } }).renderer
    try {
        renderer?.dispose?.()
        renderer?.forceContextLoss?.()
    } catch (error) {
        console.error("Failed to dispose dice box", error)
    }
    shared.container.remove()
}

/** Devolve o motor ao pool, fora da tela; acima de `DICE_BOX_MAX_IDLE` parados, descarta. Liberar duas vezes não duplica. */
export function releaseSharedDiceBox(shared: SharedDiceBox) {
    if (pool.idle.includes(shared)) return
    pool.inUse.delete(shared)
    shared.box.clearDice?.()
    const stale = generationOf.has(shared) && generationOf.get(shared) !== pool.generation
    if (typeof document === "undefined" || stale || pool.idle.length >= DICE_BOX_MAX_IDLE) {
        disposeDiceBox(shared)
        return
    }
    parkContainer(shared.container)
    pool.idle.push(shared)
}

/** Estado do pool para os testes (contagens, sem expor as instâncias). */
export function getDiceBoxPoolStats() {
    return { idle: pool.idle.length, warming: pool.warming.length, inUse: pool.inUse.size }
}

/** Só testes: zera o pool. `autoReplenish` liga a reposição da reserva, desligada por padrão com o loader falso. */
export function resetDiceBoxPoolForTests(options: { autoReplenish?: boolean } = {}) {
    for (const shared of pool.idle) shared.container.remove()
    pool.idle = []
    pool.warming = []
    pool.inUse.clear()
    pool.bootScheduled = false
    pool.replenishScheduled = false
    pool.autoReplenish = options.autoReplenish ?? null
    pool.generation += 1
}

/**
 * Ajusta o mundo 3D ao tamanho atual do container (depois de movê-lo para outro palco). Usa o `setDimensions` da lib
 * quando existe; senão, cai no evento `resize` que a lib escuta (adiado por um quadro).
 */
export function syncDiceBoxSize(box: DiceBox) {
    const sizable = box as unknown as { container?: HTMLElement; setDimensions?: (size: { x: number; y: number }) => void }
    try {
        const width = sizable.container?.clientWidth ?? 0
        const height = sizable.container?.clientHeight ?? 0
        // Mesma chamada do handler de `resize` da lib, só que na hora.
        if (typeof sizable.setDimensions === "function" && width > 0 && height > 0) {
            sizable.setDimensions({ x: width, y: height })
            return
        }
    } catch (error) {
        console.error("Failed to resize dice box", error)
    }
    if (typeof window !== "undefined") window.dispatchEvent(new Event("resize"))
}

export async function loadDiceBox(): Promise<DiceBoxConstructor> {
    if (globalThis.__DNDICAS_DICE_BOX_LOADER__) {
        return globalThis.__DNDICAS_DICE_BOX_LOADER__()
    }

    const module = await import("@3d-dice/dice-box-threejs")
    return module.default as DiceBoxConstructor
}
