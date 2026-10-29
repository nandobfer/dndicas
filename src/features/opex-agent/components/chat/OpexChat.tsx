"use client"

import { useRef } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { Settings2, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { ReplyTargetProvider } from "@/components/agent-reply/ReplyTargetProvider"
import { apiErrorMessage } from "@/lib/api"
import { useOpexView } from "../../hooks/useOpexSettings"
import { useOpexScope, OPEX_SETTINGS_PAGE_HREF } from "../OpexScopeProvider"
import { useDecideOpexAction, useInterruptOpex, useOpexSession, useSendOpexMessage } from "../../hooks/useOpexSessions"
import { useOpexStream } from "../../hooks/useOpexStream"
import { DEFAULT_OPEX_AGENT_SETTINGS } from "../../schemas"
import { useOpexUploads } from "../../hooks/useOpexUploads"
import { OpexComposer, type OpexComposerAttachments, type OpexComposerHandle } from "./OpexComposer"
import { OpexDropZone } from "./OpexDropZone"
import { OpexEmptyChat } from "./OpexEmptyChat"
import { buildChatItems, OpexMessageList } from "./OpexMessageList"

export const OPEX_SETTINGS_HREF = OPEX_SETTINGS_PAGE_HREF

/** Agente sem configuração ativa: explica e (para administradores) leva à aba de configuração. */
export function OpexUnavailable({ reason }: { reason: string }) {
    const { settingsHref } = useOpexScope()
    return (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            <Settings2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1 space-y-1.5">
                <p>{reason}</p>
                {settingsHref && (
                    <Button asChild size="sm" variant="outline" className="h-7">
                        <Link href={settingsHref}>Configurar o Agente Opex</Link>
                    </Button>
                )}
            </div>
        </div>
    )
}

/** Sessão aberta: mensagens gravadas + resposta ao vivo + campo de mensagem. */
export function OpexChat({ sessionId, initialText }: { sessionId: string; initialText?: string }) {
    const view = useOpexView()
    const query = useOpexSession(sessionId)
    const stream = useOpexStream(sessionId)
    const send = useSendOpexMessage(sessionId)
    const interrupt = useInterruptOpex(sessionId)
    const decide = useDecideOpexAction(sessionId)
    const composerRef = useRef<OpexComposerHandle>(null)
    const uploads = useOpexUploads(sessionId)
    const limits = view.data?.files ?? DEFAULT_OPEX_AGENT_SETTINGS.files

    const availability = view.data?.availability
    const disabledReason = availability && !availability.available ? (availability.reason ?? "O Agente Opex não está disponível") : null
    const running = stream.live !== null || (stream.status ?? query.data?.session.status) === "running" || send.isPending

    if (query.isLoading) {
        return (
            <div className="flex flex-1 flex-col gap-3 p-4" aria-busy>
                <Skeleton className="ml-auto h-10 w-2/3 rounded-2xl" />
                <Skeleton className="h-24 w-5/6" />
                <Skeleton className="ml-auto h-8 w-1/2 rounded-2xl" />
            </div>
        )
    }
    if (query.isError || !query.data) {
        return <ErrorState title="Não foi possível abrir a sessão" description={apiErrorMessage(query.error, "Verifique a conexão e tente novamente.")} onRetry={() => void query.refetch()} />
    }

    const items = buildChatItems(query.data.messages, stream.live, stream.settled)
    const onSend = (text: string) => {
        const ready = uploads.ready
        send.mutate({ text, files: ready.map((item) => item.uploaded!) }, { onSuccess: () => uploads.clearSent(ready.map((item) => item.localId)) })
    }
    const attachments: OpexComposerAttachments = {
        items: uploads.items,
        onFiles: (files) => uploads.enqueue(sessionId, files, limits),
        onRetry: uploads.retry,
        onRemove: uploads.remove,
    }

    return (
        // Cada linha das respostas tem "Citar no campo de resposta" (insere `> linha` no campo do chat).
        <ReplyTargetProvider>
        <OpexDropZone onFiles={attachments.onFiles} disabled={Boolean(disabledReason)}>
            <AnimatePresence initial={false}>
                {!stream.connected && stream.status !== null && (
                    <motion.p key="offline" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-center justify-center gap-1.5 overflow-hidden bg-muted/60 text-[11px] text-muted-foreground" role="status">
                        <WifiOff className="h-3 w-3" aria-hidden /> Reconectando à resposta ao vivo…
                    </motion.p>
                )}
            </AnimatePresence>
            {disabledReason && <OpexUnavailable reason={disabledReason} />}
            {items.length === 0 ? (
                <OpexEmptyChat onPick={onSend} disabled={Boolean(disabledReason) || running} />
            ) : (
                <OpexMessageList
                    items={items}
                    busy={running}
                    deciding={decide.isPending}
                    onDecide={(actionId, decision) => decide.mutate({ actionId, decision })}
                    onRetry={(text) => send.mutate({ text })}
                />
            )}
            <OpexComposer
                ref={composerRef}
                onSend={onSend}
                attachments={attachments}
                onStop={() => interrupt.mutate()}
                running={running}
                sending={send.isPending}
                stopping={interrupt.isPending}
                disabledReason={disabledReason}
                initialText={initialText}
            />
        </OpexDropZone>
        </ReplyTargetProvider>
    )
}
