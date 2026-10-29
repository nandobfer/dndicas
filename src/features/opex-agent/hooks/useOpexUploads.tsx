"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import axios from "axios"
import { toast } from "sonner"
import { apiErrorMessage, unwrapApi } from "@/lib/api"
import { fallbackAttachmentName, formatAttachmentSize } from "@/lib/attachments"
import { randomId } from "@/lib/random-id"
import type { ApiResponse } from "@/lib/types/api"
import { opexFileKind, opexMaxBytes, type OpexFileKind } from "../files"
import type { OpexFilesSettings } from "../schemas"
import type { OpexFileDto, OpexFileReservationDto } from "../types"
import { useOpexScope } from "../components/OpexScopeProvider"

/**
 * Fila de envio dos arquivos do chat, por sessão. Fica acima do popover (no item da barra lateral):
 * fechar o chat ou trocar de aba não perde os envios. Cada arquivo segue o fluxo dos anexos de
 * tarefa: reserva (URL assinada) → PUT direto no Storage S3 com progresso real → confirmação.
 */

export type OpexUploadStatus = "uploading" | "confirming" | "done" | "error"

export interface OpexUploadItem {
    localId: string
    sessionId: string
    file: File
    name: string
    size: number
    mediaType: string
    kind: OpexFileKind
    /** URL local (miniatura) das imagens. */
    previewUrl: string | null
    status: OpexUploadStatus
    progress: number
    error: string | null
    /** Reserva no servidor (id do arquivo) e se o PUT já foi aceito pelo storage. */
    reservationId: string | null
    putDone: boolean
    /** Arquivo confirmado no servidor. */
    uploaded: OpexFileDto | null
}

/** Separa os arquivos aceitos dos recusados pelos limites (quantidade e tamanho). */
export function checkFiles(files: readonly File[], current: number, limits: OpexFilesSettings): { accepted: File[]; tooLarge: File[]; overflow: number } {
    const max = opexMaxBytes(limits.maxSizeMb)
    const room = Math.max(0, limits.maxPerMessage - current)
    const accepted: File[] = []
    const tooLarge: File[] = []
    let overflow = 0
    for (const file of files) {
        if (file.size > max) tooLarge.push(file)
        else if (accepted.length < room) accepted.push(file)
        else overflow++
    }
    return { accepted, tooLarge, overflow }
}

interface UploadsContextValue {
    items: OpexUploadItem[]
    enqueue: (sessionId: string, files: readonly File[], limits: OpexFilesSettings) => void
    retry: (localId: string) => void
    remove: (localId: string) => void
    /** Tira da fila os arquivos que foram numa mensagem. */
    clearSent: (localIds: readonly string[]) => void
}

const UploadsContext = createContext<UploadsContextValue | null>(null)

