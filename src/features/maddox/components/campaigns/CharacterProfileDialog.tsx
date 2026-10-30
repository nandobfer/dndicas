"use client"

import Link from "next/link"
import { ScrollText, UserRound } from "lucide-react"
import { Markdown } from "@/components/ui/opex/markdown"
import { GlassModal, GlassModalContent, GlassModalDescription, GlassModalHeader, GlassModalTitle } from "@/components/ui/glass-modal"
import { MADDOX_PROFILE_SECTIONS } from "../../constants"
import type { MaddoxCampaignCharacterDto } from "../../campaign-types"
import { MemberAvatar } from "./campaign-visuals"

/** Perfil narrativo consolidado pela entrevista de personagem e, quando houver, o link da ficha D&D. */
export function CharacterProfileDialog({ character, playerName, color, own, onOpenChange }: { character: MaddoxCampaignCharacterDto | null; playerName: string; color: string; own: boolean; onOpenChange: (open: boolean) => void }) {
    return (
        <GlassModal open={character !== null} onOpenChange={onOpenChange}>
            <GlassModalContent size="lg">
                {character && (
                    <div className="space-y-5">
                        <GlassModalHeader>
                            <GlassModalTitle className="flex items-center gap-3">
                                <MemberAvatar name={character.name} imageUrl={character.portraitUrl} color={color} className="h-12 w-12" />
                                <span className="truncate">{character.name}</span>
                            </GlassModalTitle>
                            <GlassModalDescription className="flex items-center gap-1">
                                <UserRound className="h-3 w-3" aria-hidden /> Personagem de {playerName}
                            </GlassModalDescription>
                        </GlassModalHeader>
                        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
                            {MADDOX_PROFILE_SECTIONS.map((item) =>
                                character.profile[item.key] ? (
                                    <section key={item.key} className="space-y-1">
                                        <h3 className="text-sm font-semibold" style={{ color }}>
                                            {item.label}
                                        </h3>
                                        <Markdown lineAction={null}>{character.profile[item.key]!}</Markdown>
                                    </section>
                                ) : null,
                            )}
                        </div>
                        {own && character.sheetSlug && (
                            <Link href={`/sheets/${character.sheetSlug}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                                <ScrollText className="h-4 w-4" aria-hidden /> Abrir ficha do D&D
                            </Link>
                        )}
                    </div>
                )}
            </GlassModalContent>
        </GlassModal>
    )
}
