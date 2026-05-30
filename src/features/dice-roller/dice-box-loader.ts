import type DiceBox from "@3d-dice/dice-box-threejs"

type DiceBoxConstructor = new (container: string, config?: Record<string, unknown>) => DiceBox

declare global {
    // Test-only escape hatch so jsdom tests do not import Three/Cannon.
    var __DNDICAS_DICE_BOX_LOADER__: (() => DiceBoxConstructor | Promise<DiceBoxConstructor>) | undefined
}

let preloadedBoxPromise: Promise<void> | null = null

export function preloadDiceBoxAssets() {
    if (typeof window === "undefined" || globalThis.__DNDICAS_DICE_BOX_LOADER__) return

    if (preloadedBoxPromise) return

    preloadedBoxPromise = new Promise((resolve) => {
        const init = async () => {
            try {
                const module = await import("@3d-dice/dice-box-threejs")
                const DiceBoxCtor = module.default as DiceBoxConstructor

                // Create a hidden container for the preloader instance
                const container = document.createElement("div")
                container.id = "dice-box-preloader"
                container.style.position = "absolute"
                container.style.visibility = "hidden"
                container.style.pointerEvents = "none"
                container.style.width = "1px"
                container.style.height = "1px"
                container.style.top = "-1000px"
                document.body.appendChild(container)

                const box = new DiceBoxCtor("#dice-box-preloader", {
                    assetPath: "/",
                    sounds: true,
                    volume: 0,
                    theme_material: "glass",
                })

                await box.initialize()
                resolve()
            } catch (error) {
                console.error("Failed to preload dice box assets", error)
                resolve() // Resolve anyway to not block future attempts or logic
            }
        }

        // Use requestIdleCallback if available, otherwise setTimeout
        if ("requestIdleCallback" in window) {
            window.requestIdleCallback(() => init())
        } else {
            setTimeout(init, 1000)
        }
    })
}

export async function loadDiceBox() {
    if (globalThis.__DNDICAS_DICE_BOX_LOADER__) {
        return globalThis.__DNDICAS_DICE_BOX_LOADER__()
    }

    const module = await import("@3d-dice/dice-box-threejs")
    return module.default as DiceBoxConstructor
}
