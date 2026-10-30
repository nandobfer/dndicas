import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const FILES = [
    "src/components/ui/glass-header.tsx",
    "src/components/ui/header-category-menu.tsx",
    "src/components/ui/header-mobile-menu.tsx",
    "src/components/ui/header-user-menu.tsx",
    "src/features/dice-roller/components/global-fab-group.tsx",
    "src/features/opex-agent/components/OpexFab.tsx",
]

describe("controles do novo layout", () => {
    it.each(FILES)("%s não usa abas do core nem controles nativos", (file) => {
        const source = readFileSync(resolve(process.cwd(), file), "utf8")
        expect(source).not.toMatch(/@\/core\/ui\/tabs/)
        expect(source).not.toMatch(/<select[\s>]/)
        expect(source).not.toMatch(/type=["']checkbox["']/)
    })
})
