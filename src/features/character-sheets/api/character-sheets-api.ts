"use client"

import type {
    CharacterSheet,
    CharacterSheetFull,
    CharacterItem,
    CharacterSpell,
    CharacterTrait,
    CharacterFeat,
    CharacterAttack,
    SheetsListResponse,
    PatchSheetBody,
    CreateItemBody,
    PatchItemBody,
    CreateSpellBody,
    PatchSpellBody,
    CreateTraitBody,
    CreateFeatBody,
    CreateAttackBody,
    PatchAttackBody,
} from "../types/character-sheet.types"

const API_BASE = "/api/character-sheets"

const handleResponse = async <T>(res: Response): Promise<T> => {
    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Erro desconhecido" }))
        throw new Error(error.error ?? `HTTP ${res.status}`)
    }
    return res.json() as Promise<T>
}

// ─── Character Sheets ─────────────────────────────────────────────────────────

export const fetchSheets = (params: { page?: number; limit?: number; search?: string } = {}): Promise<SheetsListResponse> => {
    const q = new URLSearchParams()
    if (params.page) q.set("page", String(params.page))
    if (params.limit) q.set("limit", String(params.limit))
    if (params.search) q.set("search", params.search)
    return fetch(`${API_BASE}?${q.toString()}`).then(handleResponse<SheetsListResponse>)
}

export const fetchSheet = (id: string): Promise<CharacterSheetFull> =>
    fetch(`${API_BASE}/${id}`).then(handleResponse<CharacterSheetFull>)

export const fetchSheetBySlug = (slug: string): Promise<CharacterSheetFull> =>
    fetch(`${API_BASE}/by-slug?slug=${encodeURIComponent(slug)}`).then(handleResponse<CharacterSheetFull>)

export const createSheet = (): Promise<CharacterSheet> =>
    fetch(API_BASE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
        .then(handleResponse<CharacterSheet>)

export const patchSheet = (id: string, data: PatchSheetBody): Promise<CharacterSheet> =>
    fetch(`${API_BASE}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
        .then(handleResponse<CharacterSheet>)

export const deleteSheet = (id: string): Promise<{ success: boolean }> =>
    fetch(`${API_BASE}/${id}`, { method: "DELETE" }).then(handleResponse<{ success: boolean }>)

export const triggerLongRest = (id: string): Promise<CharacterSheet> =>
    fetch(`${API_BASE}/${id}/long-rest`, { method: "POST" }).then(handleResponse<CharacterSheet>)

// ─── Items ────────────────────────────────────────────────────────────────────

export const fetchItems = (sheetId: string): Promise<CharacterItem[]> =>
    fetch(`${API_BASE}/${sheetId}/items`).then(handleResponse<CharacterItem[]>)

export const addItem = (sheetId: string, data: CreateItemBody): Promise<CharacterItem> =>
    fetch(`${API_BASE}/${sheetId}/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
        .then(handleResponse<CharacterItem>)

export const patchItem = (sheetId: string, itemId: string, data: PatchItemBody): Promise<CharacterItem> =>
    fetch(`${API_BASE}/${sheetId}/items/${itemId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
        .then(handleResponse<CharacterItem>)

export const removeItem = (sheetId: string, itemId: string): Promise<{ success: boolean }> =>
    fetch(`${API_BASE}/${sheetId}/items/${itemId}`, { method: "DELETE" }).then(handleResponse<{ success: boolean }>)

// ─── Spells ───────────────────────────────────────────────────────────────────

export const fetchSpells = (sheetId: string): Promise<CharacterSpell[]> =>
    fetch(`${API_BASE}/${sheetId}/spells`).then(handleResponse<CharacterSpell[]>)

export const addSpell = (sheetId: string, data: CreateSpellBody): Promise<CharacterSpell> =>
    fetch(`${API_BASE}/${sheetId}/spells`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
        .then(handleResponse<CharacterSpell>)

export const patchSpell = (sheetId: string, spellId: string, data: PatchSpellBody): Promise<CharacterSpell> =>
    fetch(`${API_BASE}/${sheetId}/spells/${spellId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
        .then(handleResponse<CharacterSpell>)

export const removeSpell = (sheetId: string, spellId: string): Promise<{ success: boolean }> =>
    fetch(`${API_BASE}/${sheetId}/spells/${spellId}`, { method: "DELETE" }).then(handleResponse<{ success: boolean }>)

// ─── Traits ───────────────────────────────────────────────────────────────────

export const fetchTraits = (sheetId: string): Promise<CharacterTrait[]> =>
    fetch(`${API_BASE}/${sheetId}/traits`).then(handleResponse<CharacterTrait[]>)

export const addTrait = (sheetId: string, data: CreateTraitBody): Promise<CharacterTrait> =>
    fetch(`${API_BASE}/${sheetId}/traits`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
        .then(handleResponse<CharacterTrait>)

export const removeTrait = (sheetId: string, traitId: string): Promise<{ success: boolean }> =>
    fetch(`${API_BASE}/${sheetId}/traits/${traitId}`, { method: "DELETE" }).then(handleResponse<{ success: boolean }>)

// ─── Feats ────────────────────────────────────────────────────────────────────

export const fetchFeats = (sheetId: string): Promise<CharacterFeat[]> =>
    fetch(`${API_BASE}/${sheetId}/feats`).then(handleResponse<CharacterFeat[]>)

export const addFeat = (sheetId: string, data: CreateFeatBody): Promise<CharacterFeat> =>
    fetch(`${API_BASE}/${sheetId}/feats`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
        .then(handleResponse<CharacterFeat>)

export const removeFeat = (sheetId: string, featId: string): Promise<{ success: boolean }> =>
    fetch(`${API_BASE}/${sheetId}/feats/${featId}`, { method: "DELETE" }).then(handleResponse<{ success: boolean }>)

// ─── Attacks ──────────────────────────────────────────────────────────────────

export const fetchAttacks = (sheetId: string): Promise<CharacterAttack[]> =>
    fetch(`${API_BASE}/${sheetId}/attacks`).then(handleResponse<CharacterAttack[]>)

export const addAttack = (sheetId: string, data: CreateAttackBody): Promise<CharacterAttack> =>
    fetch(`${API_BASE}/${sheetId}/attacks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
        .then(handleResponse<CharacterAttack>)

export const patchAttack = (sheetId: string, attackId: string, data: PatchAttackBody): Promise<CharacterAttack> =>
    fetch(`${API_BASE}/${sheetId}/attacks/${attackId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
        .then(handleResponse<CharacterAttack>)

export const removeAttack = (sheetId: string, attackId: string): Promise<{ success: boolean }> =>
    fetch(`${API_BASE}/${sheetId}/attacks/${attackId}`, { method: "DELETE" }).then(handleResponse<{ success: boolean }>)
