import { describe, expect, it } from "vitest"
import { readJson } from "../../backend/helpers/http"
import { importFresh } from "../../backend/helpers/module"

describe("owlbear manifest", () => {
    it.each([
        ["catalog", "@/app/owlbear/catalog/manifest.json/route", "/owlbear/catalog/action", "/owlbear/icons/catalog.svg", undefined],
        ["sheet", "@/app/owlbear/sheet/manifest.json/route", "/owlbear/sheet/action", "/owlbear/icons/sheet.svg", "/owlbear/sheet/background"],
        ["npcs", "@/app/owlbear/npcs/manifest.json/route", "/owlbear/npcs/action", "/owlbear/icons/npcs.svg", "/owlbear/npcs/background"],
        ["dice", "@/app/owlbear/dice/manifest.json/route", "/owlbear/dice/action", "/owlbear/icons/dice.svg", undefined],
    ])("declares the %s action manifest", async (_name, routePath, actionPath, iconPath, backgroundPath) => {
        const mod = await importFresh<{ GET: (request: Request) => Response | Promise<Response> }>(routePath)
        const response = await mod.GET(new Request(`https://dndicas.example${actionPath.replace("/action", "/manifest.json")}`))
        const payload = await readJson<{
            icon: string
            background_url?: string
            action: {
                icon: string
                popover: string
                height: number
            }
        }>(response)

        expect(response.status).toBe(200)
        expect(payload.icon).toBe(`https://dndicas.example${iconPath}`)
        expect(payload.action).toEqual(expect.objectContaining({
            icon: `https://dndicas.example${iconPath}`,
            popover: `https://dndicas.example${actionPath}`,
            height: 900,
        }))
        expect(payload.background_url).toBe(backgroundPath ? `https://dndicas.example${backgroundPath}` : undefined)
    })

    it.each([
        ["catalog", "@/app/owlbear/icons/catalog.svg/route"],
        ["sheet", "@/app/owlbear/icons/sheet.svg/route"],
        ["npcs", "@/app/owlbear/icons/npcs.svg/route"],
        ["dice", "@/app/owlbear/icons/dice.svg/route"],
        ["context menu", "@/app/owlbear/icons/context-menu.svg/route"],
    ])("serves the %s icon with CORS headers and currentColor", async (_name, routePath) => {
        const mod = await importFresh<{ GET: () => Response | Promise<Response> }>(routePath)
        const response = await mod.GET()
        const body = await response.text()

        expect(response.status).toBe(200)
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*")
        expect(response.headers.get("Content-Type")).toContain("image/svg+xml")
        expect(response.headers.get("Cache-Control")).toBe("no-store")
        if (_name !== "context menu") {
            expect(body).toContain("currentColor")
        }
        expect(body).not.toContain('stroke="#fff"')
    })
})
