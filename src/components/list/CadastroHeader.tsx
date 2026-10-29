import { type ReactNode } from "react"
import { Button } from "@/components/ui/opex/button"

interface CadastroHeaderProps {
    title: string
    description: string
    actionLabel?: string
    onAction?: () => void
    actionIcon?: ReactNode
    children?: ReactNode
}

export const CadastroHeader = ({ title, description, actionLabel, onAction, actionIcon, children }: CadastroHeaderProps) => {
    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-semibold md:text-2xl">{title}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{description}</p>
                </div>
                {actionLabel && onAction && (
                    <Button onClick={onAction} className="h-9 px-4">
                        {actionIcon && <span className="mr-2">{actionIcon}</span>}
                        {actionLabel}
                    </Button>
                )}
            </div>
            {children}
        </div>
    )
}
