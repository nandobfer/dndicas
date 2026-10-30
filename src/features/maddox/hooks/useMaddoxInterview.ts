"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { withBasePath } from "@/lib/base-path"
import { maddoxUserChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { MADDOX_INTERVIEW_CHANGED_EVENT, type MaddoxScriptKind } from "../constants"
import type { MaddoxCampaignDetailDto } from "../campaign-types"
import type { MaddoxInterviewDto, MaddoxInterviewMessageDto, MaddoxInterviewStateDto, MaddoxInterviewStreamLine } from "../interview-types"
import { MADDOX_CAMPAIGNS_KEY } from "./useMaddoxCampaigns"

export const maddoxInterviewKey = (campaignId: string, kind: MaddoxScriptKind) => [...MADDOX_CAMPAIGNS_KEY, "interview", campaignId, kind] as const

const interviewPath = (campaignId: string, kind: MaddoxScriptKind) => `/maddox/campaigns/${campaignId}/interviews/${kind}`

/** Divide o buffer NDJSON em linhas completas. */
export function splitInterviewLines(buffer: string): { lines: MaddoxInterviewStreamLine[]; rest: string } {
    const parts = buffer.split("\n")
    const rest = parts.pop() ?? ""
    const lines: MaddoxInterviewStreamLine[] = []
    for (const part of parts) {
        if (!part.trim()) continue
        try {
            lines.push(JSON.parse(part) as MaddoxInterviewStreamLine)
        } catch {
            // linha inválida: ignora
        }
    }
    return { lines, rest }
}

/**
 * A conexão caiu DEPOIS de o stream abrir: o servidor já gravou a resposta da pessoa e continua gerando a do
 * Maddox, então o texto não volta ao campo (evita resposta duplicada).
 */
export class InterviewStreamInterruptedError extends Error {
    constructor(cause: unknown) {
        super("A conexão caiu durante a resposta do Maddox. Sua resposta foi enviada; a conversa atualiza em instantes.")
        this.name = "InterviewStreamInterruptedError"
        this.cause = cause
    }
}

/** Enquanto o servidor ainda gera (outra aba, recarga no meio da resposta): consulta de novo neste intervalo. */
export const INTERVIEW_GENERATING_REFETCH_MS = 3000

/**
 * POST numa rota de entrevista: lê o NDJSON (`user`, `delta`, `done`, `error`) ou, quando a entrevista já
 * começou, o JSON com a entrevista. Erros HTTP lançam com a mensagem pt-BR do servidor.
 */
export async function postInterviewStream(path: string, body: unknown, onLine: (line: MaddoxInterviewStreamLine) => void): Promise<MaddoxInterviewDto | null> {
    const res = await fetch(withBasePath(`/api${path}`), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson, application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
    })
    const type = res.headers.get("content-type") ?? ""
    if (!res.ok || type.includes("application/json")) {
        const json = (await res.json().catch(() => null)) as ApiResponse<{ interview: MaddoxInterviewDto }> | null
        if (!res.ok || !json?.success) throw new Error(json?.error ?? "Não foi possível falar com o Maddox agora. Tente de novo.")
        return json.data?.interview ?? null
    }
    if (!res.body) throw new Error("Resposta vazia do servidor")
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let final: MaddoxInterviewDto | null = null
    for (;;) {
        let chunk: ReadableStreamReadResult<Uint8Array>
        try {
            chunk = await reader.read()
        } catch (error) {
            throw new InterviewStreamInterruptedError(error)
        }
        const { value, done } = chunk
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const { lines, rest } = splitInterviewLines(buffer)
        buffer = rest
        for (const line of lines) {
            if (line.type === "done") final = line.interview
            if (line.type === "error" && line.interview) final = line.interview
            onLine(line)
        }
    }
    const { lines } = splitInterviewLines(`${buffer}\n`)
    for (const line of lines) onLine(line)
    return final
}

export interface InterviewLiveState {
    /** Há uma requisição desta aba em andamento (abertura, resposta ou nova tentativa). */
    streaming: boolean
    /** Texto do Maddox chegando agora. */
    liveText: string
    /** Minha resposta já enviada, antes de a entrevista gravada chegar. */
    pendingUser: MaddoxInterviewMessageDto | null
}

