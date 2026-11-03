"use client"

import { useEffect, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Pencil } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Field } from "@/components/ui/opex/field"
import { Input } from "@/components/ui/opex/input"
import { GlassModal, GlassModalContent, GlassModalDescription, GlassModalFooter, GlassModalHeader, GlassModalTitle } from "@/components/ui/glass-modal"
import { MADDOX_CAMPAIGN_NAME_MAX, MADDOX_DEFAULT_DENSITY, MADDOX_SHEET_RIGORS } from "../../constants"
import { createMaddoxCampaignSchema, type CreateMaddoxCampaignInput } from "../../campaign-schemas"
import type { MaddoxCampaignDetailDto } from "../../campaign-types"
import { useUpdateMaddoxCampaign } from "../../hooks/useMaddoxCampaigns"
import { CheckDcField } from "./CheckDcField"
import { SceneImagesField } from "./SceneImagesField"
import { StartingLevelField } from "./StartingLevelField"
import { DensityCard } from "./DensityCard"
import { RigorCard } from "./RigorCard"

/** Dono edita o nome, a densidade (a qualquer momento) e, só antes da entrevista de cenário, o grau de rigor. */
export function EditCampaignDialog({ campaign, open, onOpenChange }: { campaign: MaddoxCampaignDetailDto; open: boolean; onOpenChange: (open: boolean) => void }) {
    const form = useForm<CreateMaddoxCampaignInput>({ resolver: zodResolver(createMaddoxCampaignSchema), defaultValues: { name: campaign.name, rigor: campaign.rigor, showCheckDc: campaign.showCheckDc, sceneImages: campaign.sceneImages, density: campaign.density ?? MADDOX_DEFAULT_DENSITY } })
    const update = useUpdateMaddoxCampaign(campaign.id)
    const rigorLocked = campaign.rigorLocked
    // Rascunho do nível enquanto o diálogo está aberto (`undefined` = o valor atual da campanha).
    const [levelDraft, setLevelDraft] = useState<number | undefined>(undefined)
    const startingLevel = levelDraft ?? campaign.startingLevel
    const formRigor = useWatch({ control: form.control, name: "rigor" })
    const levelEditable = campaign.status === "lobby" || campaign.status === "interview"

    useEffect(() => {
        if (open) form.reset({ name: campaign.name, rigor: campaign.rigor, showCheckDc: campaign.showCheckDc, sceneImages: campaign.sceneImages, density: campaign.density ?? MADDOX_DEFAULT_DENSITY })
    }, [open, campaign.name, campaign.rigor, campaign.showCheckDc, campaign.sceneImages, campaign.density, form])

    const close = () => {
        setLevelDraft(undefined)
        onOpenChange(false)
    }

    const submit = form.handleSubmit((values) => {
        const changes = {
            ...(values.name !== campaign.name ? { name: values.name } : {}),
            ...(!rigorLocked && values.rigor !== campaign.rigor ? { rigor: values.rigor } : {}),
            ...((values.showCheckDc ?? false) !== campaign.showCheckDc ? { showCheckDc: values.showCheckDc ?? false } : {}),
            ...((values.sceneImages ?? true) !== campaign.sceneImages ? { sceneImages: values.sceneImages ?? true } : {}),
            ...(values.density !== undefined && values.density !== (campaign.density ?? MADDOX_DEFAULT_DENSITY) ? { density: values.density } : {}),
            ...(levelEditable && MADDOX_SHEET_RIGORS.includes(values.rigor) && startingLevel !== null && startingLevel !== campaign.startingLevel ? { startingLevel } : {}),
        }
        if (Object.keys(changes).length === 0) return close()
        update.mutate(changes, { onSuccess: close })
    })

    return (
        <GlassModal open={open} onOpenChange={(next) => !update.isPending && (next ? onOpenChange(true) : close())}>
            <GlassModalContent size="full">
                <form onSubmit={submit} className="space-y-5" noValidate>
                    <GlassModalHeader>
                        <GlassModalTitle className="flex items-center gap-2">
                            <Pencil className="h-5 w-5 text-primary" aria-hidden /> Editar campanha
                        </GlassModalTitle>
                        <GlassModalDescription>{rigorLocked ? "A entrevista de cenário já começou: o grau de rigor não pode mais mudar." : "Antes da entrevista de cenário, o grau de rigor ainda pode mudar."}</GlassModalDescription>
                    </GlassModalHeader>
                    <Field id="maddox-campaign-edit-name" label="Nome da campanha" error={form.formState.errors.name?.message}>
                        <Input id="maddox-campaign-edit-name" maxLength={MADDOX_CAMPAIGN_NAME_MAX} {...form.register("name")} />
                    </Field>
                    <RigorCard form={form} disabled={rigorLocked} />
                    <DensityCard form={form} disabled={update.isPending} />
                    <CheckDcField form={form} />
                    <SceneImagesField form={form} />
                    {levelEditable && <StartingLevelField rigor={formRigor} value={startingLevel} onChange={setLevelDraft} disabled={update.isPending} />}
                    <GlassModalFooter>
                        <Button type="button" variant="ghost" onClick={close} disabled={update.isPending}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={update.isPending}>
                            {update.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                            Salvar
                        </Button>
                    </GlassModalFooter>
                </form>
            </GlassModalContent>
        </GlassModal>
    )
}
