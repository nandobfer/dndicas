import type { MaddoxCampaignMemoryKind } from "../../constants"

/** Abas do Diário da campanha (`?aba=`). */
export const MADDOX_JOURNAL_TABS = ["historico", "npcs", "locais", "missoes", "anotacoes", "grupo"] as const
export type MaddoxJournalTab = (typeof MADDOX_JOURNAL_TABS)[number]

/** Tipos de memória da aba Anotações (locais e missões têm aba própria). */
export const MADDOX_JOURNAL_NOTE_KINDS = ["evento", "relacao", "fato", "outro"] as const satisfies readonly MaddoxCampaignMemoryKind[]
export type MaddoxJournalNoteKind = (typeof MADDOX_JOURNAL_NOTE_KINDS)[number]

export const parseJournalTab = (value: string | null | undefined): MaddoxJournalTab => (MADDOX_JOURNAL_TABS as readonly string[]).includes(value ?? "") ? (value as MaddoxJournalTab) : "historico"

export function memoryTab(kind: MaddoxCampaignMemoryKind): MaddoxJournalTab {
    if (kind === "local") return "locais"
    if (kind === "missao") return "missoes"
    return "anotacoes"
}

/** Âncora de um item no diário (o card recebe o mesmo `id`). */
export const journalAnchor = { npc: (id: string) => `npc-${id}`, memory: (id: string) => `anotacao-${id}`, member: (id: string) => `personagem-${id}` }

export type JournalTarget =
    | { tab: MaddoxJournalTab }
    | { npcId: string }
    | { memoryId: string; kind: MaddoxCampaignMemoryKind }
    | { messageId: string }
    | { memberId: string }

/** Link do diário para a aba e o item (resultado da busca, NPC do painel da mesa). */
export function journalHref(campaignId: string, target: JournalTarget = { tab: "historico" }): string {
    const base = `/campanhas/${campaignId}/diario`
    if ("npcId" in target) return `${base}?aba=npcs#${journalAnchor.npc(target.npcId)}`
    if ("memoryId" in target) {
        const tab = memoryTab(target.kind)
        const filter = tab === "anotacoes" ? `&tipo=${target.kind}` : ""
        return `${base}?aba=${tab}${filter}#${journalAnchor.memory(target.memoryId)}`
    }
    if ("messageId" in target) return `${base}?aba=historico&msg=${target.messageId}`
    if ("memberId" in target) return `${base}?aba=grupo#${journalAnchor.member(target.memberId)}`
    return target.tab === "historico" ? base : `${base}?aba=${target.tab}`
}
