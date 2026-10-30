import { Card, CardContent } from "@/components/ui/opex/card"
import { Skeleton } from "@/components/ui/opex/skeleton"

export function OpexFeedbackSkeleton({ admin = false }: { admin?: boolean }) {
    return (
        <div className="space-y-6" aria-label="Carregando dashboard">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {Array.from({ length: admin ? 6 : 3 }, (_, index) => (
                    <Card key={index}><CardContent className="flex flex-col gap-2 p-4"><Skeleton className="h-3 w-20" /><Skeleton className="h-6 w-14" /><Skeleton className="h-3 w-24" /></CardContent></Card>
                ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-[300px] w-full" />)}</div>
        </div>
    )
}
