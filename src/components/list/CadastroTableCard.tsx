import { ReactNode } from "react"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"

interface CadastroTableCardProps {
    children: ReactNode
}

export const CadastroTableCard = ({ children }: CadastroTableCardProps) => {
    return (
        <GlassCard>
            <GlassCardContent className="p-6">{children}</GlassCardContent>
        </GlassCard>
    )
}
