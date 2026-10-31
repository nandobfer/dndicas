"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowLeft, BookOpen, CheckCircle2, Hourglass, Loader2, MessageCircle, Sparkles, UserRound } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { Markdown } from "@/components/ui/opex/markdown"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { useAuth } from "@/core/hooks/useAuth"
import { MADDOX_PROFILE_SECTIONS, MADDOX_SHEET_RIGORS, type MaddoxScriptKind } from "../../constants"
import type { MaddoxCampaignDetailDto } from "../../campaign-types"
import { useMaddoxCampaign, useMaddoxCampaignsRealtime } from "../../hooks/useMaddoxCampaigns"
import { useMaddoxInterview } from "../../hooks/useMaddoxInterview"
import { CharacterDraftDialog } from "../campaigns/CharacterDraftDialog"
import { InterviewChip, RigorChip, rigorColor } from "../campaigns/campaign-visuals"
import { InterviewComposer } from "./InterviewComposer"
import { InterviewMessageList } from "./InterviewMessageList"
import { InterviewProposalCard } from "./InterviewProposalCard"

const errorStatus = (error: unknown) => (error as { response?: { status?: number } } | null)?.response?.status

const TITLES: Record<MaddoxScriptKind, string> = { scenario: "Entrevista de cenário", character: "Entrevista de personagem" }

/** `/campanhas/[id]/entrevista/(cenario|personagem)`: conversa com o Maddox entrevistador. */
export function InterviewPage({ campaignId, kind }: { campaignId: string; kind: MaddoxScriptKind }) {
    const { userId } = useAuth()
    const campaign = useMaddoxCampaign(campaignId)
    useMaddoxCampaignsRealtime(userId)

    if (campaign.isLoading) {
        return (
            <div className="space-y-6" aria-busy="true" aria-label="Carregando entrevista">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-80 w-full rounded-xl" />
            </div>
        )
    }
    if (campaign.isError || !campaign.data) {
        return (
            <div className="space-y-6">
                <BackLink campaignId={campaignId} />
                {errorStatus(campaign.error) === 404 ? (
                    <EmptyState icon={MessageCircle} title="Campanha não encontrada" description="Ela não existe ou você não participa dela." />
                ) : (
                    <ErrorState title="Não foi possível carregar a campanha" onRetry={() => void campaign.refetch()} />
                )}
            </div>
        )
    }
    return <InterviewGate campaign={campaign.data} kind={kind} userId={userId} />
}

function BackLink({ campaignId }: { campaignId: string }) {
    return (
        <Link href={`/campanhas/${campaignId}`} className="inline-flex items-center gap-1 text-sm text-white/60 hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar à campanha
        </Link>
    )
}

/** Pré-requisitos antes da conversa: dono no cenário; cenário pronto e personagem esboçado no personagem. */
function InterviewGate({ campaign, kind, userId }: { campaign: MaddoxCampaignDetailDto; kind: MaddoxScriptKind; userId: string | null }) {
    const [drafting, setDrafting] = useState(false)
    const header = <InterviewHeader campaign={campaign} kind={kind} />
    if (kind === "scenario" && campaign.myRole !== "owner") {
        return (
            <Shell campaignId={campaign.id} header={header}>
                <EmptyState icon={Hourglass} title="Só o dono define o cenário" description={`${campaign.ownerName} conversa com o Maddox para definir o cenário. Depois disso, você faz a entrevista do seu personagem.`} />
            </Shell>
        )
    }
    if (kind === "character" && campaign.scenarioStatus !== "done") {
        return (
            <Shell campaignId={campaign.id} header={header}>
                <EmptyState icon={Hourglass} title="Aguardando o cenário" description="A entrevista de personagem começa depois que o dono da campanha definir o cenário com o Maddox." />
            </Shell>
        )
    }
    if (kind === "character" && !campaign.myCharacter) {
        return (
            <Shell campaignId={campaign.id} header={header}>
                <EmptyState icon={UserRound} title="Crie o seu personagem primeiro" description="Dê um nome (e, se quiser, um retrato) ao personagem. Depois o Maddox conversa com você para completar a história dele." actionLabel="Criar personagem" onAction={() => setDrafting(true)} />
                <CharacterDraftDialog campaignId={campaign.id} character={null} open={drafting} onOpenChange={setDrafting} />
            </Shell>
        )
    }
    return (
        <Shell campaignId={campaign.id} header={header}>
            <InterviewConversation campaign={campaign} kind={kind} userId={userId} />
        </Shell>
    )
}

function Shell({ campaignId, header, children }: { campaignId: string; header: React.ReactNode; children: React.ReactNode }) {
    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6" data-testid="interview-page">
            <BackLink campaignId={campaignId} />
            {header}
            {children}
        </motion.div>
    )
}

