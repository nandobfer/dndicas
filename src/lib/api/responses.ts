import { NextResponse } from "next/server"
import type { ZodError } from "zod"
import type { ApiResponse } from "@/lib/types/api"

export function ok<T>(data: T, init?: ResponseInit) {
    return NextResponse.json<ApiResponse<T>>({ success: true, data }, init)
}

export function created<T>(data: T) {
    return ok(data, { status: 201 })
}

export function fail(status: number, error: string, code?: string, details?: unknown) {
    return NextResponse.json<ApiResponse<never>>(
        { success: false, error, ...(code ? { code } : {}), ...(details !== undefined ? { details } : {}) },
        { status },
    )
}

/** 404 genérica. */
export function notFoundResponse() {
    return fail(404, "Não encontrado")
}

export function validationError(error: ZodError) {
    return fail(400, "Dados inválidos", "VALIDATION_ERROR", error.issues)
}
