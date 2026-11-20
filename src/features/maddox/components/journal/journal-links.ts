import type { MaddoxCampaignMemoryKind } from "../../constants"

/** Abas do Diário da campanha (`?aba=`), na ordem da tela; a primeira é a padrão (sem `?aba=`). */
export const MADDOX_JOURNAL_TABS = ["capitulos", "imagens", "npcs", "locais", "missoes", "anotacoes", "grupo"] as const
export type MaddoxJournalTab = (typeof MADDOX_JOURNAL_TABS)[number]

/** Tipos de memória da aba Anotações (locais e missões têm aba própria). */
export const MADDOX_JOURNAL_NOTE_KINDS = ["evento", "relacao", "fato", "outro"] as const satisfies readonly MaddoxCampaignMemoryKind[]
export type MaddoxJournalNoteKind = (typeof MADDOX_JOURNAL_NOTE_KINDS)[number]

export const MADDOX_JOURNAL_DEFAULT_TAB: MaddoxJournalTab = MADDOX_JOURNAL_TABS[0]

/** Aba de `?aba=`; valor desconhecido (inclusive o antigo `historico`, DND-77) cai na aba padrão. */
export const parseJournalTab = (value: string | null | undefined): MaddoxJournalTab => (MADDOX_JOURNAL_TABS as readonly string[]).includes(value ?? "") ? (value as MaddoxJournalTab) : MADDOX_JOURNAL_DEFAULT_TAB

export function memoryTab(kind: MaddoxCampaignMemoryKind): MaddoxJournalTab {
    if (kind === "local") return "locais"
    if (kind === "missao") return "missoes"
    return "anotacoes"
}

/** Âncora de um item no diário (o card recebe o mesmo `id`). */
export const journalAnchor = { npc: (id: string) => `npc-${id}`, memory: (id: string) => `anotacao-${id}`, member: (id: string) => `personagem-${id}`, image: (id: string) => `imagem-${id}` }

export type JournalTarget =
    | { tab: MaddoxJournalTab }
    | { npcId: string }
    | { memoryId: string; kind: MaddoxCampaignMemoryKind }
    | { memberId: string }
    | { imageId: string }

/** Destino de um link do diário: a aba, o tipo da aba Anotações e a âncora do item (a página e a janela da mesa usam o mesmo). */
export interface JournalLocation {
    tab: MaddoxJournalTab
    noteKind: MaddoxJournalNoteKind | null
    anchor: string | null
}

export function journalLocation(target: JournalTarget = { tab: MADDOX_JOURNAL_DEFAULT_TAB }): JournalLocation {
    if ("npcId" in target) return { tab: "npcs", noteKind: null, anchor: journalAnchor.npc(target.npcId) }
    if ("memoryId" in target) {
        const tab = memoryTab(target.kind)
        return { tab, noteKind: tab === "anotacoes" ? (target.kind as MaddoxJournalNoteKind) : null, anchor: journalAnchor.memory(target.memoryId) }
    }
    if ("memberId" in target) return { tab: "grupo", noteKind: null, anchor: journalAnchor.member(target.memberId) }
    if ("imageId" in target) return { tab: "imagens", noteKind: null, anchor: journalAnchor.image(target.imageId) }
    return { tab: target.tab, noteKind: null, anchor: null }
}

/** Link do diário para a aba e o item (resultado da busca, NPC do painel da mesa). */
export function journalHref(campaignId: string, target?: JournalTarget): string {
    const { tab, noteKind, anchor } = journalLocation(target)
    const query = [tab !== MADDOX_JOURNAL_DEFAULT_TAB ? `aba=${tab}` : null, noteKind ? `tipo=${noteKind}` : null].filter(Boolean).join("&")
    return `/campanhas/${campaignId}/diario${query ? `?${query}` : ""}${anchor ? `#${anchor}` : ""}`
}
