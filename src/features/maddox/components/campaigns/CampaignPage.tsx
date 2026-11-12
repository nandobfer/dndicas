"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { AlertTriangle, ArrowLeft, BookOpen, Bot, CheckCircle2, Crown, Dices, DoorOpen, Hourglass, ImageOff, Loader2, MessageCircle, Pencil, Play, RefreshCw, RotateCcw, ScrollText, Swords, UserMinus, UserRound, Users } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { ConfirmDialog } from "@/components/ui/opex/confirm-dialog"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { EmptyState } from "@/components/feedback/EmptyState"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardDescription as CardDescription, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import { useAuth } from "@/core/hooks/useAuth"
import { MADDOX_CHARACTER_UNNAMED_LABEL, MADDOX_OPEX_INTERVIEW_MODE_LABELS, MADDOX_OPEX_UNNAMED_LABEL, MADDOX_RESET_NOTICE_PARAM, MADDOX_RESET_NOTICE_VALUE, MADDOX_RESET_TEXTS, MADDOX_RIGOR_LEVEL_DEFS, MADDOX_TACTICAL_COMBAT_RIGORS, MADDOX_TURN_PHASE_LABELS, maddoxSheetRestoreFailedMessage, memberAvatarContext } from "../../constants"
import type { MaddoxCampaignCharacterDto, MaddoxCampaignDetailDto, MaddoxCampaignMemberDto } from "../../campaign-types"
import { useMaddoxCampaign, useMaddoxCampaignsRealtime, useRemoveMaddoxMember, useResetMaddoxCampaign, useRetryMaddoxCharacterPortrait, useRetryMaddoxSheetRestore } from "../../hooks/useMaddoxCampaigns"
import { useStartMaddoxCampaign } from "../../hooks/useMaddoxGame"
import { useMaddoxOpexLobbyActions } from "../../hooks/useMaddoxOpex"
import { AddOpexDialog } from "./AddOpexDialog"
import { EditCampaignDialog } from "./EditCampaignDialog"
import { InvitePanel } from "./InvitePanel"
import { CharacterProfileDialog } from "./CharacterProfileDialog"
import { journalHref } from "../journal/journal-links"
import { CampaignStoryCard } from "./CampaignStoryCard"
import { InterviewChip, MemberAvatar, OpexChip, CombatDifficultyChip, DensityChip, RarityChip, RigorChip, StartingLevelChip, StartingStageLine, StatusChip, WorldCatalogLines, rigorColor } from "./campaign-visuals"
import { rarityColors } from "@/lib/config/colors"

const errorStatus = (error: unknown) => (error as { response?: { status?: number } } | null)?.response?.status

/** `/campanhas/[id]`: cabeçalho da campanha, lobby (membros e personagens) e convite. */
export function CampaignPage({ campaignId }: { campaignId: string }) {
    const { userId } = useAuth()
    const campaign = useMaddoxCampaign(campaignId)
    useMaddoxCampaignsRealtime(userId)

    if (campaign.isLoading) {
        return (
            <div className="space-y-4" aria-busy="true" aria-label="Carregando campanha">
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-64 w-full rounded-xl" />
            </div>
        )
    }
    if (campaign.isError || !campaign.data) {
        const notFound = errorStatus(campaign.error) === 404
        return (
            <div className="space-y-4">
                <BackLink />
                {notFound ? (
                    <EmptyState icon={Swords} title="Campanha não encontrada" description="Ela não existe ou você não participa dela. Peça o link de convite ao dono da campanha." />
                ) : (
                    <ErrorState title="Não foi possível carregar a campanha" onRetry={() => void campaign.refetch()} />
                )}
            </div>
        )
    }
    return <CampaignView campaign={campaign.data} userId={userId} />
}

function BackLink() {
    return (
        <Link href="/campanhas" className="inline-flex items-center gap-1 text-sm text-white/60 hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Campanhas Maddox
        </Link>
    )
}

