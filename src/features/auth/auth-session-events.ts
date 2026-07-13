export const AUTH_SESSION_CHANGED_EVENT = "dndicas:auth-session-changed"

export type AuthSessionChangeReason = "signed-in" | "signed-out" | "refresh"

export function notifyAuthSessionChanged(reason: AuthSessionChangeReason = "refresh") {
    if (typeof window === "undefined") return
    window.dispatchEvent(new CustomEvent<AuthSessionChangeReason>(AUTH_SESSION_CHANGED_EVENT, { detail: reason }))
}
