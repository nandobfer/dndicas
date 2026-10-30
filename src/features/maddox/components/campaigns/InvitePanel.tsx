"use client"

import { useState } from "react"
import { Check, Copy, Link2, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/opex/button"
import { ConfirmDialog } from "@/components/ui/opex/confirm-dialog"
import { Input } from "@/components/ui/opex/input"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardDescription as CardDescription, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import { maddoxInviteUrl, useMaddoxInviteLink, useRotateMaddoxInvite } from "../../hooks/useMaddoxCampaigns"

/** Link de convite (só o dono): copiar e gerar outro (o anterior deixa de funcionar). */
export function InvitePanel({ campaignId, open }: { campaignId: string; open: boolean }) {
    const link = useMaddoxInviteLink(campaignId, open)
    const rotate = useRotateMaddoxInvite(campaignId)
    const [confirming, setConfirming] = useState(false)
    const [copied, setCopied] = useState(false)
    const url = link.data ? maddoxInviteUrl(link.data.token) : ""

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url)
            setCopied(true)
            toast.success("Link de convite copiado")
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.error("Não foi possível copiar. Selecione o link e copie manualmente.")
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Link2 className="h-4 w-4 text-primary" aria-hidden /> Convidar jogadores
                </CardTitle>
                <CardDescription>
                    {open
                        ? "Envie o link para quem você quer na mesa. Quem entrar depois do início faz a entrevista de personagem e é apresentado em seguida."
                        : "A campanha foi encerrada e não aceita novos jogadores."}
                </CardDescription>
            </CardHeader>
            {open && (
                <CardContent className="space-y-3">
                    {link.isLoading ? (
                        <Skeleton className="h-9 w-full" />
                    ) : link.isError ? (
                        <p role="alert" className="text-sm text-destructive">
                            Não foi possível carregar o link de convite.
                        </p>
                    ) : (
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <Input readOnly value={url} aria-label="Link de convite" onFocus={(event) => event.currentTarget.select()} className="font-mono text-xs" />
                            <Button type="button" onClick={() => void copy()} disabled={!url}>
                                {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? "Copiado" : "Copiar link"}
                            </Button>
                            <Button type="button" variant="outline" onClick={() => setConfirming(true)} disabled={rotate.isPending}>
                                {rotate.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} Gerar novo link
                            </Button>
                        </div>
                    )}
                </CardContent>
            )}
            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title="Gerar novo link de convite?"
                description="O link atual deixa de funcionar na hora. Quem já entrou continua na campanha."
                confirmLabel="Gerar novo link"
                pending={rotate.isPending}
                onConfirm={() => rotate.mutate(undefined, { onSettled: () => setConfirming(false) })}
            />
        </Card>
    )
}
