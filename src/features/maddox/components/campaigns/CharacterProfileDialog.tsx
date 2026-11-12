"use client"

import Link from "next/link"
import { ScrollText, UserRound } from "lucide-react"
import { Markdown } from "@/components/ui/opex/markdown"
import { GlassModal, GlassModalContent, GlassModalDescription, GlassModalHeader, GlassModalTitle } from "@/components/ui/glass-modal"
import { MADDOX_PROFILE_SECTIONS, MADDOX_AVATAR_CONTEXT } from "../../constants"
import type { MaddoxCampaignCharacterDto } from "../../campaign-types"
import { MemberAvatar } from "./campaign-visuals"

/** Seções do perfil narrativo (as vazias ficam de fora); também usadas na aba Grupo do Diário da campanha. */
export function CharacterProfileSections({ profile, color }: { profile: Record<string, string>; color: string }) {
    return (
        <>
            {MADDOX_PROFILE_SECTIONS.map((item) =>
                profile[item.key] ? (
                    <section key={item.key} className="space-y-1">
                        <h3 className="text-sm font-semibold" style={{ color }}>
                            {item.label}
                        </h3>
                        <Markdown lineAction={null}>{profile[item.key]!}</Markdown>
                    </section>
                ) : null,
            )}
        </>
    )
}

/** Perfil narrativo consolidado pela entrevista de personagem e, quando houver, o link da ficha D&D. */
export function CharacterProfileDialog({ character, playerName, color, own, onOpenChange }: { character: MaddoxCampaignCharacterDto | null; playerName: string; color: string; own: boolean; onOpenChange: (open: boolean) => void }) {
    return (
        <GlassModal open={character !== null} onOpenChange={onOpenChange}>
            <GlassModalContent size="lg">
                {character && (
                    <div className="space-y-5">
                        {/* O avatar é um botão (retrato grande, DND-55): fica ao lado do título, fora dele, para não entrar no nome do diálogo. */}
                        <GlassModalHeader className="flex-row items-center gap-3 space-y-0">
                            <MemberAvatar name={character.name} imageUrl={character.portraitUrl} color={color} context={own ? MADDOX_AVATAR_CONTEXT.mine : `Personagem de ${playerName}`} className="h-12 w-12" />
                            <div className="min-w-0 flex-1 space-y-1.5">
                                <GlassModalTitle className="truncate">{character.name}</GlassModalTitle>
                                <GlassModalDescription className="flex items-center gap-1">
                                    <UserRound className="h-3 w-3" aria-hidden /> Personagem de {playerName}
                                </GlassModalDescription>
                            </div>
                        </GlassModalHeader>
                        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
                            <CharacterProfileSections profile={character.profile} color={color} />
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
