export default function MySheetsLoading() {
    return (
        <div className="space-y-6">
            {/* Header skeleton */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                    <div className="h-7 w-48 bg-white/5 rounded-lg animate-pulse" />
                    <div className="h-4 w-56 bg-white/5 rounded animate-pulse" />
                </div>
                <div className="h-9 w-32 bg-white/5 rounded-lg animate-pulse" />
            </div>

            {/* Search skeleton */}
            <div className="h-14 w-full bg-white/5 rounded-xl animate-pulse" />

            {/* Grid skeleton */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-40 rounded-xl bg-white/5 animate-pulse" />
                ))}
            </div>
        </div>
    )
}
