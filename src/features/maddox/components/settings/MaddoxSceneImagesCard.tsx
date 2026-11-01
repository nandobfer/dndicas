"use client"

import { Controller, useFieldArray, useWatch, type UseFormReturn } from "react-hook-form"
import { Info, Plus, Trash2 } from "lucide-react"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardDescription as CardDescription, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import { GlassSelector } from "@/components/ui/glass-selector"
import { Button } from "@/components/ui/opex/button"
import { Field } from "@/components/ui/opex/field"
import { Input } from "@/components/ui/opex/input"
import { Switch } from "@/components/ui/opex/switch"
import { Textarea } from "@/components/ui/opex/textarea"
import { FormToggleCard, ToggleRow } from "@/components/ui/opex/toggle-card"
import { IMAGE_ASPECT_RATIOS, type ImageAspectRatio } from "@/features/ai/constants"
import type { ImageGeneratorSettingsDto } from "@/features/ai/types"
import { imageModelSupportsReferences, isAiImageProviderId } from "@/lib/ai/providers"
import {
    MADDOX_SCENE_IMAGE_CUSTOM_DESCRIPTION_MAX,
    MADDOX_SCENE_IMAGE_CUSTOM_LABEL_MAX,
    MADDOX_SCENE_IMAGE_CUSTOM_MAX,
    MADDOX_SCENE_IMAGE_DAILY_MAX,
    MADDOX_SCENE_IMAGE_GAP_MAX,
    MADDOX_SCENE_IMAGE_SITUATION_DEFS,
    MADDOX_SCENE_IMAGE_SITUATIONS,
    MADDOX_SCENE_IMAGE_STYLE_MAX,
} from "../../constants"
import type { MaddoxSettings } from "../../schemas"

