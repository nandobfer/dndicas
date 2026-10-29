/**
 * Documentação viva do DnDicas (`aicontext/`) para o Agente Opex (módulo PURO). Copiado do Ciliar.
 *
 * O conteúdo é lido do disco a cada chamada (`server/app-docs.ts`); aqui ficam o público de cada
 * arquivo, o parser das seções Markdown, a busca e a regra das instruções do agente.
 */

import type { OpexRole } from "./scope"

export type AppDocAudience = "all" | "admin"

/**
 * Público de cada arquivo. `all`: qualquer um que use o agente (inclusive visitantes); `admin`: só
 * administradores. ⚠️ Arquivo novo em `aicontext/` precisa entrar aqui: fora do mapa é `admin`.
 */
export const APP_DOC_AUDIENCE: Readonly<Record<string, AppDocAudience>> = {
    "README.md": "all",
    "modules/backgrounds.md": "all",
    "modules/character-sheets.md": "all",
    "modules/classes.md": "all",
    "modules/dice-roller.md": "all",
    "modules/entity-understanding.md": "all",
    "modules/feats.md": "all",
    "modules/opex-feedback.md": "all",
    "modules/items.md": "all",
    "modules/mcp.md": "all",
    "modules/monsters.md": "all",
    "modules/opex-agent.md": "all",
    "modules/owlbear.md": "all",
    "modules/races.md": "all",
    "modules/rules.md": "all",
    "modules/search.md": "all",
    "modules/spells.md": "all",
    "modules/traits.md": "all",
    "modules/ai.md": "admin",
    "modules/core.md": "admin",
    "modules/integrations.md": "admin",
    "modules/seed-data.md": "admin",
    "modules/users.md": "admin",
}

/** Teto de leitura por arquivo (bytes). */
export const APP_DOC_MAX_BYTES = 512 * 1024
/** Janela padrão/máxima de `read_app_doc` (caracteres). */
export const APP_DOC_READ_MAX = 100_000
export const APP_DOC_SEARCH_LIMIT_DEFAULT = 8
export const APP_DOC_SEARCH_LIMIT_MAX = 20

const DOC_PATH = /^(README\.md|use-[a-z0-9-]+\.md|modules\/[a-z0-9-]+\.md)$/

/**
 * Caminho relativo aceito (`README.md`, os guias `use-*.md` — só administradores — ou
 * `modules/<nome>.md`); nada de `..`, absoluto ou outra extensão.
 */
export function isAppDocPath(path: string): boolean {
    return DOC_PATH.test(path)
}

export function appDocAudience(path: string): AppDocAudience {
    return APP_DOC_AUDIENCE[path] ?? "admin"
}

/** O papel do turno libera o arquivo? */
export function canReadAppDoc(path: string, role: OpexRole): boolean {
    if (!isAppDocPath(path)) return false
    return appDocAudience(path) === "all" || role === "admin"
}

export interface AppDocSection {
    title: string
    level: number
    /** Linha do título (1-based). */
    line: number
}

