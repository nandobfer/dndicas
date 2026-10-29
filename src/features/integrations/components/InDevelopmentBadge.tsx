/** Selo discreto para marcar controles ou blocos "Em desenvolvimento". */
export const InDevelopmentBadge = ({ className = "" }: { className?: string }) => (
    <span
        className={`inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-warning ring-1 ring-warning/30 ${className}`}
        title="Recurso em desenvolvimento"
    >
        Em desenvolvimento
    </span>
)
