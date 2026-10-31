import type { ReactNode } from "react"
import { ViewAsBanner } from "@/features/perfix/components/view-as/ViewAsBanner"

/**
 * As extensões do Owlbear ficam fora do layout `(dashboard)`: a faixa da simulação "Visualizar como" entra aqui, para
 * quem simula outro perfil ou usuário nunca agir sem o aviso (e a saída) à vista.
 */
export default function OwlbearLayout({ children }: { children: ReactNode }) {
    return (
        <>
            <ViewAsBanner />
            {children}
        </>
    )
}
