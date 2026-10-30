import { Button } from "@/core/ui/button"
export function ErrorState({ onRetry, title = "Não foi possível carregar", description }: { onRetry?: () => void; title?: string; description?: string }) {
    return <div role="alert" className="p-4 text-sm"><p>{title}</p>{description && <p>{description}</p>}{onRetry && <Button onClick={onRetry}>Tentar novamente</Button>}</div>
}
