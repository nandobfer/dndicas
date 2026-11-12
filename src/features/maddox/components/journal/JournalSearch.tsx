"use client"

import { Fragment, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { BookOpen, Image as ImageIcon, Loader2, MapPin, MessageCircle, Search, ScrollText, Target, UserRound, Users } from "lucide-react"
import { Input } from "@/components/ui/opex/input"
import { rarityColors } from "@/lib/config/colors"
import { cn } from "@/lib/utils"
import { MADDOX_CAMPAIGN_MEMORY_KIND_LABELS, MADDOX_NPC_STATUS_LABELS, MADDOX_QUEST_STATUS_DEFS, MADDOX_AVATAR_CONTEXT, npcAvatarContext } from "../../constants"
import { accentInsensitivePattern } from "../../journal-search"
import { MADDOX_JOURNAL_QUERY_MIN } from "../../journal-schemas"
import type { MaddoxJournalSearchDto, MaddoxJournalSearchGroup } from "../../journal-types"
import { useMaddoxJournalSearch } from "../../hooks/useMaddoxJournal"
import { MemberAvatar, RarityChip } from "../campaigns/campaign-visuals"
import { journalHref } from "./journal-links"

/** Destaca o termo no texto (sem acento e sem caixa, como a busca do servidor). */
export function HighlightedText({ text, query }: { text: string; query: string }) {
    const parts = useMemo(() => {
        if (query.trim().length < MADDOX_JOURNAL_QUERY_MIN) return [text]
        return text.split(new RegExp(`(${accentInsensitivePattern(query)})`, "gi"))
    }, [text, query])
    return (
        <>
            {parts.map((part, index) =>
                index % 2 === 1 ? (
                    <mark key={index} className="rounded bg-primary/30 px-0.5 text-white">
                        {part}
                    </mark>
                ) : (
                    <Fragment key={index}>{part}</Fragment>
                ),
            )}
        </>
    )
}

const MESSAGE_KIND_LABELS = { narration: "Narração do Maddox", answer: "Resposta do Maddox", declaration: "Declaração", question: "Pergunta ao mestre" } as const

interface Props {
    campaignId: string
    color: string
    /** Chamado ao abrir um resultado (o diálogo da mesa fecha). */
    onNavigate?: () => void
    autoFocus?: boolean
    /** Termo controlado de fora (a página mostra os resultados acima das abas). */
    term?: string
    onTermChange?: (term: string) => void
}

/** Busca do Diário da campanha: campo e resultados agrupados (página do diário e diálogo da mesa). */
export function JournalSearch({ campaignId, color, onNavigate, autoFocus, term: controlled, onTermChange }: Props) {
    const [local, setLocal] = useState("")
    const term = controlled ?? local
    const setTerm = onTermChange ?? setLocal
    const search = useMaddoxJournalSearch(campaignId, term)
    const typed = term.trim()

    return (
        <div className="space-y-3" data-testid="journal-search">
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" aria-hidden />
                <Input
                    type="search"
                    value={term}
                    onChange={(event) => setTerm(event.target.value)}
                    placeholder="Buscar NPCs, locais, missões, anotações, falas e imagens…"
                    aria-label="Buscar no diário"
                    className="pl-9"
                    autoFocus={autoFocus}
                    maxLength={100}
                />
                {(search.pending || search.isFetching) && typed.length >= MADDOX_JOURNAL_QUERY_MIN && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/50" aria-label="Buscando" />
                )}
            </div>
            {typed.length > 0 && typed.length < MADDOX_JOURNAL_QUERY_MIN && <p className="text-xs text-white/60">Digite ao menos {MADDOX_JOURNAL_QUERY_MIN} caracteres.</p>}
            {search.isError && <p className="text-sm text-amber-300" role="alert">Não foi possível buscar agora. Tente de novo.</p>}
            {search.ready && search.data && search.data.query === search.query && <JournalSearchResults campaignId={campaignId} color={color} result={search.data} onNavigate={onNavigate} />}
        </div>
    )
}

