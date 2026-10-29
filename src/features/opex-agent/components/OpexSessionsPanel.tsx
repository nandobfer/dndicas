"use client"

import { useMemo, useRef, useState } from "react"
import Fuse from "fuse.js"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AnimatePresence, motion } from "framer-motion"
import { Archive, ArchiveRestore, Check, History, MessageSquarePlus, Pencil, Search, Trash2, X } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/opex/alert-dialog"
import { Button } from "@/components/ui/opex/button"
import { Input } from "@/components/ui/opex/input"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { OPEX_TITLE_MAX } from "../constants"
import { useDeleteOpexSession, useOpexSessions, useUpdateOpexSession } from "../hooks/useOpexSessions"
import type { OpexSessionDto } from "../types"
import { OPEX_STATUS_LABELS, OpexStatusDot } from "./OpexStatusDot"
import { VirtualStack } from "./VirtualStack"

/** Busca tolerante a erro de digitação por título e resumo. */
export function searchSessions(sessions: readonly OpexSessionDto[], query: string, showArchived: boolean): OpexSessionDto[] {
    const scoped = sessions.filter((session) => session.archived === showArchived)
    const term = query.trim()
    if (!term) return scoped
    return new Fuse(scoped, { keys: [{ name: "title", weight: 2 }, "summary"], threshold: 0.4, ignoreLocation: true }).search(term).map((result) => result.item)
}

interface OpexSessionsPanelProps {
    activeId: string | null
    onOpen: (id: string) => void
    onNew: () => void
    onClose: () => void
}

/** Todas as sessões (abertas ou não): busca, arquivadas, renomear, arquivar e excluir. */
export function OpexSessionsPanel({ activeId, onOpen, onNew, onClose }: OpexSessionsPanelProps) {
    const query = useOpexSessions()
    const [search, setSearch] = useState("")
    const [showArchived, setShowArchived] = useState(false)
    const [deleting, setDeleting] = useState<OpexSessionDto | null>(null)
    const remove = useDeleteOpexSession()
    const scrollRef = useRef<HTMLDivElement>(null)
    const results = useMemo(() => searchSessions(query.data ?? [], search, showArchived), [query.data, search, showArchived])
    const archivedCount = (query.data ?? []).filter((session) => session.archived).length

    return (
        <motion.div
            key="sessions"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute inset-0 z-10 flex flex-col bg-popover"
            role="region"
            aria-label="Sessões do Agente Opex"
        >
            <div className="flex items-center gap-2 border-b px-3 py-2">
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar sessão por título ou resumo" aria-label="Buscar sessão" className="h-8 pl-8 text-xs" />
                </div>
                <Button type="button" size="sm" variant={showArchived ? "secondary" : "ghost"} className="h-8 gap-1.5 text-xs" onClick={() => setShowArchived((value) => !value)} aria-pressed={showArchived}>
                    <Archive className="h-3.5 w-3.5" aria-hidden /> Arquivadas{archivedCount ? ` (${archivedCount})` : ""}
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={onClose} aria-label="Fechar a lista de sessões">
                    <X className="h-4 w-4" aria-hidden />
                </Button>
            </div>

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-2">
                {query.isLoading ? (
                    <div className="space-y-2" aria-busy>
                        {[0, 1, 2, 3].map((index) => (
                            <Skeleton key={index} className="h-14 w-full" />
                        ))}
                    </div>
                ) : query.isError ? (
                    <ErrorState title="Não foi possível carregar as sessões" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
                ) : results.length === 0 ? (
                    search.trim() ? (
                        <EmptyState icon={Search} title="Nenhuma sessão encontrada" description="Tente outras palavras do título ou do resumo." actionLabel="Limpar busca" onAction={() => setSearch("")} />
                    ) : showArchived ? (
                        <EmptyState icon={Archive} title="Nenhuma sessão arquivada" description="Sessões arquivadas aparecem aqui." actionLabel="Ver sessões ativas" onAction={() => setShowArchived(false)} />
                    ) : (
                        <EmptyState icon={History} title="Nenhuma sessão ainda" description="Cada conversa com o agente vira uma sessão com título e resumo automáticos." actionLabel="Nova sessão" onAction={onNew} />
                    )
                ) : (
                    <VirtualStack
                        count={results.length}
                        scrollRef={scrollRef}
                        estimateSize={68}
                        getKey={(index) => results[index]!.id}
                        renderItem={(index) => <SessionRow session={results[index]!} active={results[index]!.id === activeId} onOpen={onOpen} onDelete={setDeleting} />}
                    />
                )}
            </div>

            <div className="border-t p-2">
                <Button type="button" variant="outline" size="sm" className="h-8 w-full gap-1.5" onClick={onNew}>
                    <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden /> Nova sessão
                </Button>
            </div>

            <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir a sessão?</AlertDialogTitle>
                        <AlertDialogDescription>
                            &quot;{deleting?.title}&quot; e todas as mensagens dela serão excluídas. Ações já executadas pelo agente não são desfeitas.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                                if (deleting) remove.mutate(deleting.id)
                                setDeleting(null)
                            }}
                        >
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </motion.div>
    )
}

