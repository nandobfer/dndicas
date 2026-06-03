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

let sharedBoxPromise: Promise<SharedDiceBox> | null = null
let sharedBoxInUse = false

function createDiceBoxInstance(): Promise<SharedDiceBox> {
    return new Promise<SharedDiceBox>((resolve, reject) => {
        const init = async () => {
            try {
                let DiceBoxCtor: DiceBoxConstructor
                if (globalThis.__DNDICAS_DICE_BOX_LOADER__) {
                    DiceBoxCtor = await globalThis.__DNDICAS_DICE_BOX_LOADER__()
                } else {
                    const module = await import("@3d-dice/dice-box-threejs")
                    DiceBoxCtor = module.default as DiceBoxConstructor
                }

                const containerId = "dndicas-shared-dice-box-" + Math.random().toString(36).slice(2, 9)
                const container = document.createElement("div")
                container.id = containerId
                // Keep it in DOM but visually hidden without using 'visibility: hidden' or 'display: none'
                // to ensure WebGL and ResizeObserver initialize properly with real dimensions.
                container.style.position = "absolute"
                container.style.left = "-10000px"
                container.style.top = "0"
                container.style.width = "450px"
                container.style.height = "260px"
                container.style.pointerEvents = "none"
                container.style.zIndex = "-9999"

                document.body.appendChild(container)

                const box = new DiceBoxCtor(`#${containerId}`, {
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
                })

                await box.initialize()

                // Override startClickThrow to ensure throws are consistently strong and cover distance
                const anyBox = box as any
                if (anyBox.startClickThrow && anyBox.getNotationVectors && anyBox.display) {
                    anyBox.startClickThrow = function(notation: string) {
                        if (this.rolling) {
                            this.clearDice()
                            this.rolling = false
                        }
                        const w = this.display.currentWidth || 800
                        const h = this.display.currentHeight || 600
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
                        return this.getNotationVectors(notation, t, i, n)
                    }
                }

                resolve({ box, container })
            } catch (error) {
                console.error("Failed to initialize shared dice box", error)
                reject(error)
            }
        }

        if ("requestIdleCallback" in window) {
            window.requestIdleCallback(() => init())
        } else {
            setTimeout(init, 50)
        }
    })
}

export function preloadDiceBoxAssets() {
    if (typeof window === "undefined" || globalThis.__DNDICAS_DICE_BOX_LOADER__) return
    if (!sharedBoxPromise) {
        sharedBoxPromise = createDiceBoxInstance()
    }
}

export function getSharedDiceBox(): Promise<SharedDiceBox> {
    if (typeof window === "undefined") {
        return Promise.reject(new Error("Server side"))
    }

    if (!sharedBoxPromise) {
        sharedBoxPromise = createDiceBoxInstance()
    }

    if (!sharedBoxInUse) {
        sharedBoxInUse = true
        return sharedBoxPromise
    }

    return createDiceBoxInstance()
}

export function releaseSharedDiceBox(shared: SharedDiceBox) {
    if (sharedBoxPromise) {
        sharedBoxPromise.then((singleton) => {
            if (singleton === shared) {
                shared.box.clearDice?.()
                // Put it back in off-screen standby mode
                shared.container.style.position = "absolute"
                shared.container.style.left = "-10000px"
                shared.container.style.top = "0"
                shared.container.style.width = "450px"
                shared.container.style.height = "260px"
                shared.container.style.zIndex = "-9999"
                
                if (shared.container.parentElement !== document.body) {
                    document.body.appendChild(shared.container)
                }
                sharedBoxInUse = false
            } else {
                shared.box.clearDice?.()
                shared.container.remove()
            }
        }).catch(() => {})
    } else {
        shared.container.remove()
    }
}

export async function loadDiceBox() {
    if (globalThis.__DNDICAS_DICE_BOX_LOADER__) {
        return globalThis.__DNDICAS_DICE_BOX_LOADER__()
    }

    const module = await import("@3d-dice/dice-box-threejs")
    return module.default as DiceBoxConstructor
}
