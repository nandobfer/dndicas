import { OWLBEAR_POPOVER_SIZES } from "./config"
import type { OwlbearRuntimeState, OwlbearSdkLike, OwlbearTabId, OwlbearTheme } from "./types"

const READY_TIMEOUT_MS = 4000

function getThemeMode(theme: OwlbearTheme | null | undefined): OwlbearRuntimeState["themeMode"] {
    return theme?.mode === "LIGHT" ? "light" : "dark"
}

export async function loadOwlbearSdk(): Promise<OwlbearSdkLike | null> {
    if (typeof window === "undefined") return null

    const module = await import("@owlbear-rodeo/sdk")
    return module.default as OwlbearSdkLike
}

function waitForOwlbearReady(sdk: OwlbearSdkLike, timeoutMs = READY_TIMEOUT_MS) {
    return new Promise<void>((resolve, reject) => {
        if (!sdk.isAvailable) {
            reject(new Error("Owlbear SDK unavailable in this context"))
            return
        }

        if (sdk.isReady) {
            resolve()
            return
        }

        const timeoutId = window.setTimeout(() => {
            reject(new Error("Timed out waiting for Owlbear SDK ready event"))
        }, timeoutMs)

        sdk.onReady(() => {
            window.clearTimeout(timeoutId)
            resolve()
        })
    })
}

export async function bootstrapOwlbearRuntime(): Promise<OwlbearRuntimeState> {
    try {
        const sdk = await loadOwlbearSdk()
        if (!sdk) {
            throw new Error("Owlbear SDK unavailable during SSR")
        }

        await waitForOwlbearReady(sdk)

        const [role, playerId, theme, sceneReady] = await Promise.all([
            sdk.player.getRole(),
            sdk.player.getId(),
            sdk.theme.getTheme(),
            sdk.scene.isReady(),
        ])

        return {
            status: "ready",
            role,
            roomId: sdk.room.id ?? null,
            playerId,
            themeMode: getThemeMode(theme),
            sceneReady,
        }
    } catch (error) {
        console.error("Failed to bootstrap Owlbear runtime", error)

        return {
            status: "unavailable",
            role: null,
            roomId: null,
            playerId: null,
            themeMode: "dark",
            sceneReady: false,
        }
    }
}

export async function setActionPopoverSize(tabId: OwlbearTabId | "fallback") {
    const sdk = await loadOwlbearSdk()
    if (!sdk || !sdk.isAvailable || !sdk.isReady) return

    const size = OWLBEAR_POPOVER_SIZES[tabId]
    await Promise.all([sdk.action.setWidth(size.width), sdk.action.setHeight(size.height)])
}
