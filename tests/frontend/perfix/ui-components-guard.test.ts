import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOTS = ["src/features/perfix/components", "src/features/users/components"]
function tsxFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        return statSync(path).isDirectory() ? tsxFiles(path) : path.endsWith(".tsx") ? [path] : []
    })
}
const FORBIDDEN: [RegExp, string][] = [
    [/@\/core\/ui\/tabs/, "abas do core (aba ativa preta): use IntegrationTabs, GlassSelector ou OptionTabs"],
    [/<select[\s>]/, "<select> nativo: use o Select Glass de @/core/ui/select ou GlassSelector"],
    [/<input[^>]*type=["']checkbox["']/, "checkbox nativo: use @/core/ui/checkbox"],
]

describe("telas do Perfix e de usuários usam os componentes do design system", () => {
    it("sem abas do core, select ou checkbox nativos", () => {
        const problems = ROOTS.flatMap(tsxFiles).flatMap((file) => {
            const source = readFileSync(file, "utf8")
            return FORBIDDEN.filter(([pattern]) => pattern.test(source)).map(([, reason]) => `${file}: ${reason}`)
        })
        expect(problems).toEqual([])
    })
})
