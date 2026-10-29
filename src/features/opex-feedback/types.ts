export interface OpexUser {
    id: string
    username: string
    email: string | null
    admin: boolean
    active: boolean
    isDefault: boolean
    portalPath: string
}
export interface OpexSession {
    clientId: string
    clientName: string
    isAdmin: boolean
    user: { id: string; username: string; email: string | null }
}
export interface OpexAccess extends OpexSession {
    portalUrl: string
    created: boolean
}
export type ColumnColor = "violet" | "sky" | "emerald" | "amber" | "rose" | "cyan" | "orange" | "pink" | "lime" | "zinc"
export interface ClienteDashboardFinanceDto {
    totals: { totalCostBrl: number; totalClientHours: number; serviceCount: number }
    byProject: { repo: string; costBrl: number; clientHours: number }[]
    timeline: { bucket: string; costBrl: number }[]
}
export interface ClienteDashboardDto {
    range: { from: string; to: string }
    tasksActive: number
    tasksCreated: number
    tasksCompleted: number
    byColumn: { label: string; color: ColumnColor; count: number }[]
    byTag: { label: string; count: number }[]
    byProject: { name: string; sigla?: string | null; count: number }[]
    timeline: { bucket: string; created: number; completed: number }[]
    finance: ClienteDashboardFinanceDto | null
}
