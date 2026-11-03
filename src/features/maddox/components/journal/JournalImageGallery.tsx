"use client"

import Link from "next/link"
import { Image as ImageIcon, MessageCircle, UserRound } from "lucide-react"
import { GlassSelector } from "@/components/ui/glass-selector"
import type { MaddoxSceneImageSource } from "../../constants"
import type { MaddoxGameSceneImageDto } from "../../game-types"
import type { MaddoxJournalImageKind } from "../../journal-schemas"
import type { MaddoxJournalImageDto } from "../../journal-types"
import { useMaddoxJournalImages } from "../../hooks/useMaddoxJournal"
import { GameSceneImage } from "../game/GameSceneImage"
import { journalAnchor, journalHref } from "./journal-links"
import { JournalItemCard, JournalListState, LoadMore, SeekNotice } from "./JournalLists"
import { useJournalHash, useScrollToAnchor, useSeekAnchor } from "./use-journal-hash-target"

/** Origem da imagem quando ela não tem situação (pedido manual) ou como complemento. */
export const MADDOX_JOURNAL_IMAGE_SOURCE_LABELS: Record<MaddoxSceneImageSource, string> = {
    tool: "Cena da narração",
    "combat-end": "Fim de batalha",
    manual: "Pedido do dono",
    "npc-portrait": "Retrato de NPC",
}

const FILTER_OPTIONS: { value: MaddoxJournalImageKind; label: string }[] = [
    { value: "todas", label: "Todas" },
    { value: "cenas", label: "Cenas" },
    { value: "retratos", label: "Retratos" },
]

export function JournalImageFilter({ value, onChange }: { value: MaddoxJournalImageKind; onChange: (value: MaddoxJournalImageKind) => void }) {
    return <GlassSelector options={FILTER_OPTIONS} value={value} onChange={(next) => onChange(next as MaddoxJournalImageKind)} size="sm" layoutId="journal-image-filter" />
}

const EMPTY_TEXTS: Record<MaddoxJournalImageKind, string> = {
    todas: "O Maddox ainda não gerou imagens nesta campanha.",
    cenas: "Nenhuma imagem de cena ainda.",
    retratos: "Nenhum retrato de NPC conhecido ainda.",
}

/** A imagem do diário no formato da mesa: reaproveita a figura com legenda e o ampliar da mesa. */
const asSceneImage = (image: MaddoxJournalImageDto): MaddoxGameSceneImageDto => ({ id: image.id, status: "done", url: image.url, caption: image.caption, situationLabel: image.situationLabel, source: image.source, error: null })

/** Aba Imagens do diário (DND-22): galeria das imagens prontas do Maddox, com o turno e o link para a cena ou o NPC. */
export function JournalImageGallery({ campaignId, color, kind }: { campaignId: string; color: string; kind: MaddoxJournalImageKind }) {
    const images = useMaddoxJournalImages(campaignId, kind)
    const items = images.data?.pages.flatMap((page) => page.items) ?? []
    const anchors = new Set(items.map((image) => journalAnchor.image(image.id)))
    const target = useJournalHash()
    const found = anchors.has(target)
    useScrollToAnchor(target, found)
    const seek = useSeekAnchor({ wanted: target.startsWith("imagem-"), found, hasNextPage: Boolean(images.hasNextPage), isFetchingNextPage: images.isFetchingNextPage, fetchNextPage: images.fetchNextPage, pages: images.data?.pages.length ?? 0, failed: images.isError })
    if (images.isLoading || images.isError || items.length === 0) {
        return <JournalListState loading={images.isLoading} error={images.isError} empty={items.length === 0} emptyText={EMPTY_TEXTS[kind]} icon={ImageIcon} onRetry={() => void images.refetch()} />
    }
    return (
        <div className="space-y-4">
            <SeekNotice {...seek} />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Imagens da campanha" data-testid="journal-images">
                {items.map((image) => {
                    const anchor = journalAnchor.image(image.id)
                    const origin = image.npc ? `Retrato de ${image.npc.name}` : (image.situationLabel ?? MADDOX_JOURNAL_IMAGE_SOURCE_LABELS[image.source])
                    return (
                        <JournalItemCard key={image.id} anchor={anchor} highlighted={target === anchor} color={color} testId={`journal-image-${image.id}`}>
                            <header className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                <span className="font-semibold" style={{ color }}>
                                    {image.turnNumber > 0 ? `Turno ${image.turnNumber}` : "Antes da mesa"}
                                </span>
                                <span className="text-white/60">{origin}</span>
                            </header>
                            <GameSceneImage image={{ ...asSceneImage(image), situationLabel: null }} color={color} />
                            {image.messageId ? (
                                <Link href={journalHref(campaignId, { messageId: image.messageId })} className="inline-flex items-center gap-1 text-xs text-white/70 hover:text-white" data-testid="journal-image-message-link">
                                    <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Ver no histórico
                                </Link>
                            ) : image.npc ? (
                                <Link href={journalHref(campaignId, { npcId: image.npc.id })} className="inline-flex items-center gap-1 text-xs text-white/70 hover:text-white" data-testid="journal-image-npc-link">
                                    <UserRound className="h-3.5 w-3.5" aria-hidden /> Ver NPC
                                </Link>
                            ) : null}
                        </JournalItemCard>
                    )
                })}
            </div>
            <LoadMore hasMore={Boolean(images.hasNextPage)} loading={images.isFetchingNextPage} onLoad={() => void images.fetchNextPage()} />
        </div>
    )
}
