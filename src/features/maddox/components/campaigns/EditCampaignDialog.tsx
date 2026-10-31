"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Pencil } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Field } from "@/components/ui/opex/field"
import { Input } from "@/components/ui/opex/input"
import { GlassModal, GlassModalContent, GlassModalDescription, GlassModalFooter, GlassModalHeader, GlassModalTitle } from "@/components/ui/glass-modal"
import { MADDOX_CAMPAIGN_NAME_MAX } from "../../constants"
import { createMaddoxCampaignSchema, type CreateMaddoxCampaignInput } from "../../campaign-schemas"
import type { MaddoxCampaignDetailDto } from "../../campaign-types"
import { useUpdateMaddoxCampaign } from "../../hooks/useMaddoxCampaigns"
import { RigorCard } from "./RigorCard"

/** Dono edita o nome e, só antes da entrevista de cenário, o grau de rigor. */
export function EditCampaignDialog({ campaign, open, onOpenChange }: { campaign: MaddoxCampaignDetailDto; open: boolean; onOpenChange: (open: boolean) => void }) {
    const form = useForm<CreateMaddoxCampaignInput>({ resolver: zodResolver(createMaddoxCampaignSchema), defaultValues: { name: campaign.name, rigor: campaign.rigor } })
    const update = useUpdateMaddoxCampaign(campaign.id)
    const rigorLocked = campaign.rigorLocked

    useEffect(() => {
        if (open) form.reset({ name: campaign.name, rigor: campaign.rigor })
    }, [open, campaign.name, campaign.rigor, form])

    const submit = form.handleSubmit((values) => {
        const changes = { ...(values.name !== campaign.name ? { name: values.name } : {}), ...(!rigorLocked && values.rigor !== campaign.rigor ? { rigor: values.rigor } : {}) }
        if (Object.keys(changes).length === 0) return onOpenChange(false)
        update.mutate(changes, { onSuccess: () => onOpenChange(false) })
    })

    return (
        <GlassModal open={open} onOpenChange={(next) => !update.isPending && onOpenChange(next)}>
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
                    <GlassModalFooter>
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={update.isPending}>
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
