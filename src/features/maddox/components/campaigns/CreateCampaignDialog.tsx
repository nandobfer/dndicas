"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AlertTriangle, Loader2, Swords } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Field } from "@/components/ui/opex/field"
import { Input } from "@/components/ui/opex/input"
import { GlassModal, GlassModalContent, GlassModalDescription, GlassModalFooter, GlassModalHeader, GlassModalTitle } from "@/components/ui/glass-modal"
import { apiErrorMessage } from "@/lib/api"
import { MADDOX_CAMPAIGN_NAME_MAX } from "../../constants"
import { createMaddoxCampaignSchema, type CreateMaddoxCampaignInput } from "../../campaign-schemas"
import type { MaddoxCampaignDetailDto } from "../../campaign-types"
import { useCreateMaddoxCampaign } from "../../hooks/useMaddoxCampaigns"
import { RigorCard } from "./RigorCard"

const DEFAULTS: CreateMaddoxCampaignInput = { name: "", rigor: "equilibrado" }

/** Criação da campanha: nome e grau de rigor. Nasce no lobby, com o criador como dono. */
export function CreateCampaignDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (campaign: MaddoxCampaignDetailDto) => void }) {
    const form = useForm<CreateMaddoxCampaignInput>({ resolver: zodResolver(createMaddoxCampaignSchema), defaultValues: DEFAULTS })
    const create = useCreateMaddoxCampaign()

    const close = (next: boolean) => {
        if (create.isPending) return
        if (!next) {
            form.reset(DEFAULTS)
            create.reset()
        }
        onOpenChange(next)
    }

    const submit = form.handleSubmit((values) =>
        create.mutate(values, {
            onSuccess: (campaign) => {
                form.reset(DEFAULTS)
                onCreated(campaign)
            },
        }),
    )

    return (
        <GlassModal open={open} onOpenChange={close}>
            <GlassModalContent size="full">
                <form onSubmit={submit} className="space-y-5" noValidate>
                    <GlassModalHeader>
                        <GlassModalTitle className="flex items-center gap-2">
                            <Swords className="h-5 w-5 text-primary" aria-hidden /> Nova campanha
                        </GlassModalTitle>
                        <GlassModalDescription>Depois de criar, você define o cenário com o Maddox numa entrevista. Convide os jogadores pelo link: cada um faz a entrevista do próprio personagem.</GlassModalDescription>
                    </GlassModalHeader>

                    <Field id="maddox-campaign-name" label="Nome da campanha" error={form.formState.errors.name?.message}>
                        <Input id="maddox-campaign-name" maxLength={MADDOX_CAMPAIGN_NAME_MAX} placeholder="Ex.: As Brumas de Valdrenn" autoFocus {...form.register("name")} />
                    </Field>

                    <RigorCard form={form} />

                    {create.isError && (
                        <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                            {apiErrorMessage(create.error, "Não foi possível criar a campanha")}
                        </p>
                    )}

                    <GlassModalFooter>
                        <Button type="button" variant="ghost" onClick={() => close(false)} disabled={create.isPending}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={create.isPending}>
                            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                            Criar campanha
                        </Button>
                    </GlassModalFooter>
                </form>
            </GlassModalContent>
        </GlassModal>
    )
}
