/**
 * Search now runs on the server on demand. Keeping this hook as a no-op avoids
 * preloading every searchable entity in the browser when the dashboard mounts.
 */
export function useWarmSearchCache(): void {
    return undefined
}
