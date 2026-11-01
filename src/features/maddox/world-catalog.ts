/**
 * Povos e classes do mundo da campanha (Maddox 8, Fiel ao D&D) — módulo PURO (tela e servidor). O cenário grava só
 * entidades do catálogo; uma lista vazia significa que todo o catálogo vale.
 */

export interface WorldCatalogRef {
    id: string
    name: string
}

export interface WorldCatalog {
    races: WorldCatalogRef[]
    classes: WorldCatalogRef[]
}

export const emptyWorldCatalog = (): WorldCatalog => ({ races: [], classes: [] })

/** Normaliza o que vem do banco (`null`, campos ausentes) para listas. */
export function worldCatalogOf(value: Partial<WorldCatalog> | null | undefined): WorldCatalog {
    return { races: [...(value?.races ?? [])], classes: [...(value?.classes ?? [])] }
}

/** A entidade do catálogo vale neste mundo? Lista vazia = todo o catálogo. */
export function worldAllows(list: readonly WorldCatalogRef[], id: string | null | undefined): boolean {
    if (!list.length) return true
    return Boolean(id && list.some((item) => item.id === id))
}

export const worldNames = (list: readonly WorldCatalogRef[]) => list.map((item) => item.name).join(", ")

/** Uma linha por lista para os prompts ("todo o catálogo" quando vazia). */
export function worldCatalogLines(world: WorldCatalog): string[] {
    return [
        `- Povos (raças) deste mundo: ${world.races.length ? worldNames(world.races) : "todos os do catálogo do DnDicas"}.`,
        `- Classes deste mundo: ${world.classes.length ? worldNames(world.classes) : "todas as do catálogo do DnDicas"}.`,
    ]
}
