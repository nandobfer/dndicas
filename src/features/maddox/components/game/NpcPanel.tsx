"use client"

import Link from "next/link"
import { Loader2, Paintbrush, UserRound } from "lucide-react"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import { Button } from "@/components/ui/opex/button"
import type { MaddoxGameNpcDto } from "../../game-types"
import { cn } from "@/lib/utils"
import { MemberAvatar, OpexChip } from "../campaigns/campaign-visuals"
import { journalHref } from "../journal/journal-links"
import { OpexNpcActions } from "./OpexNpcActions"

/** Situação que aparece sob o nome (Maddox 6: o combate pode matar ou pôr NPCs em fuga). */
const NPC_STATUS_NOTES: Partial<Record<MaddoxGameNpcDto["status"], string>> = { dead: "Morto", unknown: "Paradeiro desconhecido" }

/** "Gerar retrato" (só o dono, Maddox 10). `null` = sem o botão. */
export interface NpcPortraitActions {
    canRequest: boolean
    /** NPC cujo pedido está sendo enviado. */
    requesting: string | null
    onRequest: (npcId: string) => void
}

/**
 * NPCs que os jogadores conhecem, um por linha (DND-43): nome e foto (ou as iniciais); cada um abre o NPC no Diário da campanha e o dono pede o
 * retrato (Maddox 10). NPC Opex ganha o chip para todos e o dono com a permissão promove ou remove (DND-27). Os segredos do
 * mestre nunca chegam aqui.
 */
export function NpcPanel({ npcs, color, campaignId, portraits = null, manageOpex = false }: { npcs: MaddoxGameNpcDto[]; color: string; campaignId: string; portraits?: NpcPortraitActions | null; manageOpex?: boolean }) {
    return (
        <Card className="h-fit">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <UserRound className="h-4 w-4 text-primary" aria-hidden /> NPCs conhecidos ({npcs.length})
                </CardTitle>
            </CardHeader>
            <CardContent>
                {npcs.length === 0 ? (
                    <p className="text-xs text-white/60">Ninguém ainda: os NPCs aparecem aqui quando o grupo os conhece.</p>
                ) : (
                    <ul className="flex flex-col gap-1.5" aria-label="NPCs conhecidos">
                        {npcs.map((npc) => {
                            const painting = Boolean(npc.portraitGenerating) || portraits?.requesting === npc.id
                            return (
                                <li key={npc.id} className={cn("flex min-w-0 items-center gap-2", npc.status === "dead" && "opacity-50")} data-testid={`npc-${npc.id}`} data-status={npc.status}>
                                    <Link
                                        href={journalHref(campaignId, { npcId: npc.id })}
                                        className="-m-1 flex min-w-0 flex-1 items-center gap-2 rounded-lg p-1 transition-colors hover:bg-white/[0.05]"
                                        title={`Ver ${npc.name} no diário`}
                                    >
                                        <span className="relative shrink-0">
                                            <MemberAvatar name={npc.name} imageUrl={npc.portraitUrl} color={color} className={cn("h-9 w-9 shrink-0", npc.status === "dead" && "grayscale")} />
                                            {painting && (
                                                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60" role="status" aria-label={`Pintando o retrato de ${npc.name}`}>
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-white" aria-hidden />
                                                </span>
                                            )}
                                        </span>
                                        <span className="min-w-0 whitespace-normal break-words text-sm text-white">
                                            {npc.name}
                                            {npc.opex && <OpexChip className="ml-1 align-middle" />}
                                            {NPC_STATUS_NOTES[npc.status] && <span className="block text-[11px] text-white/60">{NPC_STATUS_NOTES[npc.status]}</span>}
                                        </span>
                                    </Link>
                                    {manageOpex && <OpexNpcActions campaignId={campaignId} npc={npc} />}
                                    {portraits && (
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            className="h-7 w-7 shrink-0"
                                            disabled={!portraits.canRequest || painting}
                                            onClick={() => portraits.onRequest(npc.id)}
                                            aria-label={npc.portraitUrl ? `Gerar novo retrato de ${npc.name}` : `Gerar retrato de ${npc.name}`}
                                            title={npc.portraitUrl ? "Gerar novo retrato" : "Gerar retrato"}
                                        >
                                            <Paintbrush className="h-3.5 w-3.5" aria-hidden />
                                        </Button>
                                    )}
                                </li>
                            )
                        })}
                    </ul>
                )}
            </CardContent>
        </Card>
    )
}
