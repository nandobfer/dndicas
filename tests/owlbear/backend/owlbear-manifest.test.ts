import { describe, expect, it } from "vitest"
import { readJson } from "../../backend/helpers/http"
import { importFresh } from "../../backend/helpers/module"

describe("owlbear manifest", () => {
    it("declares the fixed action size", async () => {
        const mod = await importFresh<typeof import("@/app/owlbear/manifest.json/route")>("@/app/owlbear/manifest.json/route")
        const response = await mod.GET(new Request("https://dndicas.example/owlbear/manifest.json"))
        const payload = await readJson(response)

        expect(response.status).toBe(200)
        expect(payload.action).toEqual(expect.objectContaining({
            popover: "https://dndicas.example/owlbear/action",
            width: 1320,
            height: 900,
        }))
    })
})
