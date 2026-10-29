import { ExternalLink } from "lucide-react"
import { Card, CardContent } from "@/components/ui/opex/card"
import { Button } from "@/components/ui/opex/button"
import type { OpexAccess } from "../types"

export function OpexAccessSummary({ access }: { access: OpexAccess }) {
    return <Card><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-sm font-semibold">{access.clientName} · {access.user.username}</p><p className="text-xs text-muted-foreground">{access.created ? "Acesso criado no Opex." : "Acesso reutilizado no Opex."}</p></div>
        <Button asChild><a href={access.portalUrl} target="_blank" rel="noreferrer noopener" referrerPolicy="no-referrer">Abrir central de feedback<ExternalLink className="ml-2 h-4 w-4" aria-hidden /></a></Button>
    </CardContent></Card>
}
