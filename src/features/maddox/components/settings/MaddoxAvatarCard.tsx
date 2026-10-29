"use client"

import { useWatch, type UseFormReturn } from "react-hook-form"
import { Loader2, RotateCcw, Sparkles } from "lucide-react"
import { GlassImageUploader } from "@/components/ui/glass-image-uploader"
import { Button } from "@/components/ui/opex/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/opex/card"
import { Field } from "@/components/ui/opex/field"
import { Textarea } from "@/components/ui/opex/textarea"
import type { AiFeatureAvailability } from "@/features/ai/types"
import { DEFAULT_MADDOX_PERSONA } from "../../constants"
import type { MaddoxSettings } from "../../schemas"
import { useGenerateMaddoxAvatar } from "../../hooks/useMaddoxSettings"

interface MaddoxAvatarCardProps {
    form: UseFormReturn<MaddoxSettings>
    /** Disponibilidade do Gerador de imagens (sem ele, "Gerar" fica desabilitado com o motivo). */
    imageGenerator?: AiFeatureAvailability
}

/**
 * Avatar do Maddox usado nas interações: upload/substituição (S3) ou geração pelo Gerador de imagens a
 * partir da persona (1:1, do peito para cima). Em ambos os casos só vale depois de salvar.
 */
export function MaddoxAvatarCard({ form, imageGenerator }: MaddoxAvatarCardProps) {
    const url = useWatch({ control: form.control, name: "avatar.url" })
    const persona = useWatch({ control: form.control, name: "avatar.persona" })
    const generate = useGenerateMaddoxAvatar()
    const blocked = imageGenerator && !imageGenerator.available ? imageGenerator.reason : null
    const setUrl = (value: string | null) => form.setValue("avatar.url", value, { shouldDirty: true, shouldValidate: true })

    const onGenerate = async () => {
        const result = await generate.mutateAsync(persona).catch(() => null)
        if (result) setUrl(result.url)
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Avatar</CardTitle>
                <CardDescription>Imagem do Maddox nas campanhas (narração, entrevistas). Envie uma imagem ou gere a personificação dele a partir do texto da persona. O novo avatar só vale depois de salvar.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6 sm:flex-row">
                <div className="w-full max-w-[220px] shrink-0 self-center sm:self-start">
                    <GlassImageUploader value={url ?? undefined} onChange={(value) => setUrl(value)} onRemove={() => setUrl(null)} enableAI={false} disabled={generate.isPending} aspectRatio="square" />
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                    <Field id="maddox-avatar-persona" label="Persona" error={form.formState.errors.avatar?.persona?.message}>
                        <Textarea id="maddox-avatar-persona" rows={6} {...form.register("avatar.persona")} placeholder="Descreva a aparência e o estilo do Maddox" />
                    </Field>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => form.setValue("avatar.persona", DEFAULT_MADDOX_PERSONA, { shouldDirty: true, shouldValidate: true })}>
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar padrão
                        </Button>
                        <Button type="button" size="sm" className="gap-1.5" disabled={generate.isPending || Boolean(blocked) || persona.trim().length < 3} title={blocked ?? undefined} onClick={() => void onGenerate()}>
                            {generate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
                            {generate.isPending ? "Gerando…" : "Gerar com o Gerador de imagens"}
                        </Button>
                    </div>
                    {blocked && <p className="text-xs text-muted-foreground">{blocked}</p>}
                </div>
            </CardContent>
        </Card>
    )
}
