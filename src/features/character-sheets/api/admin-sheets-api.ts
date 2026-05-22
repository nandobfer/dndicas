"use client"

import type { AdminSheetsListResponse } from "../types/character-sheet.types"

const API_BASE = "/api/admin/sheets"

interface AdminSheetsFilters {
    search?: string
    page?: number
    limit?: number
}

interface ApiError {
    error: string
    details?: string
}

async function fetchApi<T>(url: string): Promise<T> {
    const response = await fetch(url, {
        headers: {
            "Content-Type": "application/json",
        },
    })

    if (!response.ok) {
        const error: ApiError = await response.json().catch(() => ({
            error: "Unknown error",
        }))
        throw new Error(error.error || `HTTP ${response.status}`)
    }

    return response.json()
}

function buildQueryString(filters: AdminSheetsFilters): string {
    const params = new URLSearchParams()

    if (filters.search) params.set("search", filters.search)
    if (filters.page) params.set("page", String(filters.page))
    if (filters.limit) params.set("limit", String(filters.limit))

    const queryString = params.toString()
    return queryString ? `?${queryString}` : ""
}

export async function fetchAdminSheets(filters: AdminSheetsFilters): Promise<AdminSheetsListResponse> {
    return fetchApi<AdminSheetsListResponse>(`${API_BASE}${buildQueryString(filters)}`)
}
