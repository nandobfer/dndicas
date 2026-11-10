"use client"

import { UserRound } from "lucide-react"
import { MADDOX_NPC_STATUS_LABELS } from "../../constants"
import { useMaddoxJournalNpcs } from "../../hooks/useMaddoxJournal"
import { MemberAvatar, OpexChip } from "../campaigns/campaign-visuals"
import { OpexNpcActions } from "../game/OpexNpcActions"
import { cn } from "@/lib/utils"
import { journalAnchor } from "./journal-links"
import { JournalItemCard, JournalListState, JournalText, LoadMore, SeekNotice } from "./JournalLists"
import { useJournalHash, useScrollToAnchor, useSeekAnchor } from "./use-journal-hash-target"

/**
 * NPCs que o grupo conhece: retrato, nome, situação e descrição pública (as notas do mestre nunca chegam aqui). NPC Opex
 * ganha o chip para todos e o dono com a permissão promove ou remove (DND-27).
 */
export function JournalNpcList({ campaignId, color, manageOpex = false }: { campaignId: string; color: string; manageOpex?: boolean }) {
    const npcs = useMaddoxJournalNpcs(campaignId)
    const items = npcs.data?.pages.flatMap((page) => page.items) ?? []
    const anchors = new Set(items.map((npc) => journalAnchor.npc(npc.id)))
    const target = useJournalHash()
    const found = anchors.has(target)
    useScrollToAnchor(target, found)
    const seek = useSeekAnchor({ wanted: target.startsWith("npc-"), found, hasNextPage: Boolean(npcs.hasNextPage), isFetchingNextPage: npcs.isFetchingNextPage, fetchNextPage: npcs.fetchNextPage, pages: npcs.data?.pages.length ?? 0, failed: npcs.isError })
    const state = (
        <JournalListState
            loading={npcs.isLoading}
            error={npcs.isError}
            empty={items.length === 0}
            emptyText="Nenhum NPC conhecido ainda: eles aparecem aqui quando o grupo os conhece."
            icon={UserRound}
            onRetry={() => void npcs.refetch()}
        />
    )
    if (npcs.isLoading || npcs.isError || items.length === 0) return state
    return (
        <div className="space-y-4">
            <SeekNotice {...seek} />
            <div className="grid gap-3 md:grid-cols-2" aria-label="NPCs conhecidos">
                {items.map((npc) => {
                    const anchor = journalAnchor.npc(npc.id)
                    const gone = npc.status === "dead"
                    return (
                        <JournalItemCard key={npc.id} anchor={anchor} highlighted={target === anchor} color={color} dimmed={gone} testId={`journal-npc-${npc.id}`}>
                            <header className="flex items-center gap-3">
                                <MemberAvatar name={npc.name} imageUrl={npc.portraitUrl} color={color} className={cn("h-10 w-10 shrink-0", gone && "grayscale")} />
                                <div className="min-w-0 flex-1">
                                    <h3 className="break-words text-sm font-semibold text-white">
                                        {npc.name}
                                        {npc.opex && <OpexChip className="ml-1.5 align-middle" />}
                                    </h3>
                                    {npc.status !== "active" && <p className="text-[11px] text-white/60" data-testid="journal-npc-status">{MADDOX_NPC_STATUS_LABELS[npc.status]}</p>}
                                </div>
                                {manageOpex && <OpexNpcActions campaignId={campaignId} npc={npc} variant="button" />}
                            </header>
                            {npc.publicDescription.trim() ? <JournalText>{npc.publicDescription}</JournalText> : <p className="text-xs text-white/50">Sem descrição ainda.</p>}
                        </JournalItemCard>
                    )
                })}
            </div>
            <LoadMore hasMore={Boolean(npcs.hasNextPage)} loading={npcs.isFetchingNextPage} onLoad={() => void npcs.fetchNextPage()} />
        </div>
    )
}
