/** Placeholder de gráfico sem dados no período (mesma altura dos gráficos). */
export function EmptyChart({ message = "Sem dados no período." }: { message?: string }) {
    return <p className="flex h-[240px] items-center justify-center text-xs text-muted-foreground">{message}</p>
}
