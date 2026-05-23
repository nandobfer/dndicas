declare module "@3d-dice/dice-box-threejs" {
    interface DiceBoxConfig {
        assetPath?: string
        framerate?: number
        sounds?: boolean
        volume?: number
        color_spotlight?: number
        shadows?: boolean
        theme_surface?: string
        sound_dieMaterial?: string
        theme_customColorset?: {
            name: string
            foreground: string
            background: string | string[]
            outline?: string
            texture?: string
            material?: string
        }
        theme_colorset?: string
        theme_texture?: string
        theme_material?: string
        gravity_multiplier?: number
        light_intensity?: number
        baseScale?: number
        strength?: number
        onRollComplete?: (results: unknown) => void
    }

    export default class DiceBox {
        constructor(container: string, config?: DiceBoxConfig)
        initialize(): Promise<void>
        roll(notation: string): Promise<unknown>
        clearDice?(): void
    }
}
