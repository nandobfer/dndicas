"use client"

import { useRef } from "react"
import { useOpexView } from "../../hooks/useOpexSettings"
import { useCreateOpexSession } from "../../hooks/useOpexSessions"
import { useOpexUploads } from "../../hooks/useOpexUploads"
import { DEFAULT_OPEX_AGENT_SETTINGS } from "../../schemas"
import { OpexComposer, type OpexComposerHandle } from "./OpexComposer"
import { OpexDropZone } from "./OpexDropZone"
import { OpexEmptyChat } from "./OpexEmptyChat"
import { OpexUnavailable } from "./OpexChat"

/**
 * Nova sessão ainda não criada: a primeira mensagem cria a sessão e abre a aba dela. Anexar um
 * arquivo também cria a sessão na hora (o envio precisa dela); o texto digitado vai junto para a aba.
 */
export function OpexDraftChat({ onCreated }: { onCreated: (sessionId: string, draftText?: string) => void }) {
    const view = useOpexView()
    const create = useCreateOpexSession()
    const uploads = useOpexUploads(null)
    const composerRef = useRef<OpexComposerHandle>(null)
    const availability = view.data?.availability
    const disabledReason = availability && !availability.available ? (availability.reason ?? "O Agente Opex não está disponível") : null
    const limits = view.data?.files ?? DEFAULT_OPEX_AGENT_SETTINGS.files

    const start = (text: string) => create.mutate(text, { onSuccess: ({ session }) => onCreated(session.id) })
    const attach = (files: File[]) => {
        if (create.isPending) return
        const draftText = composerRef.current?.getText() ?? ""
        create.mutate(undefined, {
            onSuccess: ({ session }) => {
                uploads.enqueue(session.id, files, limits)
                onCreated(session.id, draftText)
            },
        })
    }

    return (
        <OpexDropZone onFiles={attach} disabled={Boolean(disabledReason)}>
            {disabledReason && <OpexUnavailable reason={disabledReason} />}
            <OpexEmptyChat onPick={start} disabled={Boolean(disabledReason) || create.isPending} />
            <OpexComposer
                ref={composerRef}
                onSend={start}
                attachments={{ items: [], onFiles: attach, onRetry: () => undefined, onRemove: () => undefined }}
                onStop={() => undefined}
                running={false}
                sending={create.isPending}
                stopping={false}
                disabledReason={disabledReason}
            />
        </OpexDropZone>
    )
}