function CampaignView({ campaign, userId }: { campaign: MaddoxCampaignDetailDto; userId: string | null }) {
    const router = useRouter()
    const isOwner = campaign.myRole === "owner"
    const color = rigorColor(campaign.rigor)
    const remove = useRemoveMaddoxMember(campaign.id)
    const start = useStartMaddoxCampaign(campaign.id)
    const [starting, setStarting] = useState(false)
    const [editing, setEditing] = useState(false)
    const retryPortrait = useRetryMaddoxCharacterPortrait(campaign.id)
    const [removing, setRemoving] = useState<MaddoxCampaignMemberDto | null>(null)
    const [leaving, setLeaving] = useState(false)
    const [addingOpex, setAddingOpex] = useState(false)
    const opexActions = useMaddoxOpexLobbyActions(campaign.id)
    const canAddOpex = isOwner && campaign.canAddOpex === true && campaign.inviteOpen
    const [viewing, setViewing] = useState<{ character: MaddoxCampaignCharacterDto; playerName: string; own: boolean } | null>(null)
    const ready = campaign.members.filter((member) => member.ready).length
    const scenarioDone = campaign.scenarioStatus === "done"
    const active = campaign.status === "active"
    const meReady = campaign.members.find((member) => member.id === campaign.myMemberId)?.ready ?? false
    const sheetRestores = campaign.sheetRestores ?? []
    const adjusting = sheetRestores.some((item) => item.status === "pending")
    const startBlocked =
        campaign.status !== "lobby" || !scenarioDone
            ? "Conclua a entrevista de cenário com o Maddox"
            : !meReady
              ? "Conclua a sua entrevista de personagem"
              : campaign.resetting
                ? MADDOX_RESET_TEXTS.inProgress
                : adjusting
                  ? MADDOX_RESET_TEXTS.sheetsAdjusting
                  : null
    const reset = useResetMaddoxCampaign(campaign.id)
    const retrySheet = useRetryMaddoxSheetRestore(campaign.id)
    const [confirmingReset, setConfirmingReset] = useState(false)
    const resetNotice = useResetNotice()

    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <BackLink />

            <header className="relative overflow-hidden rounded-xl border border-white/10 p-5" style={{ background: `radial-gradient(circle at 10% 0%, ${color}40, transparent 60%)`, boxShadow: `inset 3px 0 0 ${color}` }}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-2">
                        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
                            <Swords className="h-6 w-6 shrink-0" style={{ color }} aria-hidden />
                            <span className="truncate">{campaign.name}</span>
                        </h1>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <RigorChip rigor={campaign.rigor} />
                            <DensityChip density={campaign.density} />
                            {MADDOX_TACTICAL_COMBAT_RIGORS.includes(campaign.rigor) && <CombatDifficultyChip level={campaign.combatDifficulty} />}
                            <StatusChip status={campaign.status} />
                            <StartingLevelChip campaign={campaign} />
                            <RarityChip color={isOwner ? rarityColors.legendary : rarityColors.veryRare}>{isOwner ? "Você é o dono" : "Você é jogador"}</RarityChip>
                        </div>
                        <p className="text-sm text-white/60">{MADDOX_RIGOR_LEVEL_DEFS[campaign.rigor].description}</p>
                        <StartingStageLine campaign={campaign} />
                        <WorldCatalogLines campaign={campaign} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {active && (
                            <Button asChild>
                                <Link href={`/campanhas/${campaign.id}/mesa`}>
                                    <Dices aria-hidden /> Entrar na mesa
                                </Link>
                            </Button>
                        )}
                        {campaign.status !== "lobby" && campaign.status !== "interview" && (
                            <Button variant="outline" asChild>
                                <Link href={journalHref(campaign.id)}>
                                    <BookOpen aria-hidden /> Diário
                                </Link>
                            </Button>
                        )}
                        {isOwner && !active && (campaign.status === "lobby" || campaign.status === "interview") && (
                            <Button onClick={() => setStarting(true)} disabled={startBlocked !== null} title={startBlocked ?? undefined}>
                                <Play aria-hidden /> Iniciar campanha
                            </Button>
                        )}
                        {canAddOpex && (
                            <Button variant="outline" onClick={() => setAddingOpex(true)} disabled={!scenarioDone} title={scenarioDone ? undefined : "Disponível depois que o cenário estiver pronto"}>
                                <Bot aria-hidden /> Adicionar Personagem Opex
                            </Button>
                        )}
                        {campaign.canReset === true && (
                            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirmingReset(true)}>
                                <RotateCcw aria-hidden /> {MADDOX_RESET_TEXTS.button}
                            </Button>
                        )}
                        {isOwner ? (
                            <Button variant="outline" onClick={() => setEditing(true)}>
                                <Pencil aria-hidden /> Editar
                            </Button>
                        ) : (
                            <Button variant="outline" onClick={() => setLeaving(true)}>
                                <DoorOpen aria-hidden /> Sair da campanha
                            </Button>
                        )}
                    </div>
                </div>
            </header>

            {resetNotice && (
                <p className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100" role="status" data-testid="campaign-reset-notice">
                    <RotateCcw className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    {MADDOX_RESET_TEXTS.notice}
                </p>
            )}

            {isOwner && adjusting && (
                <p className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-white/70" role="status" data-testid="sheet-restore-pending">
                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
                    {MADDOX_RESET_TEXTS.sheetsAdjusting}
                </p>
            )}

            {isOwner &&
                sheetRestores
                    .filter((item) => item.status === "failed")
                    .map((item) => (
                        <div key={item.characterId} className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-white/80" role="alert" data-testid="sheet-restore-failed">
                            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
                            <span className="min-w-0 flex-1">{maddoxSheetRestoreFailedMessage(item.characterName)}</span>
                            <Button size="sm" variant="outline" onClick={() => retrySheet.mutate(item.characterId)} disabled={retrySheet.isPending}>
                                {retrySheet.isPending && retrySheet.variables === item.characterId ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} {MADDOX_RESET_TEXTS.retry}
                            </Button>
                        </div>
                    ))}

            {(campaign.status === "lobby" || campaign.status === "interview") && (
                <p className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-white/70">
                    <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    {scenarioDone
                        ? `Lobby: ${ready} de ${campaign.members.length} participante(s) prontos para jogar. Só entra no jogo quem concluir a entrevista de personagem com o Maddox.`
                        : "Preparação: o dono define o cenário com o Maddox. Enquanto isso, convide os jogadores; cada um cria o personagem na entrevista com o Maddox depois do cenário."}
                </p>
            )}

            {active && (
                <p className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-white/70" data-testid="campaign-active-banner">
                    <Dices className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    {`Em andamento · Turno ${campaign.turnNumber} · ${MADDOX_TURN_PHASE_LABELS[campaign.turnPhase]}${campaign.combatTitle ? ` · em combate (${campaign.combatTitle})` : ""}. Quem entra agora faz a entrevista de personagem e joga a partir do próximo turno.`}
                </p>
            )}

            <CampaignStoryCard campaign={campaign} />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Users className="h-4 w-4 text-primary" aria-hidden /> Participantes ({campaign.members.length})
                        </CardTitle>
                        <CardDescription>Quem está na mesa e o personagem de cada um.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ul className="divide-y divide-white/5" aria-label="Participantes">
                            {campaign.members.map((member) => (
                                <motion.li key={member.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap items-center gap-3 py-3">
                                    <MemberAvatar name={member.character?.name || member.name} imageUrl={member.character?.portraitUrl ?? member.avatarUrl} color={member.character ? color : undefined} context={memberAvatarContext({ opex: member.kind === "opex", role: member.role, playerName: member.character?.name ? member.name : null })} className="h-11 w-11" />
                                    <div className="min-w-0 flex-1">
                                        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-white">
                                            {member.character?.name ? member.character.name : <span className="text-white/50">{member.kind === "opex" ? MADDOX_OPEX_UNNAMED_LABEL : member.character ? MADDOX_CHARACTER_UNNAMED_LABEL : "Personagem ainda não criado"}</span>}
                                            {member.kind === "opex" && <OpexChip />}
                                            {member.ready && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: rarityColors.legendary }} aria-label="Pronto para jogar" />}
                                        </p>
                                        {member.kind === "opex" ? (
                                            <p className="flex items-center gap-1 truncate text-xs text-white/60">
                                                <Bot className="h-3 w-3" aria-hidden />
                                                {member.name}
                                                {member.opex ? ` · entrevista ${MADDOX_OPEX_INTERVIEW_MODE_LABELS[member.opex.interviewMode].toLowerCase()}` : ""}
                                            </p>
                                        ) : (
                                            <p className="flex items-center gap-1 truncate text-xs text-white/60">
                                                {member.role === "owner" ? <Crown className="h-3 w-3" style={{ color: rarityColors.legendary }} aria-label="Dono" /> : <UserRound className="h-3 w-3" aria-hidden />}
                                                {member.name}
                                                {member.username ? ` · @${member.username}` : ""}
                                                {member.userId === userId ? " · você" : ""}
                                            </p>
                                        )}
                                        {member.kind === "opex" && member.opex && <OpexStatusLine member={member} campaignId={campaign.id} isOwner={isOwner} open={campaign.inviteOpen} retrying={opexActions.retryInterview.isPending} onRetry={() => opexActions.retryInterview.mutate(member.id)} />}
                                    </div>
                                    {member.character && <InterviewChip status={member.character.interviewStatus} />}
                                    {member.character?.interviewStatus === "done" && (
                                        <Button size="sm" variant="ghost" onClick={() => setViewing({ character: member.character!, playerName: member.name, own: member.id === campaign.myMemberId })}>
                                            <ScrollText aria-hidden /> Ver perfil
                                        </Button>
                                    )}
                                    {(member.character?.portraitStatus === "pending" || member.character?.portraitStatus === "generating") && (
                                        <span className="inline-flex items-center gap-1 text-xs text-white/60" data-testid="portrait-generating">
                                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Gerando retrato…
                                        </span>
                                    )}
                                    {isOwner && member.kind === "opex" && campaign.inviteOpen && member.character?.interviewStatus === "done" && !member.character.portraitUrl && (member.character.portraitStatus === "failed" || member.character.portraitStatus === null) && (
                                        <Button size="sm" variant="ghost" onClick={() => opexActions.retryPortrait.mutate(member.id)} disabled={opexActions.retryPortrait.isPending}>
                                            {opexActions.retryPortrait.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
                                            {member.character.portraitStatus === "failed" ? "Gerar retrato de novo" : "Gerar retrato"}
                                        </Button>
                                    )}
                                    {member.id === campaign.myMemberId && campaign.inviteOpen && member.character?.interviewStatus === "done" && !member.character.portraitUrl && (member.character.portraitStatus === "failed" || member.character.portraitStatus === null) && (
                                        <Button size="sm" variant="ghost" onClick={() => retryPortrait.mutate()} disabled={retryPortrait.isPending} title={member.character.portraitStatus === "failed" ? "A geração do retrato falhou" : undefined}>
                                            {retryPortrait.isPending ? <Loader2 className="animate-spin" aria-hidden /> : member.character.portraitStatus === "failed" ? <RefreshCw aria-hidden /> : <ImageOff aria-hidden />}
                                            {member.character.portraitStatus === "failed" ? "Gerar retrato de novo" : "Gerar retrato"}
                                        </Button>
                                    )}
                                    {member.id === campaign.myMemberId && campaign.inviteOpen && member.character?.interviewStatus !== "done" && (
                                        scenarioDone ? (
                                            <Button size="sm" asChild>
                                                <Link href={`/campanhas/${campaign.id}/entrevista/personagem`}>
                                                    {member.character ? <MessageCircle aria-hidden /> : <UserRound aria-hidden />} {member.character ? "Entrevista do personagem" : "Criar personagem"}
                                                </Link>
                                            </Button>
                                        ) : (
                                            <Button size="sm" disabled title="Disponível depois que o cenário estiver pronto">
                                                {member.character ? <MessageCircle aria-hidden /> : <UserRound aria-hidden />} {member.character ? "Entrevista do personagem" : "Criar personagem"}
                                            </Button>
                                        )
                                    )}
                                    {isOwner && member.role !== "owner" && (
                                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setRemoving(member)} aria-label={`Remover ${member.name}`}>
                                            <UserMinus aria-hidden /> Remover
                                        </Button>
                                    )}
                                </motion.li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>

                {isOwner ? (
                    <InvitePanel campaignId={campaign.id} open={campaign.inviteOpen} />
                ) : (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Convites</CardTitle>
                            <CardDescription>Só o dono ({campaign.ownerName}) pode compartilhar o link de convite desta campanha.</CardDescription>
                        </CardHeader>
                    </Card>
                )}
            </div>

            {isOwner && <EditCampaignDialog campaign={campaign} open={editing} onOpenChange={setEditing} />}
            {canAddOpex && <AddOpexDialog campaignId={campaign.id} open={addingOpex} onOpenChange={setAddingOpex} />}
            <CharacterProfileDialog character={viewing?.character ?? null} playerName={viewing?.playerName ?? ""} own={viewing?.own ?? false} color={color} onOpenChange={(open) => !open && setViewing(null)} />
            <ConfirmDialog
                open={removing !== null}
                onOpenChange={(open) => !open && setRemoving(null)}
                title={removing?.kind === "opex" ? `Remover ${removing.character?.name || "o Personagem Opex"}?` : `Remover ${removing?.name ?? "jogador"}?`}
                description={removing?.kind === "opex" ? "O Personagem Opex sai da campanha e deixa de jogar. As memórias individuais dele são arquivadas." : "O jogador sai da campanha e não poderá voltar pelo link de convite."}
                confirmLabel="Remover"
                variant="destructive"
                pending={remove.isPending}
                onConfirm={() => removing && remove.mutate(removing.id, { onSettled: () => setRemoving(null) })}
            />
            <ConfirmDialog
                open={starting}
                onOpenChange={setStarting}
                title="Iniciar a campanha?"
                description={`O Maddox abre a história no turno 1. Jogam ${ready} participante(s) pronto(s); quem concluir a entrevista depois entra a partir do próximo turno.`}
                confirmLabel="Iniciar campanha"
                pending={start.isPending}
                onConfirm={() => start.mutate(undefined, { onSuccess: () => router.push(`/campanhas/${campaign.id}/mesa`), onSettled: () => setStarting(false) })}
            />
            {campaign.canReset === true && (
                <ConfirmDialog
                    open={confirmingReset}
                    onOpenChange={setConfirmingReset}
                    title={MADDOX_RESET_TEXTS.dialogTitle}
                    description={MADDOX_RESET_TEXTS.dialogBody}
                    confirmLabel={MADDOX_RESET_TEXTS.button}
                    cancelLabel={MADDOX_RESET_TEXTS.cancel}
                    variant="destructive"
                    pending={reset.isPending}
                    onConfirm={() => reset.mutate(undefined, { onSettled: () => setConfirmingReset(false) })}
                />
            )}
            <ConfirmDialog
                open={leaving}
                onOpenChange={setLeaving}
                title="Sair da campanha?"
                description="Você deixa de ver a campanha. Para voltar, precisará do link de convite."
                confirmLabel="Sair"
                variant="destructive"
                pending={remove.isPending}
                onConfirm={() => remove.mutate(campaign.myMemberId, { onSuccess: () => router.push("/campanhas"), onSettled: () => setLeaving(false) })}
            />
        </motion.div>
    )
}

