import { redirect } from "next/navigation"
import { ShieldAlert } from "lucide-react"
import { getActor } from "@/features/auth/server/actor"

/** Integrações lêem o banco a cada acesso (nada congelado no build). */
export const dynamic = "force-dynamic"

/** Central de integrações: só administradores (visitante vai para o login). */
export default async function IntegracoesLayout({ children }: { children: React.ReactNode }) {
    const actor = await getActor()
    if (!actor) redirect("/sign-in?callbackUrl=%2Fintegracoes")
    if (actor.role !== "admin") {
        return (
            <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
                <ShieldAlert className="h-10 w-10 text-amber-400" aria-hidden />
                <h1 className="text-xl font-semibold text-white">Acesso restrito</h1>
                <p className="max-w-md text-sm text-white/60">A central de integrações é exclusiva para administradores.</p>
            </div>
        )
    }
    return <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">{children}</div>
}
