"use client"

import { BookMarked } from "lucide-react"
import { useMaddoxJournalChapters } from "../../hooks/useMaddoxJournal"
import { JournalItemCard, JournalListState, JournalText } from "./JournalLists"

/** Capítulos encerrados pelo Maddox (DND-56), do mais recente para o mais antigo, com o resumo. */
export function JournalChapterList({ campaignId, color }: { campaignId: string; color: string }) {
    const chapters = useMaddoxJournalChapters(campaignId)
    const items = chapters.data ?? []
    if (chapters.isLoading || chapters.isError || items.length === 0) {
        return <JournalListState loading={chapters.isLoading} error={chapters.isError} empty={items.length === 0} emptyText="Nenhum capítulo encerrado ainda." icon={BookMarked} onRetry={() => void chapters.refetch()} />
    }
    return (
        <div className="space-y-3" aria-label="Capítulos da campanha">
            {items.map((chapter) => (
                <JournalItemCard key={chapter.id} anchor={`capitulo-${chapter.id}`} highlighted={false} color={color} testId={`journal-chapter-${chapter.id}`}>
                    <header className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="flex items-center gap-2 text-base font-semibold text-white">
                            <BookMarked className="h-4 w-4" style={{ color }} aria-hidden /> {chapter.title}
                        </h3>
                        <span className="text-xs text-white/50">Turno {chapter.turnNumber}</span>
                    </header>
                    <JournalText>{chapter.summary}</JournalText>
                </JournalItemCard>
            ))}
        </div>
    )
}
