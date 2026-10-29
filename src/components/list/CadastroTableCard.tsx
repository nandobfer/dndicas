import { ReactNode } from "react"
import { Card, CardContent } from "@/components/ui/opex/card"

interface CadastroTableCardProps {
    children: ReactNode
}

export const CadastroTableCard = ({ children }: CadastroTableCardProps) => {
    return (
        <Card>
            <CardContent className="pt-6">{children}</CardContent>
        </Card>
    )
}
