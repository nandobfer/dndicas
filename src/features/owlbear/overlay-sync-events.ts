export type OwlbearOverlaySyncEvent = {
    kind: "player" | "npc"
    refId: string
    hpCurrent: number
    hpMax: number
    name?: string
}

const listeners = new Set<(event: OwlbearOverlaySyncEvent) => void>()

export function notifyOwlbearOverlaySync(event: OwlbearOverlaySyncEvent) {
    for (const listener of listeners) {
        listener(event)
    }
}

export function subscribeOwlbearOverlaySync(callback: (event: OwlbearOverlaySyncEvent) => void) {
    listeners.add(callback)
    return () => {
        listeners.delete(callback)
    }
}
