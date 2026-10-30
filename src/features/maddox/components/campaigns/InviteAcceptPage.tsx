"use client"

import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Loader2, LogIn, Swords, Users } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { apiErrorMessage } from "@/lib/api"
import { MADDOX_RIGOR_LEVEL_DEFS } from "../../constants"
import { useJoinMaddoxCampaign, useMaddoxInvitePreview } from "../../hooks/useMaddoxCampaigns"
import { RigorChip, StatusChip, rigorColor } from "./campaign-visuals"

/** `/campanhas/convite/[token]`: resumo da campanha e "Entrar na campanha". */
export function InviteAcceptPage({ token }: { token: string }) {
    const router = useRouter()
    const preview = useMaddoxInvitePreview(token)
    const join = useJoinMaddoxCampaign(token)

    if (preview.isLoading) return <Skeleton className="mx-auto h-72 w-full max-w-xl rounded-xl" aria-label="Carregando convite" />
    if (preview.isError || !preview.data) {
        return <EmptyState icon={Swords} title="Convite indisponível" description={apiErrorMessage(preview.error, "Convite inválido ou expirado. Peça um link novo ao dono da campanha.")} actionLabel="Ver minhas campanhas" onAction={() => router.push("/campanhas")} />
    }
    const invite = preview.data
    const color = rigorColor(invite.rigor)
    const open = () => router.push(`/campanhas/${invite.campaignId}`)

    return (
        <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto w-full max-w-xl space-y-5 rounded-xl border border-white/10 p-6 text-center"
            style={{ background: `radial-gradient(circle at 50% 0%, ${color}40, transparent 65%)` }}
        >
            <Swords className="mx-auto h-10 w-10" style={{ color }} aria-hidden />
            <div className="space-y-1">
                <p className="text-sm text-white/60">{invite.ownerName} convidou você para a campanha</p>
                <h1 className="text-2xl font-bold text-white">{invite.name}</h1>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
                <RigorChip rigor={invite.rigor} />
                <StatusChip status={invite.status} />
                <span className="flex items-center gap-1 text-xs text-white/60">
                    <Users className="h-3.5 w-3.5" aria-hidden /> {invite.memberCount} participante(s)
                </span>
            </div>
            <p className="text-sm text-white/70">{MADDOX_RIGOR_LEVEL_DEFS[invite.rigor].description}</p>
            {invite.alreadyMember ? (
                <Button onClick={open}>Você já participa: abrir campanha</Button>
            ) : !invite.inviteOpen ? (
                <p role="alert" className="text-sm text-amber-300">
                    Esta campanha não aceita novos jogadores.
                </p>
            ) : (
                <>
                    <Button onClick={() => join.mutate(undefined, { onSuccess: ({ campaignId }) => router.push(`/campanhas/${campaignId}`) })} disabled={join.isPending}>
                        {join.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <LogIn aria-hidden />} Entrar na campanha
                    </Button>
                    {invite.status !== "lobby" && <p className="text-xs text-white/50">A campanha já começou: depois de entrar, você faz a entrevista de personagem e o Maddox apresenta seu personagem à mesa.</p>}
                </>
            )}
        </motion.section>
    )
}