function total(result: MaddoxJournalSearchDto) {
    return result.npcs.items.length + result.memories.items.length + result.messages.items.length + result.party.items.length + (result.images?.items.length ?? 0) + (result.state ? 1 : 0)
}

export function JournalSearchResults({ campaignId, color, result, onNavigate }: { campaignId: string; color: string; result: MaddoxJournalSearchDto; onNavigate?: () => void }) {
    const q = result.query
    const unavailable = result.memoriesUnavailable ? (
        <p className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-white/80" role="status" data-testid="journal-search-memories-unavailable">
            As anotações da campanha estão indisponíveis no momento: a busca mostra só o restante do diário.
        </p>
    ) : null
    if (total(result) === 0) {
        return (
            <div className="space-y-2">
                {unavailable}
                <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-4 text-center text-sm text-white/60" data-testid="journal-search-empty">
                    Nada encontrado para “{q}”.
                </p>
            </div>
        )
    }
    const places = { ...result.memories, items: result.memories.items.filter((item) => item.kind === "local") }
    const quests = { ...result.memories, items: result.memories.items.filter((item) => item.kind === "missao") }
    const notes = { ...result.memories, items: result.memories.items.filter((item) => item.kind !== "local" && item.kind !== "missao") }
    return (
        <div className="space-y-3" aria-live="polite" data-testid="journal-search-results">
            {unavailable}
            {result.state && (
                <ResultGroup title="Situação atual" icon={Target} color={color} testId="search-group-state">
                    <ResultLink href={journalHref(campaignId)} onNavigate={onNavigate} title="Situação atual" excerpt={result.state.excerpt} query={q} />
                </ResultGroup>
            )}
            <Group group={result.npcs} title="NPCs" icon={UserRound} color={color} testId="search-group-npcs">
                {(npc) => (
                    <ResultLink
                        key={npc.id}
                        href={journalHref(campaignId, { npcId: npc.id })}
                        onNavigate={onNavigate}
                        title={npc.name}
                        badge={npc.status === "dead" || npc.status === "unknown" ? MADDOX_NPC_STATUS_LABELS[npc.status] : null}
                        excerpt={npc.excerpt}
                        query={q}
                        avatar={<MemberAvatar name={npc.name} imageUrl={npc.portraitUrl} color={color} context={npcAvatarContext(npc.status)} className="h-7 w-7 shrink-0" />}
                    />
                )}
            </Group>
            <Group group={places} title="Locais" icon={MapPin} color={color} testId="search-group-places">
                {(item) => <ResultLink key={item.id} href={journalHref(campaignId, { memoryId: item.id, kind: item.kind })} onNavigate={onNavigate} title={item.title} excerpt={item.excerpt} query={q} />}
            </Group>
            <Group group={quests} title="Missões" icon={ScrollText} color={color} testId="search-group-quests">
                {(item) => (
                    <ResultLink
                        key={item.id}
                        href={journalHref(campaignId, { memoryId: item.id, kind: item.kind })}
                        onNavigate={onNavigate}
                        title={item.title}
                        chip={item.status ? <RarityChip color={rarityColors[MADDOX_QUEST_STATUS_DEFS[item.status].rarity]}>{MADDOX_QUEST_STATUS_DEFS[item.status].label}</RarityChip> : null}
                        excerpt={item.excerpt}
                        query={q}
                    />
                )}
            </Group>
            <Group group={notes} title="Outras anotações" icon={BookOpen} color={color} testId="search-group-notes">
                {(item) => <ResultLink key={item.id} href={journalHref(campaignId, { memoryId: item.id, kind: item.kind })} onNavigate={onNavigate} title={item.title} badge={MADDOX_CAMPAIGN_MEMORY_KIND_LABELS[item.kind]} excerpt={item.excerpt} query={q} />}
            </Group>
            <Group group={result.party} title="Grupo" icon={Users} color={color} testId="search-group-party">
                {(member) => (
                    <ResultLink
                        key={member.memberId}
                        href={journalHref(campaignId, { memberId: member.memberId })}
                        onNavigate={onNavigate}
                        title={member.characterName}
                        excerpt={member.excerpt}
                        query={q}
                        avatar={<MemberAvatar name={member.characterName} imageUrl={member.portraitUrl} color={color} context={MADDOX_AVATAR_CONTEXT.character} className="h-7 w-7 shrink-0" />}
                    />
                )}
            </Group>
            {result.images && (
                <Group group={result.images} title="Imagens" icon={ImageIcon} color={color} testId="search-group-images">
                    {(image) => (
                        <ResultLink
                            key={image.id}
                            href={journalHref(campaignId, { imageId: image.id })}
                            onNavigate={onNavigate}
                            title={image.npcName ? `Retrato de ${image.npcName}` : "Imagem da cena"}
                            badge={image.turnNumber > 0 ? `Turno ${image.turnNumber}` : null}
                            excerpt={image.excerpt}
                            query={q}
                            // eslint-disable-next-line @next/next/no-img-element -- miniatura do storage pelo proxy do app
                            avatar={<img src={image.url} alt="" className="h-9 w-14 shrink-0 rounded object-cover" loading="lazy" />}
                        />
                    )}
                </Group>
            )}
            <Group group={result.messages} title="Histórico da mesa" icon={MessageCircle} color={color} testId="search-group-messages">
                {(message) => (
                    <ResultLink
                        key={message.id}
                        href={journalHref(campaignId, { messageId: message.id })}
                        onNavigate={onNavigate}
                        title={message.characterName ? `${message.characterName} · ${MESSAGE_KIND_LABELS[message.kind]}` : MESSAGE_KIND_LABELS[message.kind]}
                        badge={`Turno ${message.turnNumber}`}
                        excerpt={message.excerpt}
                        query={q}
                    />
                )}
            </Group>
        </div>
    )
}

