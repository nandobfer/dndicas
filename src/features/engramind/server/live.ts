import { createEventBus, type EventBus } from "@engramind/client/server"

/**
 * Barramento em processo do SSE da rede (`/api/engramind/events`). O dndicas roda numa instância só
 * (um processo PM2 / um container), então o webhook e os navegadores ficam no mesmo processo.
 */
const holder = globalThis as typeof globalThis & { __engramindBus?: EventBus }

export function engramindBus(): EventBus {
    return (holder.__engramindBus ??= createEventBus())
}
