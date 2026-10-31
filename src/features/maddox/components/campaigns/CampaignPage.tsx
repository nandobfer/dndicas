"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowLeft, CheckCircle2, Crown, DoorOpen, Hourglass, MessageCircle, Pencil, ScrollText, Swords, UserMinus, UserRound, Users } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { ConfirmDialog } from "@/components/ui/opex/confirm-dialog"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { EmptyState } from "@/components/feedback/EmptyState"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardDescription as CardDescription, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import { useAuth } from "@/core/hooks/useAuth"
import { MADDOX_RIGOR_LEVEL_DEFS } from "../../constants"
import type { MaddoxCampaignCharacterDto, MaddoxCampaignDetailDto, MaddoxCampaignMemberDto } from "../../campaign-types"
import { useMaddoxCampaign, useMaddoxCampaignsRealtime, useRemoveMaddoxMember } from "../../hooks/useMaddoxCampaigns"
import { CharacterDraftDialog } from "./CharacterDraftDialog"
import { EditCampaignDialog } from "./EditCampaignDialog"
import { InvitePanel } from "./InvitePanel"
import { CharacterProfileDialog } from "./CharacterProfileDialog"
import { ScenarioCard } from "./ScenarioCard"
import { InterviewChip, MemberAvatar, RarityChip, RigorChip, StatusChip, rigorColor } from "./campaign-visuals"
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
    const [editing, setEditing] = useState(false)
    const [characterOpen, setCharacterOpen] = useState(false)
    const [removing, setRemoving] = useState<MaddoxCampaignMemberDto | null>(null)
    const [leaving, setLeaving] = useState(false)
    const [viewing, setViewing] = useState<{ character: MaddoxCampaignCharacterDto; playerName: string; own: boolean } | null>(null)
    const ready = campaign.members.filter((member) => member.ready).length
    const scenarioDone = campaign.scenarioStatus === "done"

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
                            <StatusChip status={campaign.status} />
                            <RarityChip color={isOwner ? rarityColors.legendary : rarityColors.veryRare}>{isOwner ? "Você é o dono" : "Você é jogador"}</RarityChip>
                        </div>
                        <p className="text-sm text-white/60">{MADDOX_RIGOR_LEVEL_DEFS[campaign.rigor].description}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
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

            {(campaign.status === "lobby" || campaign.status === "interview") && (
                <p className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-white/70">
                    <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    {scenarioDone
                        ? `Lobby: ${ready} de ${campaign.members.length} participante(s) prontos para jogar. Só entra no jogo quem concluir a entrevista de personagem com o Maddox.`
                        : "Preparação: o dono define o cenário com o Maddox. Enquanto isso, convide os jogadores e crie o seu personagem."}
                </p>
            )}

            <ScenarioCard campaign={campaign} />

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
                                    <MemberAvatar name={member.character?.name ?? member.name} imageUrl={member.character?.portraitUrl ?? member.avatarUrl} color={member.character ? color : undefined} className="h-11 w-11" />
                                    <div className="min-w-0 flex-1">
                                        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-white">
                                            {member.character ? member.character.name : <span className="text-white/50">Personagem ainda não criado</span>}
                                            {member.ready && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: rarityColors.legendary }} aria-label="Pronto para jogar" />}
                                        </p>
                                        <p className="flex items-center gap-1 truncate text-xs text-white/60">
                                            {member.role === "owner" ? <Crown className="h-3 w-3" style={{ color: rarityColors.legendary }} aria-label="Dono" /> : <UserRound className="h-3 w-3" aria-hidden />}
                                            {member.name}
                                            {member.username ? ` · @${member.username}` : ""}
                                            {member.userId === userId ? " · você" : ""}
                                        </p>
                                    </div>
                                    {member.character && <InterviewChip status={member.character.interviewStatus} />}
                                    {member.character?.interviewStatus === "done" && (
                                        <Button size="sm" variant="ghost" onClick={() => setViewing({ character: member.character!, playerName: member.name, own: member.id === campaign.myMemberId })}>
                                            <ScrollText aria-hidden /> Ver perfil
                                        </Button>
                                    )}
                                    {member.id === campaign.myMemberId && campaign.inviteOpen && member.character && member.character.interviewStatus !== "done" && (
                                        scenarioDone ? (
                                            <Button size="sm" asChild>
                                                <Link href={`/campanhas/${campaign.id}/entrevista/personagem`}>
                                                    <MessageCircle aria-hidden /> Entrevista do personagem
                                                </Link>
                                            </Button>
                                        ) : (
                                            <Button size="sm" disabled title="Disponível depois que o cenário estiver pronto">
                                                <MessageCircle aria-hidden /> Entrevista do personagem
                                            </Button>
                                        )
                                    )}
                                    {member.id === campaign.myMemberId && campaign.inviteOpen && (
                                        <Button size="sm" variant={member.character ? "ghost" : "default"} onClick={() => setCharacterOpen(true)}>
                                            {member.character ? <Pencil aria-hidden /> : <UserRound aria-hidden />} {member.character ? "Editar personagem" : "Criar personagem"}
                                        </Button>
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
            <CharacterProfileDialog character={viewing?.character ?? null} playerName={viewing?.playerName ?? ""} own={viewing?.own ?? false} color={color} onOpenChange={(open) => !open && setViewing(null)} />
            <CharacterDraftDialog campaignId={campaign.id} character={campaign.myCharacter} open={characterOpen} onOpenChange={setCharacterOpen} />
            <ConfirmDialog
                open={removing !== null}
                onOpenChange={(open) => !open && setRemoving(null)}
                title={`Remover ${removing?.name ?? "jogador"}?`}
                description="O jogador sai da campanha e não poderá voltar pelo link de convite."
                confirmLabel="Remover"
                variant="destructive"
                pending={remove.isPending}
                onConfirm={() => removing && remove.mutate(removing.id, { onSettled: () => setRemoving(null) })}
            />
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