const toInt = (value: string) => (value.trim() === "" ? Number.NaN : Number.parseInt(value, 10))
const newId = () => `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** Aviso do Gerador de imagens (indisponível ou sem imagens de referência no modelo escolhido). */
export function sceneImagesGeneratorNotice(generator: ImageGeneratorSettingsDto | undefined): string | null {
    if (!generator) return null
    if (!generator.availability.available) return `${generator.availability.reason ?? "O Gerador de imagens não está disponível."} As imagens só são geradas depois que ele estiver configurado.`
    const provider = generator.settings?.provider
    const model = generator.settings?.model
    if (provider && model && isAiImageProviderId(provider) && !imageModelSupportsReferences(provider, model)) {
        return `O modelo do Gerador de imagens (${model}) não aceita imagens de referência: a aparência de personagens e NPCs entra só pelos dados (perfil, ficha e descrição).`
    }
    return null
}

/**
 * Seção "Imagens" da aba do Maddox (Maddox 10): chave geral, situações fixas e personalizadas, frequência (intervalo em
 * turnos do mestre e teto por campanha em 24 h), proporção e estilo. Faz parte do formulário único da aba.
 */
export function MaddoxSceneImagesCard({ form, generator }: { form: UseFormReturn<MaddoxSettings>; generator: ImageGeneratorSettingsDto | undefined }) {
    const custom = useFieldArray({ control: form.control, name: "sceneImages.custom", keyName: "fieldKey" })
    const aspectRatio = useWatch({ control: form.control, name: "sceneImages.aspectRatio" })
    const errors = form.formState.errors.sceneImages
    const notice = sceneImagesGeneratorNotice(generator)
    return (
        <>
            <Card>
                <CardContent className="space-y-3 pt-6">
                    <FormToggleCard<MaddoxSettings>
                        control={form.control}
                        name="sceneImages.enabled"
                        id="maddox-scene-images-enabled"
                        label="Imagens nas cenas"
                        description="O Maddox ilustra as situações marcadas abaixo com o Gerador de imagens. Personagens, NPCs e entidades do catálogo entram com a aparência cadastrada. Cada campanha pode desligar as automáticas; o dono sempre pode pedir uma imagem na mesa."
                        onLabel="Ligadas"
                        offLabel="Desligadas"
                    />
                    {notice && (
                        <p className="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground" data-testid="scene-images-notice">
                            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {notice}
                        </p>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Situações</CardTitle>
                    <CardDescription>Só as situações ativas geram imagem. O fim de batalha usa a cena final do combate; o retrato de NPC vale para NPCs importantes que os jogadores conhecem.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {MADDOX_SCENE_IMAGE_SITUATIONS.map((situation) => (
                        <ToggleRow
                            key={situation}
                            id={`maddox-scene-${situation}`}
                            label={MADDOX_SCENE_IMAGE_SITUATION_DEFS[situation].label}
                            description={MADDOX_SCENE_IMAGE_SITUATION_DEFS[situation].description}
                            right={
                                <Controller
                                    control={form.control}
                                    name={`sceneImages.situations.${situation}`}
                                    render={({ field }) => <Switch id={`maddox-scene-${situation}`} checked={Boolean(field.value)} onCheckedChange={field.onChange} aria-label={MADDOX_SCENE_IMAGE_SITUATION_DEFS[situation].label} />}
                                />
                            }
                        />
                    ))}

                    <div className="space-y-3 border-t pt-4" data-testid="scene-images-custom">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold">Situações personalizadas ({custom.fields.length}/{MADDOX_SCENE_IMAGE_CUSTOM_MAX})</p>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="gap-1.5"
                                disabled={custom.fields.length >= MADDOX_SCENE_IMAGE_CUSTOM_MAX}
                                onClick={() => custom.append({ id: newId(), label: "", description: "", active: true })}
                            >
                                <Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar situação
                            </Button>
                        </div>
                        {custom.fields.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma. Ex.: &quot;Ritual mágico&quot; — quando um ritual ou feitiço grandioso acontece diante do grupo.</p>}
                        {custom.fields.map((item, index) => {
                            const itemErrors = errors?.custom?.[index]
                            return (
                                <div key={item.fieldKey} className="space-y-3 rounded-xl border bg-muted/40 p-3" data-testid="scene-images-custom-item">
                                    <div className="flex items-start gap-3">
                                        <Field id={`maddox-scene-custom-${index}-label`} label="Nome" error={itemErrors?.label?.message} className="flex-1 space-y-1.5">
                                            <Input id={`maddox-scene-custom-${index}-label`} maxLength={MADDOX_SCENE_IMAGE_CUSTOM_LABEL_MAX} {...form.register(`sceneImages.custom.${index}.label`)} />
                                        </Field>
                                        <div className="flex items-center gap-2 pt-7">
                                            <Controller
                                                control={form.control}
                                                name={`sceneImages.custom.${index}.active`}
                                                render={({ field }) => <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} aria-label={`Situação ${index + 1} ativa`} />}
                                            />
                                            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => custom.remove(index)} aria-label={`Remover situação ${index + 1}`}>
                                                <Trash2 className="h-4 w-4" aria-hidden />
                                            </Button>
                                        </div>
                                    </div>
                                    <Field id={`maddox-scene-custom-${index}-description`} label="Quando acontece" error={itemErrors?.description?.message}>
                                        <Textarea id={`maddox-scene-custom-${index}-description`} rows={2} maxLength={MADDOX_SCENE_IMAGE_CUSTOM_DESCRIPTION_MAX} {...form.register(`sceneImages.custom.${index}.description`)} />
                                    </Field>
                                </div>
                            )
                        })}
                        {errors?.custom?.root?.message && <p className="text-xs text-destructive">{errors.custom.root.message}</p>}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Frequência e estilo</CardTitle>
                    <CardDescription>As imagens automáticas respeitam o intervalo e no máximo uma por narração; todas (inclusive as pedidas pelo dono e os retratos) contam no teto do dia.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field id="maddox-scene-gap" label="Intervalo mínimo (turnos do mestre)" error={errors?.minNarrationsBetween?.message}>
                            <Controller
                                control={form.control}
                                name="sceneImages.minNarrationsBetween"
                                render={({ field }) => <Input id="maddox-scene-gap" type="number" min={0} max={MADDOX_SCENE_IMAGE_GAP_MAX} step={1} value={Number.isNaN(field.value) ? "" : field.value} onChange={(event) => field.onChange(toInt(event.target.value))} />}
                            />
                        </Field>
                        <Field id="maddox-scene-daily" label="Máximo por campanha em 24 h" error={errors?.maxPerDay?.message}>
                            <Controller
                                control={form.control}
                                name="sceneImages.maxPerDay"
                                render={({ field }) => <Input id="maddox-scene-daily" type="number" min={1} max={MADDOX_SCENE_IMAGE_DAILY_MAX} step={1} value={Number.isNaN(field.value) ? "" : field.value} onChange={(event) => field.onChange(toInt(event.target.value))} />}
                            />
                        </Field>
                    </div>
                    <div className="space-y-2">
                        <p className="text-sm font-medium">Proporção das cenas</p>
                        <GlassSelector<ImageAspectRatio>
                            value={aspectRatio}
                            onChange={(value) => form.setValue("sceneImages.aspectRatio", value as ImageAspectRatio, { shouldDirty: true, shouldValidate: true })}
                            options={IMAGE_ASPECT_RATIOS.map((ratio) => ({ value: ratio, label: ratio }))}
                            size="sm"
                            layoutId="maddox-scene-aspect"
                        />
                        <p className="text-xs text-muted-foreground">Retratos de NPC são sempre 1:1.</p>
                    </div>
                    <Field id="maddox-scene-style" label="Estilo visual (opcional)" error={errors?.style?.message}>
                        <Textarea id="maddox-scene-style" rows={3} maxLength={MADDOX_SCENE_IMAGE_STYLE_MAX} placeholder="Ex.: pintura a óleo de fantasia, luz dramática, paleta fria" {...form.register("sceneImages.style")} />
                    </Field>
                </CardContent>
            </Card>
        </>
    )
}
