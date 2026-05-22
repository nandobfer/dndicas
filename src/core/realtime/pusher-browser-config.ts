"use client"

import type { PusherBrowserConfig, PusherBrowserConfigErrorResponse } from "./pusher-config"

const PUSHER_BROWSER_CONFIG_ENDPOINT = "/api/realtime/pusher-config"

let browserConfigPromise: Promise<PusherBrowserConfig | null> | null = null

export async function getPusherBrowserConfig(): Promise<PusherBrowserConfig | null> {
    if (!browserConfigPromise) {
        browserConfigPromise = loadPusherBrowserConfig()
    }

    return browserConfigPromise
}

async function loadPusherBrowserConfig(): Promise<PusherBrowserConfig | null> {
    try {
        const response = await fetch(PUSHER_BROWSER_CONFIG_ENDPOINT, {
            method: "GET",
            cache: "no-store",
        })

        if (!response.ok) {
            const body = (await response.json().catch(() => null)) as PusherBrowserConfigErrorResponse | null
            console.error("[realtime] Failed to load Pusher browser config.", {
                status: response.status,
                error: body?.error ?? "Unknown error",
            })
            browserConfigPromise = null
            return null
        }

        return response.json() as Promise<PusherBrowserConfig>
    } catch (error) {
        console.error("[realtime] Failed to fetch Pusher browser config.", error)
        browserConfigPromise = null
        return null
    }
}

export function resetPusherBrowserConfigCache() {
    browserConfigPromise = null
}
