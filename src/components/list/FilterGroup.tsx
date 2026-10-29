import { ReactNode } from "react"
import { Label } from "@/components/ui/opex/label"
import { cn } from "@/lib/utils"

interface FilterGroupProps {
    label: string
    children: ReactNode
    className?: string
}

export function FilterGroup({ label, children, className }: FilterGroupProps) {
    return (
        <div className={cn("flex flex-col gap-2", className)}>
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</Label>
            {children}
        </div>
    )
}
