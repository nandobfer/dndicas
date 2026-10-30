"use client"

import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, UserRound } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Field } from "@/components/ui/opex/field"
import { Input } from "@/components/ui/opex/input"
import { GlassImageUploader } from "@/components/ui/glass-image-uploader"
import { GlassModal, GlassModalContent, GlassModalDescription, GlassModalFooter, GlassModalHeader, GlassModalTitle } from "@/components/ui/glass-modal"
import { MADDOX_CHARACTER_NAME_MAX } from "../../constants"
import { maddoxCharacterDraftSchema, type MaddoxCharacterDraftInput } from "../../campaign-schemas"
import type { MaddoxCampaignCharacterDto } from "../../campaign-types"
import { useSaveMaddoxCharacterDraft } from "../../hooks/useMaddoxCampaigns"

/**
 * Esboço do personagem no lobby: nome e retrato. A entrevista de personagem com o Maddox completa a
 * história, a personalidade e (no modo fiel) a ficha.
 */
export function CharacterDraftDialog({ campaignId, character, open, onOpenChange }: { campaignId: string; character: MaddoxCampaignCharacterDto | null; open: boolean; onOpenChange: (open: boolean) => void }) {
    const initial = { name: character?.name ?? "", portraitUrl: character?.portraitUrl ?? null }
    const form = useForm<MaddoxCharacterDraftInput>({ resolver: zodResolver(maddoxCharacterDraftSchema), defaultValues: initial })
    const save = useSaveMaddoxCharacterDraft(campaignId)

    useEffect(() => {
        if (open) form.reset({ name: character?.name ?? "", portraitUrl: character?.portraitUrl ?? null })
    }, [open, character?.name, character?.portraitUrl, form])

    const submit = form.handleSubmit((values) => save.mutate({ name: values.name, portraitUrl: values.portraitUrl || null }, { onSuccess: () => onOpenChange(false) }))

    return (
        <GlassModal open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
            <GlassModalContent size="md">
                <form onSubmit={submit} className="space-y-5" noValidate>
                    <GlassModalHeader>
                        <GlassModalTitle className="flex items-center gap-2">
                            <UserRound className="h-5 w-5 text-primary" aria-hidden /> {character ? "Editar personagem" : "Criar personagem"}
                        </GlassModalTitle>
                        <GlassModalDescription>Dê um nome e, se quiser, um retrato. A história e os detalhes do personagem vêm na entrevista com o Maddox.</GlassModalDescription>
                    </GlassModalHeader>
                    <Field id="maddox-character-name" label="Nome do personagem" error={form.formState.errors.name?.message}>
                        <Input id="maddox-character-name" maxLength={MADDOX_CHARACTER_NAME_MAX} placeholder="Ex.: Lyra Ventobravo" autoFocus {...form.register("name")} />
                    </Field>
                    <Controller
                        control={form.control}
                        name="portraitUrl"
                        render={({ field }) => (
                            <Field id="maddox-character-portrait" label="Retrato (opcional)" error={form.formState.errors.portraitUrl?.message}>
                                <GlassImageUploader value={field.value ?? undefined} onChange={(url) => field.onChange(url)} onRemove={() => field.onChange(null)} aspectRatio="portrait" enableAI={false} disabled={save.isPending} className="mx-auto max-w-[220px]" />
                            </Field>
                        )}
                    />
                    <GlassModalFooter>
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={save.isPending}>
                            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                            Salvar personagem
                        </Button>
                    </GlassModalFooter>
                </form>
            </GlassModalContent>
        </GlassModal>
    )
}
