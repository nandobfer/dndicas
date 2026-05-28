import { describe, expect, it } from "vitest"

import {
    extractIndexedBranchFromImagePayload,
    omitNestedArrayFromImagePayload,
} from "@/features/shared/ai/image-form-payload"

describe("image form payload helpers", () => {
    it("removes subclasses from the base class payload", () => {
        const payload = {
            name: "Guerreiro",
            description: "Classe marcial.",
            source: "PHB",
            subclasses: [
                { name: "Campeão" },
                { name: "Mestre de Batalha" },
            ],
        }

        expect(omitNestedArrayFromImagePayload(payload, "subclasses")).toEqual({
            name: "Guerreiro",
            description: "Classe marcial.",
            source: "PHB",
        })
    })

    it("returns only the active subclass branch", () => {
        const payload = {
            name: "Mago",
            subclasses: [
                { name: "Evocação", description: "Especialistas em energia." },
                { name: "Ilusão", description: "Arquitetos do engano." },
            ],
        }

        expect(extractIndexedBranchFromImagePayload(payload, "subclasses", 1)).toEqual({
            name: "Ilusão",
            description: "Arquitetos do engano.",
        })
    })

    it("removes variations from the base race payload", () => {
        const payload = {
            name: "Elfo",
            description: "Povo feérico.",
            speed: "9m",
            variations: [
                { name: "Alto Elfo" },
                { name: "Elfo da Floresta" },
            ],
        }

        expect(omitNestedArrayFromImagePayload(payload, "variations")).toEqual({
            name: "Elfo",
            description: "Povo feérico.",
            speed: "9m",
        })
    })

    it("returns only the active race variation branch", () => {
        const payload = {
            name: "Anão",
            variations: [
                { name: "Anão da Colina", description: "Resistente e sábio." },
                { name: "Anão da Montanha", description: "Robusto e guerreiro." },
            ],
        }

        expect(extractIndexedBranchFromImagePayload(payload, "variations", 0)).toEqual({
            name: "Anão da Colina",
            description: "Resistente e sábio.",
        })
    })
})
