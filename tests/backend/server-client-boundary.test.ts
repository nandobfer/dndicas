import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Fronteira servidor x cliente (DND-56): no bundle do Next, uma função exportada por um módulo `"use client"` vira
 * referência de cliente e LANÇA quando o servidor a chama ("Attempted to call X() from the server…"). O Vitest
 * ignora a diretiva, então só este teste pega a regressão: nenhum módulo de servidor pode alcançar, pelos imports de
 * valor (não `import type`), um arquivo `"use client"`.
 */

const ROOT = process.cwd()
const SRC = path.join(ROOT, "src")
const SERVER_ROOTS = ["src/app/api", "src/features/character-sheets/level-up", "src/features/character-sheets/api/character-sheets-service.ts"]
const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"]

function walk(entry: string): string[] {
    const full = path.join(ROOT, entry)
    if (!existsSync(full)) return []
    if (statSync(full).isFile()) return [full]
    return readdirSync(full, { withFileTypes: true }).flatMap((item) => {
        const child = path.join(entry, item.name)
        if (item.isDirectory()) return walk(child)
        return /\.tsx?$/.test(item.name) ? [path.join(ROOT, child)] : []
    })
}

function serverDirs(): string[] {
    const features = path.join(SRC, "features")
    return readdirSync(features, { withFileTypes: true })
        .filter((item) => item.isDirectory() && existsSync(path.join(features, item.name, "server")))
        .map((item) => `src/features/${item.name}/server`)
}

function resolveImport(from: string, spec: string): string | null {
    let base: string
    if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2))
    else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec)
    else return null
    if (/\.tsx?$/.test(base) && existsSync(base)) return base
    for (const ext of EXTENSIONS) if (existsSync(base + ext)) return base + ext
    return null
}

/** Imports de valor: `import x from`, `export … from`, `import("…")` e `import "…"`; `import type`/`export type` ficam de fora. */
export function valueImports(source: string): string[] {
    const specs: string[] = []
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    for (const match of code.matchAll(/(?:^|\n)\s*(import|export)\s+(type\s+)?[^'"]*?\sfrom\s+["']([^"']+)["']/g)) {
        if (!match[2]) specs.push(match[3]!)
    }
    for (const match of code.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) specs.push(match[1]!)
    for (const match of code.matchAll(/(?:^|\n)\s*import\s+["']([^"']+)["']/g)) specs.push(match[1]!)
    return specs
}

const isClientModule = (source: string) => /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use client["']/.test(source)

function clientReachedFrom(entries: string[]): string[] {
    const seen = new Map<string, string | null>()
    const queue = entries.map((file) => ({ file, via: null as string | null }))
    const offenders: string[] = []
    while (queue.length) {
        const { file, via } = queue.shift()!
        if (seen.has(file)) continue
        seen.set(file, via)
        const source = readFileSync(file, "utf8")
        if (via && isClientModule(source)) {
            const chain = [file]
            let step: string | null = via
            while (step) {
                chain.push(step)
                step = seen.get(step) ?? null
            }
            offenders.push(chain.reverse().map((item) => path.relative(ROOT, item)).join(" -> "))
            continue
        }
        for (const spec of valueImports(source)) {
            const target = resolveImport(file, spec)
            if (target && !seen.has(target)) queue.push({ file: target, via: file })
        }
    }
    return offenders
}

describe("fronteira servidor x cliente", () => {
    it("lê imports de valor e ignora os de tipo", () => {
        const source = ['import type { A } from "./a"', 'import { b } from "./b"', 'export type { C } from "./c"', 'export { d } from "./d"', 'const e = await import("./e")', 'import "./f"'].join("\n")
        expect(valueImports(source).sort()).toEqual(["./b", "./d", "./e", "./f"])
    })

    it("nenhum módulo de servidor alcança um arquivo \"use client\"", () => {
        const entries = [...SERVER_ROOTS, ...serverDirs()].flatMap(walk).filter((file) => !isClientModule(readFileSync(file, "utf8")))
        expect(entries.length).toBeGreaterThan(50)
        expect(clientReachedFrom(entries)).toEqual([])
    })
})
