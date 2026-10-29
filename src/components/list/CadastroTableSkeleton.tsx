import { Skeleton } from "@/components/ui/opex/skeleton"
import { cn } from "@/lib/utils"

interface CadastroTableSkeletonProps {
    columns?: number
    rows?: number
    className?: string
}

export function CadastroTableSkeleton({ columns = 5, rows = 8, className }: CadastroTableSkeletonProps) {
    return (
        <div className={cn("w-full", className)}>
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="border-b">
                            {Array.from({ length: columns }).map((_, i) => (
                                <th key={i} className="text-left p-3 font-medium text-xs uppercase tracking-wider text-muted-foreground">
                                    <Skeleton className="h-4 w-24 opacity-60" />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: rows }).map((_, i) => (
                            <tr key={i} className="border-b">
                                {Array.from({ length: columns }).map((_, j) => (
                                    <td key={j} className="p-3">
                                        <div className="flex items-center gap-2">
                                            {j === 0 && <Skeleton className="h-6 w-6 rounded-full" />}
                                            <Skeleton className={cn(
                                                "h-3",
                                                j === 0 ? "w-32" : j === columns - 1 ? "w-8 ml-auto" : "w-24"
                                            )} />
                                        </div>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
