"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react"
import { SignIn } from "@/features/auth/auth-components"
import { useAuth } from "@/core/hooks/useAuth"

type BridgeStatus = "idle" | "publishing" | "published" | "error"

function buildBridgeRedirectUrl(channelId: string, nonce: string) {
    return `/owlbear/auth/bridge?channelId=${encodeURIComponent(channelId)}&nonce=${encodeURIComponent(nonce)}`
}

export function OwlbearAuthBridgePage() {
    const searchParams = useSearchParams()
    const { isLoaded, isSignedIn } = useAuth()
    const channelId = searchParams.get("channelId") ?? ""
    const nonce = searchParams.get("nonce") ?? ""
    const [status, setStatus] = React.useState<BridgeStatus>("idle")
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
    const redirectUrl = channelId && nonce ? buildBridgeRedirectUrl(channelId, nonce) : "/"

    React.useEffect(() => {
        if (!isLoaded || !isSignedIn || !channelId || !nonce || status !== "idle") return

        let cancelled = false
        setStatus("publishing")
        setErrorMessage(null)

        void (async () => {
            try {
                const response = await fetch("/api/owlbear/auth/pusher-handoff", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ channelId, nonce }),
                })

                if (!response.ok) {
                    const payload = await response.json().catch(() => null) as { error?: string } | null
                    throw new Error(payload?.error ?? "Não foi possível avisar a action do Owlbear.")
                }

                if (!cancelled) setStatus("published")
            } catch (error) {
                console.error("Failed to publish Owlbear auth handoff", error)
                if (!cancelled) {
                    setStatus("error")
                    setErrorMessage(error instanceof Error ? error.message : "Não foi possível avisar a action do Owlbear.")
                }
            }
        })()

        return () => {
            cancelled = true
        }
    }, [channelId, isLoaded, isSignedIn, nonce, status])

    if (!channelId || !nonce) {
        return (
            <div className="flex min-h-dvh items-center justify-center bg-slate-950 p-6 text-white">
                <div className="w-full max-w-md rounded-3xl border border-red-400/20 bg-red-500/10 p-6 text-center">
                    <ShieldAlert className="mx-auto h-10 w-10 text-red-200" />
                    <h1 className="mt-4 text-xl font-bold">Link inválido</h1>
                    <p className="mt-2 text-sm text-white/70">Abra o login a partir da action do Owlbear novamente.</p>
                </div>
            </div>
        )
    }

    if (!isLoaded || status === "publishing") {
        return (
            <div className="flex min-h-dvh items-center justify-center bg-slate-950 p-6 text-white">
                <div className="rounded-3xl border border-white/10 bg-white/10 p-6 text-center">
                    <Loader2 className="mx-auto h-9 w-9 animate-spin text-violet-200" />
                    <p className="mt-4 text-sm text-white/70">Conectando sua conta ao Owlbear...</p>
                </div>
            </div>
        )
    }

    if (!isSignedIn) {
        return (
            <div className="flex min-h-dvh items-center justify-center bg-slate-950 p-6 text-white">
                <div className="w-full max-w-md space-y-4">
                    <div className="rounded-3xl border border-white/10 bg-white/10 p-5 text-center">
                        <h1 className="text-xl font-bold">Entrar no Dungeons & Dicas</h1>
                        <p className="mt-2 text-sm text-white/60">Depois do login, esta aba vai liberar a action aberta no Owlbear.</p>
                    </div>
                    <SignIn fallbackRedirectUrl={redirectUrl} forceRedirectUrl={redirectUrl} />
                </div>
            </div>
        )
    }

    return (
        <div className="flex min-h-dvh items-center justify-center bg-slate-950 p-6 text-white">
            <div className="w-full max-w-md rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-6 text-center">
                {status === "published" ? (
                    <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-200" />
                ) : (
                    <ShieldAlert className="mx-auto h-10 w-10 text-amber-200" />
                )}
                <h1 className="mt-4 text-xl font-bold">{status === "published" ? "Login concluído" : "Não foi possível concluir"}</h1>
                <p className="mt-2 text-sm text-white/70">
                    {status === "published"
                        ? "Volte para a action aberta no Owlbear. Ela será atualizada automaticamente."
                        : errorMessage ?? "Tente abrir o login pela action do Owlbear novamente."}
                </p>
            </div>
        </div>
    )
}
