"use client"

const DICE_SESSION_STORAGE_KEY = "dndicas:dice-session-id"

export function getOrCreateDiceSessionId() {
    if (typeof window === "undefined") return null

    const existing = window.localStorage.getItem(DICE_SESSION_STORAGE_KEY)
    if (existing) return existing

    const next = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
    window.localStorage.setItem(DICE_SESSION_STORAGE_KEY, next)
    return next
}