function InterviewHeader({ campaign, kind }: { campaign: MaddoxCampaignDetailDto; kind: MaddoxScriptKind }) {
    const color = rigorColor(campaign.rigor)
    const status = kind === "scenario" ? campaign.scenarioStatus : (campaign.myCharacter?.interviewStatus ?? "pending")
    return (
        <header className="relative overflow-hidden rounded-xl border border-white/10 p-5" style={{ background: `radial-gradient(circle at 10% 0%, ${color}40, transparent 60%)`, boxShadow: `inset 3px 0 0 ${color}` }}>
            <h1 className="flex items-center gap-2 text-xl font-bold text-white">
                {kind === "scenario" ? <BookOpen className="h-5 w-5 shrink-0" style={{ color }} aria-hidden /> : <UserRound className="h-5 w-5 shrink-0" style={{ color }} aria-hidden />}
                <span className="truncate">{TITLES[kind]}</span>
            </h1>
            <p className="mt-1 truncate text-sm text-white/70">
                {campaign.name}
                {kind === "character" && campaign.myCharacter ? ` · ${campaign.myCharacter.name}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <RigorChip rigor={campaign.rigor} />
                <InterviewChip status={status} />
            </div>
        </header>
    )
}

function InterviewConversation({ campaign, kind, userId }: { campaign: MaddoxCampaignDetailDto; kind: MaddoxScriptKind; userId: string | null }) {
    const router = useRouter()
    const { query, live, start, send, retry, complete } = useMaddoxInterview(campaign.id, kind, userId)
    const color = rigorColor(campaign.rigor)

    if (query.isLoading) return <Skeleton className="h-80 w-full rounded-xl" aria-label="Carregando conversa" />
    if (query.isError || !query.data) return <ErrorState title="Não foi possível carregar a entrevista" onRetry={() => void query.refetch()} />

    const interview = query.data.interview
    const messages = interview?.messages ?? []
    const shown = live.pendingUser && !messages.some((message) => message.id === live.pendingUser!.id) ? [...messages, live.pendingUser] : messages
    const busy = live.streaming || Boolean(interview?.generating)
    const last = messages[messages.length - 1]
    const proposal = interview?.status === "proposed" && last?.role === "maddox" && last.proposal && !live.streaming

    if (!interview && !live.streaming) {
        return (
            <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
                <Sparkles className="mx-auto h-8 w-8" style={{ color }} aria-hidden />
                <div className="space-y-1">
                    <p className="text-base font-semibold text-white">{kind === "scenario" ? "Vamos criar o mundo da campanha" : "Vamos dar vida ao seu personagem"}</p>
                    <p className="text-sm text-white/60">
                        {kind === "scenario"
                            ? "O Maddox vai conversar com você sobre o universo, o tom e a situação inicial da história. Ao começar, o grau de rigor fica travado."
                            : `O Maddox vai conversar com você sobre a origem, a personalidade e as capacidades do personagem${MADDOX_SHEET_RIGORS.includes(campaign.rigor) ? " e preparar a ficha do D&D" : ""}.`}
                    </p>
                </div>
                <Button onClick={() => void start()}>
                    <MessageCircle aria-hidden /> Começar entrevista
                </Button>
            </div>
        )
    }

    if (interview?.status === "done") {
        return (
            <div className="space-y-6">
                <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="flex items-center gap-2 text-sm text-white/80">
                        <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color }} aria-hidden /> Entrevista concluída. {kind === "scenario" ? "O cenário está salvo na campanha." : "Seu personagem está pronto para entrar no jogo."}
                    </p>
                    <Button variant="outline" onClick={() => router.push(`/campanhas/${campaign.id}`)}>
                        Voltar à campanha
                    </Button>
                </div>
                {kind === "scenario" ? <ScenarioSummary campaign={campaign} /> : <ProfileSummary campaign={campaign} />}
            </div>
        )
    }

    return (
        <section
            aria-label="Entrevista com o Maddox"
            data-testid="interview-panel"
            className="flex h-[calc(100dvh-18rem)] min-h-[420px] flex-col overflow-hidden rounded-xl border bg-card/40 backdrop-blur"
            style={{ borderColor: `${color}40` }}
        >
            <InterviewMessageList
                messages={shown}
                liveText={busy ? live.liveText : null}
                maddoxAvatarUrl={query.data.maddoxAvatarUrl}
                color={color}
                onRetry={() => void retry()}
                retrying={live.streaming}
            />
            {proposal && (
                <InterviewProposalCard
                    kind={kind}
                    pending={complete.isPending}
                    disabled={busy}
                    onConfirm={() => complete.mutate(undefined, { onSuccess: () => router.push(`/campanhas/${campaign.id}`) })}
                />
            )}
            {complete.isPending && (
                <p className="flex items-center gap-2 px-4 pb-2 text-sm text-white/60" role="status">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> O Maddox está consolidando a entrevista…
                </p>
            )}
            <InterviewComposer
                disabled={busy || complete.isPending}
                busy={live.streaming}
                placeholder={proposal ? "Peça ajustes ao Maddox, se quiser…" : "Responda ao Maddox…"}
                onSend={send}
                focusKey={[...messages].reverse().find((message) => message.role === "maddox")?.id ?? ""}
            />
        </section>
    )
}

function ScenarioSummary({ campaign }: { campaign: MaddoxCampaignDetailDto }) {
    return (
        <section className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-5" aria-label="Cenário da campanha">
            <Markdown lineAction={null}>{campaign.setting || "Cenário ainda não salvo."}</Markdown>
            {campaign.openingSituation && (
                <div className="space-y-1">
                    <h2 className="text-sm font-semibold text-white">Situação inicial</h2>
                    <Markdown lineAction={null}>{campaign.openingSituation}</Markdown>
                </div>
            )}
        </section>
    )
}

function ProfileSummary({ campaign }: { campaign: MaddoxCampaignDetailDto }) {
    const profile = campaign.myCharacter?.profile ?? {}
    return (
        <section className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-5" aria-label="Perfil do personagem">
            {MADDOX_PROFILE_SECTIONS.map((item) =>
                profile[item.key] ? (
                    <div key={item.key} className="space-y-1">
                        <h2 className="text-sm font-semibold text-white">{item.label}</h2>
                        <Markdown lineAction={null}>{profile[item.key]!}</Markdown>
                    </div>
                ) : null,
            )}
            {campaign.myCharacter?.sheetSlug && (
                <Link href={`/sheets/${campaign.myCharacter.sheetSlug}`} className="inline-flex text-sm font-medium text-primary hover:underline">
                    Abrir ficha do D&D
                </Link>
            )}
        </section>
    )
}
