import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const VERSION_FILE = "src/lib/config/version.ts"

export async function bumpAppPatchVersion(worktreePath: string) {
    const filePath = path.join(worktreePath, VERSION_FILE)
    const source = await readFile(filePath, "utf8")
    const match = source.match(/APP_VERSION\s*=\s*"v(\d+)\.(\d+)\.(\d+)"/)
    if (!match) throw new Error("Não foi possível identificar APP_VERSION em src/lib/config/version.ts")

    const [, major, minor, patch] = match
    const nextVersion = `v${major}.${minor}.${Number(patch) + 1}`
    await writeFile(filePath, source.replace(match[0], `APP_VERSION = "${nextVersion}"`))

    return nextVersion
}