const IDLE: InterviewLiveState = { streaming: false, liveText: "", pendingUser: null }

/** Entrevista do Maddox na tela: estado gravado, stream da resposta e as ações (começar, responder, tentar de novo). */
export function useMaddoxInterview(campaignId: string, kind: MaddoxScriptKind, userId: string | null) {
    const queryClient = useQueryClient()
    const key = maddoxInterviewKey(campaignId, kind)
    const [live, setLive] = useState<InterviewLiveState>(IDLE)
    const streamingRef = useRef(false)

    const query = useQuery({
        queryKey: key,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<MaddoxInterviewStateDto>>(interviewPath(campaignId, kind))).data),
        retry: false,
        // Sem stream nesta aba e o servidor ainda gerando: o realtime pode não chegar (Pusher fora, evento perdido),
        // então consulta de novo até a geração terminar para não deixar a tela travada.
        refetchInterval: (current) => (current.state.data?.interview?.generating && !streamingRef.current ? INTERVIEW_GENERATING_REFETCH_MS : false),
    })

    // Outras abas: a entrevista mudou (resposta gravada, conclusão).
    useEffect(() => {
        if (!userId || !isPusherClientAvailable()) return
        const name = maddoxUserChannel(userId)
        const channel = acquireChannel(name)
        const refresh = (payload?: { campaignId?: string; kind?: string }) => {
            if (streamingRef.current) return
            if (payload?.campaignId && (payload.campaignId !== campaignId || payload.kind !== kind)) return
            void queryClient.invalidateQueries({ queryKey: key })
        }
        channel.bind(MADDOX_INTERVIEW_CHANGED_EVENT, refresh)
        return () => {
            channel.unbind(MADDOX_INTERVIEW_CHANGED_EVENT, refresh)
            releaseChannel(name)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryClient, userId, campaignId, kind])

    const run = useCallback(
        async (suffix: "" | "/messages" | "/retry", body?: unknown, pendingUser?: MaddoxInterviewMessageDto) => {
            if (streamingRef.current) return
            streamingRef.current = true
            setLive({ streaming: true, liveText: "", pendingUser: pendingUser ?? null })
            try {
                const final = await postInterviewStream(`${interviewPath(campaignId, kind)}${suffix}`, body, (line) => {
                    if (line.type === "delta") setLive((current) => ({ ...current, liveText: current.liveText + line.text }))
                    else if (line.type === "user") setLive((current) => ({ ...current, pendingUser: line.message }))
                    else if (line.type === "error") toast.error(line.message)
                })
                if (final) {
                    queryClient.setQueryData<MaddoxInterviewStateDto>(key, (current) => ({ maddoxAvatarUrl: current?.maddoxAvatarUrl ?? null, interview: final }))
                }
                void queryClient.invalidateQueries({ queryKey: MADDOX_CAMPAIGNS_KEY })
                return true
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Não foi possível falar com o Maddox agora.")
                void queryClient.invalidateQueries({ queryKey: key })
                // Falha depois de o stream abrir: a resposta já está gravada, não devolve o texto ao campo.
                return error instanceof InterviewStreamInterruptedError

            } finally {
                streamingRef.current = false
                setLive(IDLE)
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [campaignId, kind, queryClient],
    )

    const start = useCallback(() => run(""), [run])
    const retry = useCallback(() => run("/retry"), [run])
    const send = useCallback(
        (content: string) =>
            run("/messages", { content }, { id: `pending-${Date.now()}`, role: "user", content, proposal: false, error: null, createdAt: new Date().toISOString() }),
        [run],
    )

    const complete = useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<MaddoxCampaignDetailDto>>(`${interviewPath(campaignId, kind)}/complete`)).data),
        onSuccess: (campaign) => {
            queryClient.setQueryData([...MADDOX_CAMPAIGNS_KEY, "detail", campaignId], campaign)
            void queryClient.invalidateQueries({ queryKey: MADDOX_CAMPAIGNS_KEY })
            toast.success(kind === "scenario" ? "Cenário salvo! Os jogadores já podem fazer a entrevista de personagem." : "Personagem pronto para entrar no jogo!")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível concluir a entrevista")),
    })

    return { query, live, start, send, retry, complete }
}
