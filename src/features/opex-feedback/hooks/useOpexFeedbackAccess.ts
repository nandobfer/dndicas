"use client"
import { useQuery } from "@tanstack/react-query"
import { withBasePath } from "@/lib/base-path"
import type { OpexAccess } from "../types"

export class OpexApiError extends Error {
    constructor(message: string, readonly code?: string) { super(message) }
}
export async function readOpexResponse<T>(response: Response): Promise<T> {
    const body = await response.json()
    if (!response.ok || !body.success) throw new OpexApiError(body.error || "Não foi possível acessar o Opex.", body.code)
    return body.data as T
}
export function useOpexFeedbackAccess(userId: string | undefined, enabled: boolean) {
    return useQuery({
        queryKey: ["opex-feedback", userId, "access"],
        queryFn: async () => readOpexResponse<OpexAccess>(await fetch(withBasePath("/api/opex-feedback/access"), { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", cache: "no-store" })),
        enabled: enabled && Boolean(userId),
        retry: false,
        staleTime: 30_000,
        gcTime: 0,
        refetchOnWindowFocus: false,
    })
}
