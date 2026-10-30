"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Plus, Swords } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { useAuth } from "@/core/hooks/useAuth"
import { useMaddoxCampaigns, useMaddoxCampaignsRealtime } from "../../hooks/useMaddoxCampaigns"
import { CampaignCard } from "./CampaignCard"
import { CreateCampaignDialog } from "./CreateCampaignDialog"

/** `/campanhas`: campanhas em que o usuário é dono ou participante, uma por linha. */
export function CampaignsPage() {
    const router = useRouter()
    const { userId } = useAuth()
    const [creating, setCreating] = useState(false)
    const campaigns = useMaddoxCampaigns()
    useMaddoxCampaignsRealtime(userId)

    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="flex items-center gap-2 text-xl font-bold text-white sm:text-2xl">
                        <Swords className="h-5 w-5 text-primary sm:h-6 sm:w-6" aria-hidden />
                        Campanhas Maddox
                    </h1>
                    <p className="mt-1 text-xs text-white/60 sm:text-sm">Campanhas narradas pelo Maddox em que você é dono ou participa.</p>
                </div>
                <Button onClick={() => setCreating(true)}>
                    <Plus aria-hidden /> Nova campanha
                </Button>
            </div>

            {campaigns.isLoading ? (
                <div className="space-y-3" aria-busy="true" aria-label="Carregando campanhas">
                    {[0, 1, 2].map((item) => (
                        <Skeleton key={item} className="h-36 w-full rounded-xl" />
                    ))}
                </div>
            ) : campaigns.isError ? (
                <ErrorState title="Não foi possível carregar suas campanhas" onRetry={() => void campaigns.refetch()} />
            ) : (campaigns.data ?? []).length === 0 ? (
                <EmptyState icon={Swords} title="Nenhuma campanha por aqui" description="Crie uma campanha ou peça o link de convite a quem já tem uma." actionLabel="Criar campanha" onAction={() => setCreating(true)} />
            ) : (
                <ul className="space-y-3">
                    {campaigns.data!.map((campaign, index) => (
                        <CampaignCard key={campaign.id} campaign={campaign} index={index} />
                    ))}
                </ul>
            )}

            <CreateCampaignDialog
                open={creating}
                onOpenChange={setCreating}
                onCreated={(campaign) => {
                    setCreating(false)
                    router.push(`/campanhas/${campaign.id}`)
                }}
            />
        </motion.div>
    )
}
