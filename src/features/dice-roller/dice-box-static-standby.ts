import type DiceBox from "@3d-dice/dice-box-threejs"

interface DiceBoxNotationVectors {
    vectors: unknown[]
    result?: number[]
}

interface VectorLike {
    x?: number
    y?: number
    z?: number
    set?: (x: number, y: number, z: number) => void
    copy?: (value: VectorLike) => void
}

interface DiceBoxDie {
    body?: {
        type?: number
        position?: VectorLike
        velocity?: VectorLike
        angularVelocity?: VectorLike
        sleepState?: number
    }
    getLastValue?: () => { value?: number | string }
    position?: VectorLike
}

interface StaticDiceBox extends DiceBox {
    display?: {
        containerWidth?: number
        containerHeight?: number
        scale?: number
    }
    diceList?: DiceBoxDie[]
    iteration?: number
    rolling?: boolean
    running?: boolean | number
    steps?: number
    animstate?: string
    notationVectors?: DiceBoxNotationVectors | null
    startClickThrow?: (notation: string) => DiceBoxNotationVectors | null
    spawnDice?: (vector: unknown, die?: DiceBoxDie) => void
    simulateThrow?: () => void
    swapDiceFace?: (die: DiceBoxDie, value: number) => void
    renderer?: {
        render?: (scene: unknown, camera: unknown) => void
    }
    scene?: unknown
    camera?: unknown
}

function hasStaticDiceBoxInternals(box: StaticDiceBox) {
    return (
        typeof box.startClickThrow === "function"
        && typeof box.spawnDice === "function"
        && typeof box.simulateThrow === "function"
        && typeof box.swapDiceFace === "function"
        && typeof box.renderer?.render === "function"
    )
}

function setVector(vector: VectorLike | undefined, x: number, y: number, z: number) {
    if (!vector) return

    if (typeof vector.set === "function") {
        vector.set(x, y, z)
        return
    }

    vector.x = x
    vector.y = y
    vector.z = z
}

function copyVector(target: VectorLike | undefined, source: VectorLike | undefined) {
    if (!target || !source) return

    if (typeof target.copy === "function") {
        target.copy(source)
        return
    }

    target.x = source.x
    target.y = source.y
    target.z = source.z
}

function getGridColumnCount(totalDice: number, containerWidth: number, gap: number) {
    if (totalDice <= 3) return totalDice
    if (totalDice <= 6) return Math.ceil(totalDice / 2)

    const availableColumns = Math.max(1, Math.floor(containerWidth / gap))
    return Math.min(4, availableColumns, totalDice)
}

function arrangeStaticDice(staticBox: StaticDiceBox) {
    const diceList = staticBox.diceList ?? []
    if (diceList.length === 0) return

    const display = staticBox.display ?? {}
    const scale = Number(display.scale) || 24
    const containerWidth = Number(display.containerWidth) || scale * 12
    const gap = scale * 4.4
    const rowGap = scale * 4
    const columnCount = getGridColumnCount(diceList.length, containerWidth, gap)
    const rowCount = Math.ceil(diceList.length / columnCount)
    const z = scale * 0.55

    diceList.forEach((die, index) => {
        const row = Math.floor(index / columnCount)
        const column = index % columnCount
        const itemsInRow = row === rowCount - 1 ? diceList.length - (row * columnCount) : columnCount
        const xStart = -((itemsInRow - 1) * gap) / 2
        const yStart = ((rowCount - 1) * rowGap) / 2
        const x = xStart + (column * gap)
        const y = yStart - (row * rowGap)

        setVector(die.position, x, y, z)
        copyVector(die.body?.position, die.position)
        setVector(die.body?.velocity, 0, 0, 0)
        setVector(die.body?.angularVelocity, 0, 0, 0)

        if (die.body) {
            die.body.type = 4
            die.body.sleepState = 2
        }
    })
}

export function renderStaticDiceBoxStandby(box: DiceBox, notation: string) {
    const staticBox = box as StaticDiceBox
    if (!notation || !hasStaticDiceBoxInternals(staticBox)) {
        return false
    }

    const notationVectors = staticBox.startClickThrow?.(notation)
    if (!notationVectors || !Array.isArray(notationVectors.vectors)) {
        return false
    }

    staticBox.notationVectors = notationVectors
    staticBox.clearDice?.()

    for (const vector of notationVectors.vectors) {
        staticBox.spawnDice?.(vector)
    }

    staticBox.simulateThrow?.()

    if (Array.isArray(notationVectors.result)) {
        for (let index = 0; index < notationVectors.result.length; index += 1) {
            const die = staticBox.diceList?.[index]
            const expectedValue = notationVectors.result[index]
            const currentValue = Number(die?.getLastValue?.().value)

            if (die && Number.isFinite(expectedValue) && currentValue !== expectedValue) {
                staticBox.swapDiceFace?.(die, expectedValue)
            }
        }
    }

    staticBox.rolling = false
    staticBox.running = false
    staticBox.animstate = "afterthrow"
    staticBox.steps = 0
    staticBox.iteration = 0
    arrangeStaticDice(staticBox)
    staticBox.renderer?.render?.(staticBox.scene, staticBox.camera)

    return true
}
