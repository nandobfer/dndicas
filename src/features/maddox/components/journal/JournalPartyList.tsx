"use client"

import { HeartPulse, UserRound, Users } from "lucide-react"
import { useMaddoxJournalParty } from "../../hooks/useMaddoxJournal"
import { MemberAvatar } from "../campaigns/campaign-visuals"
import { CharacterProfileSections } from "../campaigns/CharacterProfileDialog"
import { journalAnchor } from "./journal-links"
import { JournalItemCard, JournalListState, JournalText } from "./JournalLists"
import { useJournalHashTarget } from "./use-journal-hash-target"

/** Personagens do grupo: perfil da entrevista e condição atual (a ficha D&D continua só do dono dela). */
export function JournalPartyList({ campaignId, color, myMemberId }: { campaignId: string; color: string; myMemberId: string }) {
    const party = useMaddoxJournalParty(campaignId)
    const items = party.data ?? []
    const target = useJournalHashTarget(items.length > 0)
    if (party.isLoading || party.isError || items.length === 0) {
        return <JournalListState loading={party.isLoading} error={party.isError} empty={items.length === 0} emptyText="Nenhum personagem pronto ainda." icon={Users} onRetry={() => void party.refetch()} />
    }
    return (
        <div className="grid gap-3 lg:grid-cols-2" aria-label="Personagens do grupo">
            {items.map((member) => {
                const anchor = journalAnchor.member(member.memberId)
                return (
                    <JournalItemCard key={member.memberId} anchor={anchor} highlighted={target === anchor} color={color} testId={`journal-member-${member.memberId}`}>
                        <header className="flex items-center gap-3">
                            <MemberAvatar name={member.characterName} imageUrl={member.portraitUrl} color={color} className="h-12 w-12 shrink-0" />
                            <div className="min-w-0">
                                <h3 className="break-words text-base font-semibold text-white">{member.characterName}</h3>
                                <p className="flex items-center gap-1 text-xs text-white/60">
                                    <UserRound className="h-3 w-3" aria-hidden /> {member.memberId === myMemberId ? "Seu personagem" : `Personagem de ${member.playerName}`}
                                </p>
                            </div>
                        </header>
                        <section className="space-y-1 rounded-lg border border-white/10 bg-white/[0.03] p-3" data-testid="journal-member-state">
                            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color }}>
                                <HeartPulse className="h-3.5 w-3.5" aria-hidden /> Condição na história
                            </h4>
                            {member.currentState.trim() ? <JournalText>{member.currentState}</JournalText> : <p className="text-xs text-white/50">Sem registro do Maddox ainda.</p>}
                        </section>
                        <div className="space-y-3">
                            <CharacterProfileSections profile={member.profile} color={color} />
                        </div>
                    </JournalItemCard>
                )
            })}
        </div>
    )
}
