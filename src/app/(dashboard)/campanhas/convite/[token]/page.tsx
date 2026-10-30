import type { Metadata } from "next"
import { ShieldAlert } from "lucide-react"
import { pageAccessOrDenied } from "@/features/perfix/server/page-access"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { InviteAcceptPage } from "@/features/maddox/components/campaigns/InviteAcceptPage"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Convite | Campanhas Maddox" }

/** Sem login: vai para o login e volta ao link. Sem a permissão: explica em vez de redirecionar. */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params
    const access = await pageAccessOrDenied(`/campanhas/convite/${encodeURIComponent(token)}`, MADDOX_PLAY_PERMISSION)
    if (!access) {
        return (
            <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
                <ShieldAlert className="h-10 w-10 text-amber-400" aria-hidden />
                <h1 className="text-xl font-semibold text-white">Acesso restrito</h1>
                <p className="max-w-md text-sm text-white/60">Seu perfil ainda não tem acesso às Campanhas Maddox. Fale com um administrador.</p>
            </div>
        )
    }
    return <InviteAcceptPage token={token} />
}
