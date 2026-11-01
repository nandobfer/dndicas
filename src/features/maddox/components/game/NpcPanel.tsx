"use client"

import { Loader2, Paintbrush, UserRound } from "lucide-react"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import { Button } from "@/components/ui/opex/button"
import type { MaddoxGameNpcDto } from "../../game-types"
import { cn } from "@/lib/utils"
import { MemberAvatar } from "../campaigns/campaign-visuals"

/** Situação que aparece sob o nome (Maddox 6: o combate pode matar ou pôr NPCs em fuga). */
const NPC_STATUS_NOTES: Partial<Record<MaddoxGameNpcDto["status"], string>> = { dead: "Morto", unknown: "Paradeiro desconhecido" }

/** "Gerar retrato" (só o dono, Maddox 10). `null` = sem o botão. */
export interface NpcPortraitActions {
    canRequest: boolean
    /** NPC cujo pedido está sendo enviado. */
    requesting: string | null
    onRequest: (npcId: string) => void
}

/** NPCs que os jogadores conhecem: nome e retrato (ou as iniciais). Os segredos do mestre nunca chegam aqui. */
export function NpcPanel({ npcs, color, portraits = null }: { npcs: MaddoxGameNpcDto[]; color: string; portraits?: NpcPortraitActions | null }) {
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
                    <ul className="grid grid-cols-2 gap-2.5" aria-label="NPCs conhecidos">
                        {npcs.map((npc) => {
                            const painting = Boolean(npc.portraitGenerating) || portraits?.requesting === npc.id
                            return (
                                <li key={npc.id} className={cn("flex min-w-0 items-center gap-2", npc.status === "dead" && "opacity-50")} data-testid={`npc-${npc.id}`} data-status={npc.status}>
                                    <span className="relative shrink-0">
                                        <MemberAvatar name={npc.name} imageUrl={npc.portraitUrl} color={color} className={cn("h-8 w-8 shrink-0", npc.status === "dead" && "grayscale")} />
                                        {painting && (
                                            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60" role="status" aria-label={`Pintando o retrato de ${npc.name}`}>
                                                <Loader2 className="h-3.5 w-3.5 animate-spin text-white" aria-hidden />
                                            </span>
                                        )}
                                    </span>
                                    <span className="min-w-0 flex-1 whitespace-normal break-words text-sm text-white">
                                        {npc.name}
                                        {NPC_STATUS_NOTES[npc.status] && <span className="block text-[11px] text-white/60">{NPC_STATUS_NOTES[npc.status]}</span>}
                                    </span>
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
