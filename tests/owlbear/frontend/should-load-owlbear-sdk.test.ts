import { describe, expect, it } from "vitest"
import { shouldLoadOwlbearSdk } from "@/features/owlbear/should-load-owlbear-sdk"

describe("shouldLoadOwlbearSdk", () => {
    it("returns false on the normal site outside Owlbear", () => {
        const sameWindow = {}
        expect(shouldLoadOwlbearSdk({
            location: {
                pathname: "/",
                search: "",
            },
            self: sameWindow,
            top: sameWindow,
        })).toBe(false)
    })

    it("returns true on Owlbear routes", () => {
        expect(shouldLoadOwlbearSdk({
            location: {
                pathname: "/owlbear/action",
                search: "",
            },
            self: {},
            top: {},
        })).toBe(true)
    })

    it("returns true for the catalog embed query flag", () => {
        expect(shouldLoadOwlbearSdk({
            location: {
                pathname: "/",
                search: "?owlbearCatalogEmbed=1",
            },
            self: {},
            top: {},
        })).toBe(true)
    })

    it("returns true when running inside an iframe", () => {
        const top = {}
        expect(shouldLoadOwlbearSdk({
            location: {
                pathname: "/",
                search: "",
            },
            self: {},
            top,
        })).toBe(true)
    })
})