function SessionRow({ session, active, onOpen, onDelete }: { session: OpexSessionDto; active: boolean; onOpen: (id: string) => void; onDelete: (session: OpexSessionDto) => void }) {
    const update = useUpdateOpexSession()
    const [editing, setEditing] = useState(false)
    const [title, setTitle] = useState(session.title)

    const saveTitle = () => {
        const next = title.trim()
        setEditing(false)
        if (next && next !== session.title) update.mutate({ id: session.id, title: next.slice(0, OPEX_TITLE_MAX) })
        else setTitle(session.title)
    }

    return (
        <div className="pb-1.5">
            <div className={cn("group relative rounded-md border px-3 py-2 transition-colors", active ? "border-primary/50 bg-primary/10" : "border-transparent hover:border-border hover:bg-muted/40")}>
                <AnimatePresence mode="wait" initial={false}>
                    {editing ? (
                        <motion.form
                            key="edit"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.12 }}
                            className="flex items-center gap-1.5"
                            onSubmit={(event) => {
                                event.preventDefault()
                                saveTitle()
                            }}
                        >
                            <Input autoFocus value={title} maxLength={OPEX_TITLE_MAX} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => event.key === "Escape" && (setEditing(false), setTitle(session.title))} aria-label="Título da sessão" className="h-7 text-xs" />
                            <Button type="submit" size="icon" variant="ghost" className="h-7 w-7" aria-label="Salvar título">
                                <Check className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                        </motion.form>
                    ) : (
                        <motion.button key="view" type="button" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} onClick={() => onOpen(session.id)} className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/70">
                            <span className="flex items-center gap-2 pr-20">
                                <OpexStatusDot status={session.status} />
                                <span className="truncate text-sm font-medium">{session.title}</span>
                            </span>
                            {session.summary && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{session.summary}</span>}
                            <span className="mt-1 block text-[10px] text-muted-foreground/80">
                                {formatDistanceToNow(new Date(session.lastMessageAt), { addSuffix: true, locale: ptBR })}
                                {session.status !== "idle" ? ` · ${OPEX_STATUS_LABELS[session.status]}` : ""}
                            </span>
                        </motion.button>
                    )}
                </AnimatePresence>
                {!editing && (
                    <div className="absolute right-2 top-2 flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                        <RowAction label="Renomear" onClick={() => setEditing(true)} icon={Pencil} />
                        <RowAction label={session.archived ? "Desarquivar" : "Arquivar"} onClick={() => update.mutate({ id: session.id, archived: !session.archived })} icon={session.archived ? ArchiveRestore : Archive} />
                        <RowAction label="Excluir" onClick={() => onDelete(session)} icon={Trash2} destructive />
                    </div>
                )}
            </div>
        </div>
    )
}

function RowAction({ label, onClick, icon: Icon, destructive }: { label: string; onClick: () => void; icon: typeof Pencil; destructive?: boolean }) {
    return (
        <button type="button" onClick={onClick} aria-label={label} title={label} className={cn("rounded p-1 text-muted-foreground transition-colors hover:bg-muted", destructive ? "hover:text-destructive" : "hover:text-foreground")}>
            <Icon className="h-3.5 w-3.5" aria-hidden />
        </button>
    )
}
