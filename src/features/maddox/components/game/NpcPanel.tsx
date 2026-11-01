"use client"

import { UserRound } from "lucide-react"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import type { MaddoxGameNpcDto } from "../../game-types"
import { MemberAvatar } from "../campaigns/campaign-visuals"

/** NPCs que os jogadores conhecem: nome e foto (ou as iniciais). Os segredos do mestre nunca chegam aqui. */
export function NpcPanel({ npcs, color }: { npcs: MaddoxGameNpcDto[]; color: string }) {
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
                        {npcs.map((npc) => (
                            <li key={npc.id} className="flex min-w-0 items-center gap-2" data-testid={`npc-${npc.id}`}>
                                <MemberAvatar name={npc.name} imageUrl={npc.portraitUrl} color={color} className="h-8 w-8 shrink-0" />
                                <span className="min-w-0 whitespace-normal break-words text-sm text-white">{npc.name}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    )
}