/**
 * Aviso "O dono reiniciou a campanha." vindo da mesa (`?aviso=reiniciada`, DND-50): mostrado uma vez e tirado da URL
 * (sem nova navegação). A tela da campanha só monta a visão no cliente, depois da leitura.
 */
function useResetNotice(): boolean {
    const [shown] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get(MADDOX_RESET_NOTICE_PARAM) === MADDOX_RESET_NOTICE_VALUE)
    useEffect(() => {
        if (!shown) return
        const url = new URL(window.location.href)
        url.searchParams.delete(MADDOX_RESET_NOTICE_PARAM)
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
    }, [shown])
    return shown
}

/** Situação do Personagem Opex no lobby (DND-26): entrevistando, aguardando aprovação (link), falha com "Tentar de novo". */
function OpexStatusLine({ member, campaignId, isOwner, open, retrying, onRetry }: { member: MaddoxCampaignMemberDto; campaignId: string; isOwner: boolean; open: boolean; retrying: boolean; onRetry: () => void }) {
    const opex = member.opex!
    const href = `/campanhas/${campaignId}/entrevista/opex/${member.id}`
    if (opex.status === "ready") return null
    return (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" data-testid="opex-status" data-status={opex.status}>
            {opex.status === "interviewing" && (
                <span className="inline-flex items-center gap-1 text-white/60">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Entrevista com o Maddox em andamento…
                </span>
            )}
            {opex.status === "awaiting-approval" && (
                <span className="inline-flex items-center gap-1" style={{ color: rarityColors.legendary }}>
                    <Hourglass className="h-3 w-3" aria-hidden /> {isOwner ? "Aguardando sua aprovação" : "Aguardando o dono da campanha"}
                </span>
            )}
            {opex.status === "failed" && (
                <span className="inline-flex items-center gap-1 text-destructive">
                    <AlertTriangle className="h-3 w-3" aria-hidden /> {opex.error ?? "A entrevista do Personagem Opex parou."}
                </span>
            )}
            {isOwner && open && (
                <Link href={href} className="text-primary underline-offset-2 hover:underline">
                    {opex.status === "awaiting-approval" ? "Continuar" : "Ver conversa"}
                </Link>
            )}
            {isOwner && open && opex.status === "failed" && (
                <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={onRetry} disabled={retrying}>
                    {retrying ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} Tentar de novo
                </Button>
            )}
        </div>
    )
}
