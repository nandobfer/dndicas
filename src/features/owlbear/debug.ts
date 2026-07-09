export function isOwlbearDebugEnabled() {
    if (typeof window === "undefined") return false
    return window.location.search.includes("dndicasDebug=1") || window.localStorage.getItem("dndicasOwlbearDebug") === "1"
}

export function logOwlbearDebug(prefix: string, message: string, details?: Record<string, unknown>) {
    if (!isOwlbearDebugEnabled()) return
    console.info(prefix, message, details ?? {})
}