function Group<T>({ group, title, icon, color, testId, children }: { group: MaddoxJournalSearchGroup<T>; title: string; icon: typeof Search; color: string; testId: string; children: (item: T) => ReactNode }) {
    if (group.items.length === 0) return null
    return (
        <ResultGroup title={`${title} (${group.items.length}${group.hasMore ? "+" : ""})`} icon={icon} color={color} testId={testId}>
            {group.items.map(children)}
            {group.hasMore && <li className="px-3 py-1 text-xs text-white/50">Há mais resultados: refine a busca.</li>}
        </ResultGroup>
    )
}

function ResultGroup({ title, icon: Icon, color, testId, children }: { title: string; icon: typeof Search; color: string; testId: string; children: ReactNode }) {
    return (
        <section className="overflow-hidden rounded-xl border bg-white/[0.03]" style={{ borderColor: `${color}33` }} data-testid={testId}>
            <h3 className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide" style={{ color }}>
                <Icon className="h-3.5 w-3.5" aria-hidden /> {title}
            </h3>
            <ul className="divide-y divide-white/5">{children}</ul>
        </section>
    )
}

function ResultLink({ href, onNavigate, title, excerpt, query, badge, chip, avatar }: { href: string; onNavigate?: () => void; title: string; excerpt: string; query: string; badge?: string | null; chip?: ReactNode; avatar?: ReactNode }) {
    return (
        <li className="relative">
            <Link href={href} onClick={onNavigate} className={cn("flex items-start gap-2.5 px-3 py-2 transition-colors hover:bg-white/[0.05] focus-visible:bg-white/[0.05] focus-visible:outline-none", avatar && "pl-[3.125rem]")} data-testid="journal-search-hit">
                <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-white">
                        <HighlightedText text={title} query={query} />
                        {badge && <span className="text-[11px] font-normal text-white/50">{badge}</span>}
                        {chip}
                    </span>
                    {excerpt && (
                        <span className="block break-words text-xs text-white/70">
                            <HighlightedText text={excerpt} query={query} />
                        </span>
                    )}
                </span>
            </Link>
            {/* Avatar fora do link (DND-55): é um botão próprio (retrato grande) e não pode ficar aninhado na navegação. */}
            {avatar && <span className="absolute left-3 top-2 z-10 flex">{avatar}</span>}
        </li>
    )
}