/** Sem acentos e minúsculo, para comparar títulos e buscar. */
export function normalizeDocText(text: string): string {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/

/** Título (`#`) e seções (`##`–`######`), ignorando o que estiver dentro de blocos de código. */
export function parseAppDoc(text: string): { title: string | null; sections: AppDocSection[] } {
    let title: string | null = null
    const sections: AppDocSection[] = []
    let fenced = false
    text.split(/\r?\n/).forEach((raw, index) => {
        if (/^\s*(```|~~~)/.test(raw)) fenced = !fenced
        if (fenced) return
        const match = HEADING.exec(raw)
        if (!match) return
        const level = match[1]!.length
        const heading = match[2]!.trim()
        if (level === 1 && title === null) title = heading
        else sections.push({ title: heading, level, line: index + 1 })
    })
    return { title, sections }
}

/** Texto de uma seção (do título até o próximo de nível igual ou maior); o título exato vence o parcial. */
export function appDocSection(text: string, title: string): { section: AppDocSection; text: string } | null {
    const { sections } = parseAppDoc(text)
    const wanted = normalizeDocText(title.replace(/^#+\s*/, "").trim())
    if (!wanted) return null
    const section = sections.find((item) => normalizeDocText(item.title) === wanted) ?? sections.find((item) => normalizeDocText(item.title).includes(wanted))
    if (!section) return null
    const lines = text.split(/\r?\n/)
    const next = sections.find((item) => item.line > section.line && item.level <= section.level)
    return { section, text: lines.slice(section.line - 1, next ? next.line - 1 : lines.length).join("\n").trimEnd() }
}

export interface AppDocSearchHit {
    path: string
    title: string | null
    /** Seção onde a ocorrência está (null = antes da primeira seção). */
    section: string | null
    line: number
    snippet: string
    score: number
}

const SNIPPET_MAX = 400

function searchTerms(query: string): string[] {
    return [...new Set(normalizeDocText(query).split(/[^\p{L}\p{N}_.-]+/u).map((term) => term.replace(/^[.-]+|[.-]+$/g, "")).filter((term) => term.length >= 2))]
}

/**
 * Busca nos documentos por trecho (seção). Uma seção vale quando contém todos os termos; se nenhuma
 * contiver, valem as que têm algum, pela quantidade de termos. O trecho são as linhas com ocorrência.
 */
export function searchAppDocs(docs: readonly { path: string; text: string }[], query: string, limit = APP_DOC_SEARCH_LIMIT_DEFAULT): AppDocSearchHit[] {
    const terms = searchTerms(query)
    if (!terms.length) return []
    const phrase = normalizeDocText(query.trim())
    const candidates: (AppDocSearchHit & { matched: number })[] = []
    for (const doc of docs) {
        const { title, sections } = parseAppDoc(doc.text)
        const lines = doc.text.split(/\r?\n/)
        const starts = [{ title: null as string | null, line: 1 }, ...sections.map((item) => ({ title: item.title, line: item.line }))]
        starts.forEach((start, index) => {
            const end = index + 1 < starts.length ? starts[index + 1]!.line - 1 : lines.length
            const block = lines.slice(start.line - 1, end)
            const normalized = block.map(normalizeDocText)
            const whole = normalized.join("\n")
            const matched = terms.filter((term) => whole.includes(term)).length
            if (!matched) return
            const hitLines = block.map((line, offset) => ({ line, offset, hits: terms.filter((term) => normalized[offset]!.includes(term)).length })).filter((item) => item.hits > 0)
            const occurrences = terms.reduce((total, term) => total + whole.split(term).length - 1, 0)
            const best = [...hitLines].sort((a, b) => b.hits - a.hits || a.offset - b.offset)[0]!
            const snippet = hitLines
                .slice(0, 4)
                .map((item) => item.line.trim())
                .filter(Boolean)
                .join(" … ")
            candidates.push({
                path: doc.path,
                title,
                section: start.title,
                line: start.line + best.offset,
                snippet: snippet.length > SNIPPET_MAX ? `${snippet.slice(0, SNIPPET_MAX)}…` : snippet,
                score: matched * 10 + Math.min(occurrences, 20) + (whole.includes(phrase) ? 15 : 0) + (start.title && terms.some((term) => normalizeDocText(start.title!).includes(term)) ? 5 : 0),
                matched,
            })
        })
    }
    const complete = candidates.filter((item) => item.matched === terms.length)
    const pool = complete.length ? complete : candidates
    return pool
        .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.line - b.line)
        .slice(0, limit)
        .map((hit) => ({ path: hit.path, title: hit.title, section: hit.section, line: hit.line, snippet: hit.snippet, score: hit.score }))
}

/**
 * Regra fixa das instruções do turno quando as ferramentas da documentação estão disponíveis
 * (vale mesmo com instruções personalizadas na configuração).
 */
export function appDocsInstructions(role: OpexRole): string {
    const lines = [
        "Documentação viva do DnDicas: para qualquer pergunta sobre como o app funciona (telas, fluxos, fichas, Owlbear, busca, feedback, regras do catálogo), consulte a documentação com search_app_docs (e read_app_doc para ler o trecho ou a seção) ANTES de responder; use list_app_docs para ver os documentos disponíveis.",
        "Responda de acordo com o que a documentação diz no momento. Se ela não cobrir o assunto, diga que não encontrou essa informação na documentação, em vez de supor. Regras de D&D vêm do catálogo (ferramentas de catálogo), não da documentação.",
    ]
    lines.push(
        role === "admin"
            ? "Este usuário administra o app: pode citar detalhes técnicos da documentação (arquivos, coleções, rotas, integrações) quando ajudarem."
            : "Este usuário não administra o app: explique na linguagem da tela (nomes de menus, abas e botões), sem citar coleções do banco, nomes de arquivos, rotas de API, variáveis de ambiente ou detalhes de infraestrutura.",
    )
    return lines.join("\n")
}
