import type DiceBox from "@3d-dice/dice-box-threejs"

type DiceBoxConstructor = new (container: string, config?: Record<string, unknown>) => DiceBox

declare global {
    // Test-only escape hatch so jsdom tests do not import Three/Cannon.
    var __DNDICAS_DICE_BOX_LOADER__: (() => DiceBoxConstructor | Promise<DiceBoxConstructor>) | undefined
}

export async function loadDiceBox() {
    if (globalThis.__DNDICAS_DICE_BOX_LOADER__) {
        return globalThis.__DNDICAS_DICE_BOX_LOADER__()
    }

    const module = await import("@3d-dice/dice-box-threejs")
    return module.default as DiceBoxConstructor
}