export function OpexUploadsProvider({ children }: { children: ReactNode }) {
    const { http, apiBase } = useOpexScope()
    const [items, setItems] = useState<OpexUploadItem[]>([])
    const controllers = useRef(new Map<string, AbortController>())
    const itemsRef = useRef(items)
    useEffect(() => {
        itemsRef.current = items
    }, [items])

    const patch = useCallback((localId: string, change: Partial<OpexUploadItem>) => {
        itemsRef.current = itemsRef.current.map((item) => (item.localId === localId ? { ...item, ...change } : item))
        setItems(itemsRef.current)
    }, [])

    const upload = useCallback(
        async (localId: string) => {
            const item = itemsRef.current.find((entry) => entry.localId === localId)
            if (!item) return
            const controller = new AbortController()
            controllers.current.set(localId, controller)
            patch(localId, { status: item.putDone ? "confirming" : "uploading", error: null, ...(item.putDone ? {} : { progress: 0 }) })
            let reservationId = item.reservationId
            try {
                if (!item.putDone) {
                    const reservation = unwrapApi(
                        (await http.post<ApiResponse<OpexFileReservationDto>>(`${apiBase}/sessions/${item.sessionId}/files`, { name: item.name, size: item.size, mediaType: item.mediaType }, { signal: controller.signal })).data,
                    )
                    reservationId = reservation.id
                    patch(localId, { reservationId })
                    try {
                        await axios.put(reservation.url, item.file, {
                            headers: reservation.headers,
                            signal: controller.signal,
                            onUploadProgress: (event) => {
                                const total = event.total ?? item.size
                                patch(localId, { progress: total > 0 ? Math.min(99, Math.round(((event.loaded ?? 0) / total) * 100)) : 0 })
                            },
                        })
                    } catch (error) {
                        // PUT recusado: a reserva é liberada e a nova tentativa reserva de novo.
                        void http.delete(`${apiBase}/files/${reservation.id}`).catch(() => undefined)
                        patch(localId, { reservationId: null })
                        throw error
                    }
                    patch(localId, { putDone: true, status: "confirming", progress: 100 })
                }
                const uploaded = unwrapApi((await http.post<ApiResponse<OpexFileDto>>(`${apiBase}/files/${reservationId}/complete`, {}, { signal: controller.signal })).data)
                patch(localId, { status: "done", progress: 100, uploaded })
            } catch (error) {
                if (controller.signal.aborted) return
                patch(localId, { status: "error", error: apiErrorMessage(error, "Não foi possível enviar o arquivo") })
            } finally {
                controllers.current.delete(localId)
            }
        },
        [patch, http, apiBase],
    )

    const enqueue = useCallback<UploadsContextValue["enqueue"]>(
        (sessionId, files, limits) => {
            const current = itemsRef.current.filter((item) => item.sessionId === sessionId).length
            const { accepted, tooLarge, overflow } = checkFiles(files, current, limits)
            for (const file of tooLarge) toast.error(`"${file.name}" tem ${formatAttachmentSize(file.size)}: o limite é ${formatAttachmentSize(opexMaxBytes(limits.maxSizeMb))}`)
            if (overflow) toast.error(`Até ${limits.maxPerMessage} arquivo(s) por mensagem: ${overflow} ficou(aram) de fora`)
            const created = accepted.map<OpexUploadItem>((file) => {
                const mediaType = file.type || "application/octet-stream"
                const name = file.name?.trim() || fallbackAttachmentName(mediaType)
                const kind = opexFileKind(mediaType, name)
                return {
                    localId: randomId(),
                    sessionId,
                    file,
                    name,
                    size: file.size,
                    mediaType,
                    kind,
                    previewUrl: kind === "image" && typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null,
                    status: "uploading",
                    progress: 0,
                    error: null,
                    reservationId: null,
                    putDone: false,
                    uploaded: null,
                }
            })
            if (!created.length) return
            itemsRef.current = [...itemsRef.current, ...created]
            setItems(itemsRef.current)
            for (const item of created) void upload(item.localId)
        },
        [upload],
    )

    const retry = useCallback((localId: string) => void upload(localId), [upload])

    const forget = useCallback((localIds: readonly string[]) => {
        const ids = new Set(localIds)
        for (const item of itemsRef.current) if (ids.has(item.localId) && item.previewUrl) URL.revokeObjectURL(item.previewUrl)
        itemsRef.current = itemsRef.current.filter((item) => !ids.has(item.localId))
        setItems(itemsRef.current)
    }, [])

    const remove = useCallback(
        (localId: string) => {
            const item = itemsRef.current.find((entry) => entry.localId === localId)
            if (!item) return
            controllers.current.get(localId)?.abort()
            // Já reservado no servidor: apaga (sem uso, a rotina também o remove em 24 h).
            const fileId = item.uploaded?.id ?? item.reservationId
            if (fileId) void http.delete(`${apiBase}/files/${fileId}`).catch(() => undefined)
            forget([localId])
        },
        [forget, http, apiBase],
    )

    useEffect(() => {
        const active = controllers.current
        return () => {
            for (const controller of active.values()) controller.abort()
            for (const item of itemsRef.current) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
        }
    }, [])

    const value = useMemo<UploadsContextValue>(() => ({ items, enqueue, retry, remove, clearSent: forget }), [items, enqueue, retry, remove, forget])
    return <UploadsContext.Provider value={value}>{children}</UploadsContext.Provider>
}

/** Fila da sessão: itens, situação para o envio e ações. */
export function useOpexUploads(sessionId: string | null) {
    const context = useContext(UploadsContext)
    if (!context) throw new Error("useOpexUploads precisa do OpexUploadsProvider")
    const items = useMemo(() => context.items.filter((item) => item.sessionId === sessionId), [context.items, sessionId])
    return {
        items,
        uploading: items.some((item) => item.status === "uploading" || item.status === "confirming"),
        failed: items.some((item) => item.status === "error"),
        ready: items.filter((item) => item.status === "done" && item.uploaded),
        enqueue: context.enqueue,
        retry: context.retry,
        remove: context.remove,
        clearSent: context.clearSent,
    }
}
