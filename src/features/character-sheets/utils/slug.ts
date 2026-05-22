/**
 * Generate a unique URL-friendly slug for a character sheet.
 * Format: `{username}/{kebab-case-name}` (new format)
 * Falls back to just `{username}/nova-ficha` if name is empty.
 */
export const generateSlug = (username: string, name: string): string => {
    const safeUsername = username
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .trim() || "user"

    const kebab = name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")

    return `${safeUsername}/${kebab || "nova-ficha"}`
}

/**
 * Extract the MongoDB ObjectId from an old-format slug.
 * Old format: `{mongoId}-{kebab-case-name}` — the ID is the first segment before `-`.
 * Returns null if the slug is in the new format (`username/name`).
 */
export const extractIdFromSlug = (slug: string): string | null => {
    if (slug.includes("/")) return null
    return slug.split("-")[0] ?? null
}
