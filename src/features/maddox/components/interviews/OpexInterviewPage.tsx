"use client"

import { useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { AlertTriangle, ArrowLeft, Bot, CheckCircle2, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { Textarea } from "@/components/ui/opex/textarea"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { useAuth } from "@/core/hooks/useAuth"
import { MADDOX_OPEX_GUIDANCE_MAX, MADDOX_OPEX_INTERVIEW_MODE_LABELS, MADDOX_OPEX_UNNAMED_LABEL } from "../../constants"
import { useMaddoxCampaign, useMaddoxCampaignsRealtime } from "../../hooks/useMaddoxCampaigns"
import { useMaddoxOpexInterview } from "../../hooks/useMaddoxOpex"
import { OpexChip, RarityChip, RigorChip, rigorColor } from "../campaigns/campaign-visuals"
import { CampaignChatHeader } from "../CampaignChatHeader"
import { AbilityScoresCard } from "./AbilityScoresCard"
import { HitPointsCard } from "./HitPointsCard"
import { InterviewMessageList } from "./InterviewMessageList"
import { InterviewProposalCard } from "./InterviewProposalCard"
import { OpexDraftPanel } from "./OpexDraftPanel"

const errorStatus = (error: unknown) => (error as { response?: { status?: number } } | null)?.response?.status

/**
 * `/campanhas/[id]/entrevista/opex/[memberId]` (DND-26): o dono acompanha a entrevista do Personagem Opex. No modo
 * autônomo, só leitura; no modo ao vivo, cada resposta do Opex espera a aprovação dele, e a síntese, o "Confirmar e
 * concluir".
 */
export function OpexInterviewPage({ campaignId, memberId }: { campaignId: string; memberId: string }) {
    const { userId } = useAuth()
    useMaddoxCampaignsRealtime(userId)
    const campaign = useMaddoxCampaign(campaignId)
    const { query, approve, regenerate, complete, retry, streamText } = useMaddoxOpexInterview(campaignId, memberId, userId)
    const [adjust, setAdjust] = useState("")

    if (query.isLoading || campaign.isLoading) return <Skeleton className="h-96 w-full rounded-xl" aria-label="Carregando a entrevista" />
    if (query.isError || !query.data || !campaign.data) {
        const status = errorStatus(query.error)
        return (
            <div className="space-y-4">
                <BackLink campaignId={campaignId} />
                {status === 403 || status === 404 ? (
                    <EmptyState icon={Bot} title="Entrevista indisponível" description="Só o dono da campanha acompanha a entrevista dos Personagens Opex." />
                ) : (
                    <ErrorState title="Não foi possível carregar a entrevista" onRetry={() => void query.refetch()} />
                )}
            </div>
        )
    }
    const data = query.data
    const color = rigorColor(campaign.data.rigor)
    const interview = data.interview
    const messages = interview?.messages ?? []
    const last = messages.at(-1)
    const live = data.interviewMode === "live"
    // Um ajuste pedido na síntese vira rascunho: enquanto ele existe, o painel de aprovação toma o lugar do card de confirmação.
    const proposal = live && interview?.status === "proposed" && last?.role === "maddox" && last.proposal && !interview?.opexDraft
    const busy = approve.isPending || Boolean(interview?.generating)
    const pendingAbility = [...messages].reverse().find((message) => message.abilityScores?.status === "pending")?.abilityScores ?? null
    const done = interview?.status === "done"

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-[calc(100dvh_-_6rem_-_var(--view-as-banner-height,0px))] min-h-[480px] flex-col gap-3 lg:h-[calc(100dvh_-_7rem_-_var(--view-as-banner-height,0px))] lg:min-h-[640px]" data-testid="opex-interview-page">
            <CampaignChatHeader
                campaignId={campaignId}
                color={color}
                icon={Bot}
                title="Entrevista do Personagem Opex"
                subtitle={`${campaign.data.name} · ${data.characterName || MADDOX_OPEX_UNNAMED_LABEL}`}
                chips={
                    <>
                        <RigorChip rigor={campaign.data.rigor} />
                        <OpexChip />
                        <RarityChip color={color}>{MADDOX_OPEX_INTERVIEW_MODE_LABELS[data.interviewMode]}</RarityChip>
                    </>
                }
            />
            {data.status === "failed" && !done && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                    <AlertTriangle className="h-4 w-4" aria-hidden /> {data.error ?? "A entrevista do Personagem Opex parou."}
                    <Button size="sm" variant="outline" onClick={() => retry.mutate()} disabled={retry.isPending}>
                        {retry.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} Tentar de novo
                    </Button>
                </div>
            )}
            {done && (
                <p className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/80">
                    <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color }} aria-hidden /> Entrevista concluída: o Personagem Opex está pronto para jogar.
                </p>
            )}
            <section aria-label="Entrevista do Personagem Opex" data-testid="interview-panel" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card/40 backdrop-blur" style={{ borderColor: `${color}40` }}>
                <InterviewMessageList
                    messages={messages}
                    liveText={streamText}
                    maddoxAvatarUrl={data.maddoxAvatarUrl}
                    color={color}
                    renderAfter={(message) =>
                        message.abilityScores && message.abilityScores.status !== "pending" ? (
                            <AbilityScoresCard card={message.abilityScores} rolls={interview?.abilityRolls ?? null} color={color} disabled onRoll={() => Promise.reject(new Error(""))} onReset={() => undefined} resetting={false} onSubmit={() => undefined} />
                        ) : message.hitPoints && message.hitPoints.status !== "pending" ? (
                            <HitPointsCard card={message.hitPoints} color={color} disabled onRoll={() => Promise.reject(new Error(""))} onSubmit={() => undefined} />
                        ) : null
                    }
                />
                {!done && !live && data.status === "interviewing" && (
                    <p className="flex items-center gap-2 px-4 pb-3 text-sm text-white/60" role="status">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Entrevista autônoma em andamento: o Personagem Opex responde sozinho.
                    </p>
                )}
                {!done && live && proposal && (
                    <>
                        <InterviewProposalCard kind="character" pending={complete.isPending} disabled={busy || regenerate.isPending} onConfirm={() => complete.mutate()} />
                        <div className="mx-3 mb-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                            <Textarea aria-label="Pedir um ajuste" rows={2} maxLength={MADDOX_OPEX_GUIDANCE_MAX} value={adjust} onChange={(event) => setAdjust(event.target.value)} placeholder="Ou peça um ajuste: o Opex escreve o pedido ao Maddox e você aprova." />
                            <Button size="sm" variant="outline" disabled={!adjust.trim() || regenerate.isPending || busy} onClick={() => regenerate.mutate(adjust.trim(), { onSuccess: () => setAdjust("") })}>
                                Pedir ajuste
                            </Button>
                        </div>
                    </>
                )}
                {!done && live && !proposal && data.status !== "failed" && (interview?.opexDraft || data.status === "awaiting-approval" || data.status === "interviewing") && !interview?.generating && (
                    <OpexDraftPanel
                        key={`${interview?.opexDraft?.id ?? "none"}:${interview?.opexDraft?.status ?? ""}`}
                        draft={interview?.opexDraft ?? null}
                        abilityCard={pendingAbility}
                        rolls={interview?.abilityRolls ?? null}
                        color={color}
                        busy={approve.isPending}
                        regenerating={regenerate.isPending}
                        onApprove={(input) => approve.mutate(input)}
                        onRegenerate={(guidance) => regenerate.mutate(guidance)}
                    />
                )}
            </section>
        </motion.div>
    )
}

function BackLink({ campaignId }: { campaignId: string }) {
    return (
        <Link href={`/campanhas/${campaignId}`} className="inline-flex items-center gap-1 text-sm text-white/60 hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar à campanha
        </Link>
    )
}
