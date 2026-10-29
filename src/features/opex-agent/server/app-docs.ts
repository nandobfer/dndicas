import { lstat, readdir, readFile, realpath } from "node:fs/promises"
import path from "node:path"
import { APP_DOC_MAX_BYTES, canReadAppDoc, isAppDocPath } from "../app-docs"
import type { OpexRole } from "../scope"

/**
 * Leitura da documentação viva (`aicontext/`) direto do disco, a cada chamada: sem cópia no código e
 * sem cache, para refletir o conteúdo atual. Em produção o Dockerfile copia o diretório para a imagem.
 */

export function appDocsRoot(): string {
    return path.join(process.cwd(), "aicontext")
}

export class AppDocNotFoundError extends Error {
    constructor(docPath: string) {
        super(`Documento "${docPath}" não encontrado ou não disponível para este usuário. Use list_app_docs para ver os documentos disponíveis.`)
        this.name = "AppDocNotFoundError"
    }
}

export interface AppDocFile {
    path: string
    text: string
    updatedAt: string
}

async function regularFile(root: string, docPath: string): Promise<{ absolute: string; size: number; mtime: Date } | null> {
    if (!isAppDocPath(docPath)) return null
    const absolute = path.join(root, docPath)
    try {
        const stats = await lstat(absolute)
        // Links simbólicos e o que não for arquivo comum ficam de fora.
        if (!stats.isFile()) return null
        const [realRoot, realFile] = await Promise.all([realpath(root), realpath(absolute)])
        if (!realFile.startsWith(realRoot + path.sep)) return null
        return { absolute, size: stats.size, mtime: stats.mtime }
    } catch {
        return null
    }
}

/** Caminhos relativos existentes (`README.md`, `use-*.md` e `modules/*.md`), em ordem: README primeiro. */
export async function listAppDocPaths(root = appDocsRoot()): Promise<string[]> {
    const [top, modules] = await Promise.all([readdir(root).catch(() => [] as string[]), readdir(path.join(root, "modules")).catch(() => [] as string[])])
    const guides = top.filter((name) => /^use-[a-z0-9-]+\.md$/.test(name)).sort()
    const candidates = ["README.md", ...modules.sort().map((name) => `modules/${name}`), ...guides]
    const valid = await Promise.all(candidates.map(async (docPath) => ((await regularFile(root, docPath)) ? docPath : null)))
    return valid.filter((docPath): docPath is string => docPath !== null)
}

/** Lê um documento liberado para o papel; inexistente, inválido ou restrito dão o mesmo erro. */
export async function readAppDoc(docPath: string, role: OpexRole, root = appDocsRoot()): Promise<AppDocFile> {
    const normalized = docPath.trim().replace(/^\.?\//, "").replace(/^aicontext\//, "")
    if (!canReadAppDoc(normalized, role)) throw new AppDocNotFoundError(docPath)
    const file = await regularFile(root, normalized)
    if (!file) throw new AppDocNotFoundError(docPath)
    if (file.size > APP_DOC_MAX_BYTES) throw new Error(`Documento "${normalized}" excede o limite de leitura (${Math.round(APP_DOC_MAX_BYTES / 1024)} KB).`)
    return { path: normalized, text: await readFile(file.absolute, "utf8"), updatedAt: file.mtime.toISOString() }
}

/** Todos os documentos que o papel libera, já lidos. */
export async function readAllowedAppDocs(role: OpexRole, root = appDocsRoot()): Promise<AppDocFile[]> {
    const paths = (await listAppDocPaths(root)).filter((docPath) => canReadAppDoc(docPath, role))
    const docs = await Promise.all(paths.map((docPath) => readAppDoc(docPath, role, root).catch(() => null)))
    return docs.filter((doc): doc is AppDocFile => doc !== null)
}
