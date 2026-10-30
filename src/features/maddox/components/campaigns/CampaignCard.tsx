"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Crown, Swords, UserRound, Users } from "lucide-react"
import { rarityColors } from "@/lib/config/colors"
import type { MaddoxCampaignListItemDto } from "../../campaign-types"
import { MemberAvatar, RarityChip, RigorChip, StatusChip, rigorColor } from "./campaign-visuals"

const VISIBLE_AVATARS = 5

/** Card largo (um por linha) de uma campanha: capa, rigor e status em cores de raridade, membros e personagem. */
export function CampaignCard({ campaign, index = 0 }: { campaign: MaddoxCampaignListItemDto; index?: number }) {
    const color = rigorColor(campaign.rigor)
    const extra = campaign.members.length - VISIBLE_AVATARS
    return (
        <motion.li initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: Math.min(index, 8) * 0.04 }} className="list-none">
            <Link
                href={`/campanhas/${campaign.id}`}
                aria-label={`Abrir a campanha ${campaign.name}`}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:flex-row"
                style={{ boxShadow: `inset 3px 0 0 ${color}` }}
            >
                <div
                    className="relative flex h-28 shrink-0 items-center justify-center sm:h-auto sm:w-44"
                    style={{ background: campaign.coverUrl ? undefined : `radial-gradient(circle at 30% 20%, ${color}55, transparent 70%), linear-gradient(135deg, ${color}26, transparent)` }}
                >
                    {campaign.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={campaign.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                        <Swords className="h-10 w-10 opacity-80 transition-transform group-hover:scale-110" style={{ color }} aria-hidden />
                    )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                            <h2 className="truncate text-lg font-semibold text-white">{campaign.name}</h2>
                            <p className="text-xs text-white/60">
                                Mestre: Maddox · criada por {campaign.ownerName}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <RigorChip rigor={campaign.rigor} />
                            <StatusChip status={campaign.status} />
                            <RarityChip color={campaign.myRole === "owner" ? rarityColors.legendary : rarityColors.veryRare}>
                                {campaign.myRole === "owner" ? <Crown className="h-3 w-3" aria-hidden /> : <UserRound className="h-3 w-3" aria-hidden />}
                                {campaign.myRole === "owner" ? "Dono" : "Jogador"}
                            </RarityChip>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm text-white/70">
                            {campaign.myCharacter ? (
                                <>
                                    <MemberAvatar name={campaign.myCharacter.name} imageUrl={campaign.myCharacter.portraitUrl} color={color} className="h-7 w-7" />
                                    <span>
                                        Seu personagem: <span className="font-medium text-white">{campaign.myCharacter.name}</span>
                                    </span>
                                </>
                            ) : (
                                <span className="text-white/50">Você ainda não criou seu personagem</span>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex -space-x-2" aria-label={`${campaign.members.length} participante(s)`}>
                                {campaign.members.slice(0, VISIBLE_AVATARS).map((member) => (
                                    <MemberAvatar key={member.id} name={member.character?.name ?? member.name} imageUrl={member.character?.portraitUrl ?? member.avatarUrl} />
                                ))}
                                {extra > 0 && <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-white/10 text-[11px] text-white/80">+{extra}</span>}
                            </div>
                            <span className="flex items-center gap-1 text-xs text-white/60">
                                <Users className="h-3.5 w-3.5" aria-hidden /> {campaign.members.length}
                            </span>
                        </div>
                    </div>

                    <p className="text-[11px] text-white/40">
                        Atualizada {formatDistanceToNow(new Date(campaign.updatedAt), { addSuffix: true, locale: ptBR })}
                        {campaign.turnNumber > 0 ? ` · turno ${campaign.turnNumber}` : ""}
                    </p>
                </div>
            </Link>
        </motion.li>
    )
}
