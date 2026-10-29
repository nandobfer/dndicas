/** Regras compartilhadas pelas duas sidebars; autorização final permanece no servidor. */
export const NAV_PERMISSIONS: Record<string, string> = {
    "/users": "users.view", "/sheets": "sheets.view_all", "/audit-logs": "audit.view",
    "/admin/mentions": "mentions.review", "/integracoes": "integrations.access",
}
export function canNavigate(href: string, can: (permission: string) => boolean) {
    const key = NAV_PERMISSIONS[href]
    return !key || can(key)
}
