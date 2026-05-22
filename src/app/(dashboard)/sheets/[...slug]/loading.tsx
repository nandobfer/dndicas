export default function SheetLoading() {
    return (
        <div className="space-y-4 animate-pulse">
            <div className="h-28 rounded-xl bg-white/5" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-[600px] rounded-xl bg-white/5" />
                ))}
            </div>
        </div>
    )
}
