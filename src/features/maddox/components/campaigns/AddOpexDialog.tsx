"use client"

import { useState } from "react"
import { Bot, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Field } from "@/components/ui/opex/field"
import { Textarea } from "@/components/ui/opex/textarea"
import { GlassSelector } from "@/components/ui/glass-selector"
import { GlassModal, GlassModalContent, GlassModalDescription, GlassModalFooter, GlassModalHeader, GlassModalTitle } from "@/components/ui/glass-modal"
import { MADDOX_OPEX_INTERVIEW_MODE_LABELS, MADDOX_OPEX_PROMPT_MAX, type MaddoxOpexInterviewMode } from "../../constants"
import { useAddMaddoxOpex } from "../../hooks/useMaddoxOpex"

const MODE_HINTS: Record<MaddoxOpexInterviewMode, string> = {
    autonomous: "Roda em segundo plano: o próprio Opex responde ao Maddox e a síntese é confirmada sozinha.",
    live: "Você acompanha: cada resposta do Opex só segue ao Maddox depois que você aprova, edita ou pede outra.",
}

/** Dono adiciona um Personagem Opex (DND-26): prompt base opcional e o modo da entrevista. */
export function AddOpexDialog({ campaignId, open, onOpenChange }: { campaignId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
    const add = useAddMaddoxOpex(campaignId)
    const [prompt, setPrompt] = useState("")
    const [mode, setMode] = useState<MaddoxOpexInterviewMode>("autonomous")
    const close = () => {
        setPrompt("")
        setMode("autonomous")
        onOpenChange(false)
    }
    const tooLong = prompt.length > MADDOX_OPEX_PROMPT_MAX
    return (
        <GlassModal open={open} onOpenChange={(next) => !add.isPending && (next ? onOpenChange(true) : close())}>
            <GlassModalContent size="lg">
                <form
                    className="space-y-5"
                    noValidate
                    onSubmit={(event) => {
                        event.preventDefault()
                        if (tooLong) return
                        add.mutate({ prompt: prompt.trim(), interviewMode: mode }, { onSuccess: close })
                    }}
                >
                    <GlassModalHeader>
                        <GlassModalTitle className="flex items-center gap-2">
                            <Bot className="h-5 w-5 text-primary" aria-hidden /> Adicionar Personagem Opex
                        </GlassModalTitle>
                        <GlassModalDescription>Um personagem controlado por IA que joga como os outros. O que você não disser, ele decide de acordo com o cenário — inclusive o nome.</GlassModalDescription>
                    </GlassModalHeader>
                    <Field id="maddox-opex-prompt" label="Prompt base (opcional)" error={tooLong ? `Até ${MADDOX_OPEX_PROMPT_MAX.toLocaleString("pt-BR")} caracteres` : undefined}>
                        <Textarea
                            id="maddox-opex-prompt"
                            rows={6}
                            value={prompt}
                            onChange={(event) => setPrompt(event.target.value)}
                            placeholder="Ex.: uma clériga anã chamada Brunna, devota e desconfiada de magos, irmã do personagem do Lucas."
                        />
                    </Field>
                    <p className="-mt-3 text-right text-xs text-white/50">
                        {prompt.length}/{MADDOX_OPEX_PROMPT_MAX.toLocaleString("pt-BR")}
                    </p>
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-white">Modo da entrevista</p>
                        <GlassSelector<MaddoxOpexInterviewMode>
                            value={mode}
                            onChange={(value) => !Array.isArray(value) && setMode(value)}
                            layoutId="maddox-opex-mode"
                            options={[
                                { value: "autonomous", label: MADDOX_OPEX_INTERVIEW_MODE_LABELS.autonomous },
                                { value: "live", label: MADDOX_OPEX_INTERVIEW_MODE_LABELS.live },
                            ]}
                        />
                        <p className="text-xs text-white/60" data-testid="opex-mode-hint">
                            {MODE_HINTS[mode]}
                        </p>
                    </div>
                    <GlassModalFooter>
                        <Button type="button" variant="ghost" onClick={close} disabled={add.isPending}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={add.isPending || tooLong}>
                            {add.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                            Adicionar
                        </Button>
                    </GlassModalFooter>
                </form>
            </GlassModalContent>
        </GlassModal>
    )
}
