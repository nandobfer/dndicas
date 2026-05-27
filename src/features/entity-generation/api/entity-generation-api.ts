import type { GeneratedRaceCandidate, RaceGenerationApplyResponse } from "../types/entity-generation.types"

export async function applyRaceGenerationCandidate(raceId: string, candidate: GeneratedRaceCandidate): Promise<RaceGenerationApplyResponse> {
    const response = await fetch(`/api/admin/entity-generation/races/${raceId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate }),
    })

    if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error ?? "Erro ao salvar geração com IA.")
    }

    return response.json()
}
