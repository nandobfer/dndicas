import type { UserRole, UserStatus } from "../src/features/users/types/user.types"

export const DEFAULT_CLERK_MIGRATION_CSV = "docs/clerk/clerk-users-dev.csv"
export const DEFAULT_CLERK_MIGRATION_OUT_DIR = "docs/clerk/migration-output"

export const CLERK_MIGRATION_EXPECTED_HEADERS = [
    "id",
    "first_name",
    "last_name",
    "username",
    "primary_email_address",
    "primary_phone_number",
    "verified_email_addresses",
    "unverified_email_addresses",
    "verified_phone_numbers",
    "unverified_phone_numbers",
    "totp_secret",
    "password_digest",
    "password_hasher",
    "created_at",
] as const

export type ClerkMigrationAction = "created" | "reused" | "skipped" | "error"

export type ClerkMigrationRemapTarget = {
    collectionName: string
    fieldName: string
    label: string
}

export type ClerkMigrationCsvRow = Record<(typeof CLERK_MIGRATION_EXPECTED_HEADERS)[number], string>

export type ClerkMigrationLocalUser = {
    id: string
    clerkId: string
    email: string
    username: string
    name?: string
    role: UserRole
    status: UserStatus
    deleted?: boolean
}

export type ClerkMigrationMapRecord = {
    email: string
    oldClerkId: string
    newClerkId: string
    localUserId: string
    role: UserRole | ""
    status: UserStatus | ""
    action: ClerkMigrationAction
    needsAccessSetup: boolean
    message: string
}

export type ClerkCreateUserPayload = {
    emailAddress: string[]
    username?: string
    firstName?: string
    lastName?: string
    publicMetadata: {
        role: UserRole
    }
    passwordDigest?: string
    passwordHasher?: string
    skipPasswordChecks?: boolean
    skipPasswordRequirement?: boolean
}

export const CLERK_MIGRATION_REMAP_TARGETS: ClerkMigrationRemapTarget[] = [
    { collectionName: "users", fieldName: "clerkId", label: "users.clerkId" },
    { collectionName: "charactersheets", fieldName: "userId", label: "characterSheets.userId" },
    { collectionName: "owlbear_sessions", fieldName: "userId", label: "owlbearSessions.userId" },
    { collectionName: "owlbear_room_npcs", fieldName: "userId", label: "owlbearRoomNpcs.userId" },
    { collectionName: "user_npcs", fieldName: "userId", label: "userNpcs.userId" },
    { collectionName: "feedbacks", fieldName: "createdBy", label: "feedback.createdBy" },
    { collectionName: "auditlogs", fieldName: "userId", label: "auditLogs.userId" },
    { collectionName: "auditlogs", fieldName: "performedBy", label: "auditLogs.performedBy" },
    { collectionName: "usagelogs", fieldName: "userId", label: "usageLogs.userId" },
]

export function normalizeMigrationEmail(email: string): string {
    return email.trim().toLowerCase()
}

export function sanitizeMigrationUsername(username: string): string | undefined {
    const sanitized = username.trim().replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 50)
    if (sanitized.length < 3) return undefined
    return sanitized
}

export function isSupportedPasswordImport(row: ClerkMigrationCsvRow): boolean {
    return Boolean(row.password_digest.trim() && row.password_hasher.trim().toLowerCase() === "bcrypt")
}

export function buildClerkCreateUserPayload(row: ClerkMigrationCsvRow, localUser: ClerkMigrationLocalUser): ClerkCreateUserPayload {
    const payload: ClerkCreateUserPayload = {
        emailAddress: [normalizeMigrationEmail(row.primary_email_address)],
        publicMetadata: { role: localUser.role },
    }

    const username = sanitizeMigrationUsername(row.username)
    if (username) payload.username = username
    if (row.first_name.trim()) payload.firstName = row.first_name.trim()
    if (row.last_name.trim()) payload.lastName = row.last_name.trim()

    if (isSupportedPasswordImport(row)) {
        payload.passwordDigest = row.password_digest.trim()
        payload.passwordHasher = row.password_hasher.trim().toLowerCase()
        payload.skipPasswordChecks = true
    } else {
        payload.skipPasswordRequirement = true
    }

    return payload
}

export function parseClerkMigrationCsv(content: string): ClerkMigrationCsvRow[] {
    const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length > 0)
    if (lines.length === 0) return []

    const headers = parseCsvLine(lines[0])
    const missingHeaders = CLERK_MIGRATION_EXPECTED_HEADERS.filter((header) => !headers.includes(header))
    if (missingHeaders.length > 0) {
        throw new Error(`CSV inválido. Cabeçalhos ausentes: ${missingHeaders.join(", ")}`)
    }

    return lines.slice(1).map((line, index) => {
        const values = parseCsvLine(line)
        const row = Object.fromEntries(CLERK_MIGRATION_EXPECTED_HEADERS.map((header) => [header, values[headers.indexOf(header)] ?? ""])) as ClerkMigrationCsvRow
        if (!row.id.trim()) throw new Error(`CSV inválido. Linha ${index + 2} sem id do Clerk development.`)
        return row
    })
}

export function validateClerkMigrationRows(rows: ClerkMigrationCsvRow[]): string[] {
    const errors: string[] = []
    const seenEmails = new Set<string>()
    const seenIds = new Set<string>()

    rows.forEach((row, index) => {
        const line = index + 2
        const email = normalizeMigrationEmail(row.primary_email_address)
        if (!email) {
            errors.push(`Linha ${line}: primary_email_address ausente.`)
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            errors.push(`Linha ${line}: email inválido (${row.primary_email_address}).`)
        } else if (seenEmails.has(email)) {
            errors.push(`Linha ${line}: email duplicado (${email}).`)
        }

        if (seenIds.has(row.id)) {
            errors.push(`Linha ${line}: id Clerk duplicado (${row.id}).`)
        }

        seenEmails.add(email)
        seenIds.add(row.id)
    })

    return errors
}

export function toMigrationCsv(records: ClerkMigrationMapRecord[]): string {
    const header = "email,oldClerkId,newClerkId,localUserId,role,status,action,needsAccessSetup,message"
    const rows = records.map((record) => [
        record.email,
        record.oldClerkId,
        record.newClerkId,
        record.localUserId,
        record.role,
        record.status,
        record.action,
        String(record.needsAccessSetup),
        record.message,
    ].map(escapeCsvValue).join(","))

    return [header, ...rows].join("\n") + "\n"
}

function parseCsvLine(line: string): string[] {
    const values: string[] = []
    let current = ""
    let insideQuotes = false

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i]
        const nextChar = line[i + 1]

        if (char === '"' && insideQuotes && nextChar === '"') {
            current += '"'
            i += 1
            continue
        }

        if (char === '"') {
            insideQuotes = !insideQuotes
            continue
        }

        if (char === "," && !insideQuotes) {
            values.push(current)
            current = ""
            continue
        }

        current += char
    }

    values.push(current)
    return values
}

function escapeCsvValue(value: string | boolean): string {
    const stringValue = String(value)
    if (!/[",\n\r]/.test(stringValue)) return stringValue
    return `"${stringValue.replace(/"/g, '""')}"`
}
