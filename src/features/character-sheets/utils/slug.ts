/**
 * Generate a unique URL-friendly slug for a character sheet.
 * Format: `{mongoId}-{kebab-case-name}` or just `{mongoId}` if name is empty.
 */
export const generateSlug = (id: string, name: string): string => {
    if (!name.trim()) return id
    const kebab = name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
    return kebab ? `${id}-${kebab}` : id
}

/**
 * Extract the MongoDB ObjectId from a slug.
 * The ID is always the first segment (before the first `-`).
 * If the slug contains no `-` (name was empty), the whole slug is the ID.
 */
export const extractIdFromSlug = (slug: string): string => {
    return slug.split("-")[0]
}
