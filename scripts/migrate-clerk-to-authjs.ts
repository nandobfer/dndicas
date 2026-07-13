import dotenv from "dotenv"
import { mkdir, readFile, writeFile } from "fs/promises"
import mongoose from "mongoose"
import path from "path"
import { User } from "../src/features/users/models/user"

type MigrationMode = "dry-run" | "apply"

type MigrationOptions = {
    mode: MigrationMode
    csvPath: string
    outDir: string
    confirmBackup: boolean
    skipRemap: boolean
}

type CsvRow = {
    id: string
    first_name: string
    last_name: string
    username: string
    primary_email_address: string
    password_digest: string
    password_hasher: string
    created_at: string
}

type MigrationRecord = {
    email: string
    oldClerkId: string
    remapSourceIds: string[]
    localUserId: string
    role: string
    status: string
    action: "updated" | "skipped" | "error"
    passwordImported: boolean
    passwordSetupRequired: boolean
    passwordHashPresent: boolean
    message: string
}

type RemapTargetReport = {
    label: string
    collectionName: string
    fieldName: string
    matchedCount: number
    modifiedCount: number
    sources: Array<{
        email: string
        sourceId: string
        localUserId: string
        matchedCount: number
        modifiedCount: number
    }>
}

const DEFAULT_CSV_PATH = "docs/clerk/clerk-users-dev.csv"
const DEFAULT_OUT_DIR = "docs/authjs/migration-output"

const REMAP_TARGETS = [
    { collectionName: "charactersheets", fieldName: "userId", label: "characterSheets.userId" },
    { collectionName: "owlbear_sessions", fieldName: "userId", label: "owlbearSessions.userId" },
    { collectionName: "owlbear_room_npcs", fieldName: "userId", label: "owlbearRoomNpcs.userId" },
    { collectionName: "user_npcs", fieldName: "userId", label: "userNpcs.userId" },
    { collectionName: "feedbacks", fieldName: "createdBy", label: "feedback.createdBy" },
    { collectionName: "auditlogs", fieldName: "userId", label: "auditLogs.userId" },
    { collectionName: "auditlogs", fieldName: "performedBy", label: "auditLogs.performedBy" },
    { collectionName: "usagelogs", fieldName: "userId", label: "usageLogs.userId" },
]

dotenv.config({ path: path.resolve(process.cwd(), ".env") })
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: false })

function parseOptions(args: string[]): MigrationOptions {
    const hasFlag = (name: string) => args.includes(`--${name}`)
    const getArgValue = (name: string): string | undefined => {
        const inline = args.find((arg) => arg.startsWith(`--${name}=`))
        if (inline) return inline.slice(name.length + 3)
        const index = args.findIndex((arg) => arg === `--${name}`)
        const next = args[index + 1]
        return index >= 0 && next && !next.startsWith("--") ? next : undefined
    }

    const apply = hasFlag("apply")
    return {
        mode: apply ? "apply" : "dry-run",
        csvPath: getArgValue("csv") ?? DEFAULT_CSV_PATH,
        outDir: getArgValue("out") ?? DEFAULT_OUT_DIR,
        confirmBackup: hasFlag("confirm-backup"),
        skipRemap: hasFlag("skip-remap"),
    }
}

function parseCsvLine(line: string): string[] {
    const values: string[] = []
    let current = ""
    let insideQuotes = false

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index]
        const nextChar = line[index + 1]
        if (char === '"' && insideQuotes && nextChar === '"') {
            current += '"'
            index += 1
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

function parseCsv(content: string): CsvRow[] {
    const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim())
    if (lines.length === 0) return []
    const headers = parseCsvLine(lines[0])

    return lines.slice(1).map((line, index) => {
        const values = parseCsvLine(line)
        const row = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] ?? ""])) as CsvRow
        if (!row.id?.trim()) throw new Error(`CSV inválido. Linha ${index + 2} sem id legado.`)
        if (!row.primary_email_address?.trim()) throw new Error(`CSV inválido. Linha ${index + 2} sem email.`)
        return row
    })
}

function normalizeEmail(email: string) {
    return email.trim().toLowerCase()
}

function isBcryptRow(row: CsvRow) {
    return Boolean(row.password_digest?.trim() && row.password_hasher?.trim().toLowerCase() === "bcrypt")
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))))
}

async function connectDatabase() {
    const mongoUri = process.env.MONGODB_URI
    if (!mongoUri) throw new Error("MONGODB_URI não configurada.")
    await mongoose.connect(mongoUri)
}

async function migrateUsers(options: MigrationOptions, rows: CsvRow[]): Promise<MigrationRecord[]> {
    const records: MigrationRecord[] = []

    for (const row of rows) {
        const email = normalizeEmail(row.primary_email_address)
        const user = await User.findOne({
            deleted: { $ne: true },
            $or: [
                { email },
                { legacyClerkId: row.id },
                { clerkId: row.id },
            ],
        }).select("+passwordHash")

        if (!user) {
            records.push({
                email,
                oldClerkId: row.id,
                remapSourceIds: [row.id],
                localUserId: "",
                role: "",
                status: "",
                action: "skipped",
                passwordImported: false,
                passwordSetupRequired: true,
                passwordHashPresent: false,
                message: "Usuário não existe no MongoDB local.",
            })
            continue
        }

        const currentClerkId = typeof user.get === "function" ? user.get("clerkId") as string | undefined : undefined
        const remapSourceIds = uniqueNonEmpty([row.id, user.legacyClerkId, currentClerkId])
        const passwordImported = isBcryptRow(row)
        const existingPasswordHashPresent = Boolean(user.passwordHash)
        let passwordHashPresent = passwordImported || existingPasswordHashPresent
        let passwordSetupRequired = passwordImported ? false : !existingPasswordHashPresent
        if (options.mode === "apply") {
            user.legacyClerkId = row.id
            user.email = email
            if (passwordImported) {
                user.passwordHash = row.password_digest.trim()
                user.passwordSetupRequired = false
            } else if (user.passwordHash) {
                user.passwordSetupRequired = false
            } else {
                user.passwordSetupRequired = true
            }
            await user.save()

            const savedUser = await User.findById(user._id).select("+passwordHash").lean()
            passwordHashPresent = Boolean(savedUser?.passwordHash)
            passwordSetupRequired = Boolean(savedUser?.passwordSetupRequired)
        }

        records.push({
            email,
            oldClerkId: row.id,
            remapSourceIds,
            localUserId: user._id.toString(),
            role: user.role,
            status: user.status,
            action: "updated",
            passwordImported,
            passwordSetupRequired,
            passwordHashPresent,
            message: passwordImported ? "Hash bcrypt importado para Auth.js." : passwordSetupRequired ? "Usuário precisa definir senha local." : "Usuário já tinha senha local configurada.",
        })
    }

    return records
}

async function remapMongoDb(options: MigrationOptions, records: MigrationRecord[]) {
    const mappings = records.filter((record) => record.action === "updated" && record.remapSourceIds.length > 0 && record.localUserId)
    const targets: RemapTargetReport[] = []

    if (options.skipRemap) return targets

    for (const target of REMAP_TARGETS) {
        const collection = mongoose.connection.collection(target.collectionName)
        let matchedCount = 0
        let modifiedCount = 0
        const sources: RemapTargetReport["sources"] = []

        for (const mapping of mappings) {
            for (const sourceId of mapping.remapSourceIds) {
                if (sourceId === mapping.localUserId) continue

                const filter = { [target.fieldName]: sourceId }
                if (options.mode === "dry-run") {
                    const sourceMatchedCount = await collection.countDocuments(filter)
                    matchedCount += sourceMatchedCount
                    if (sourceMatchedCount > 0) {
                        sources.push({
                            email: mapping.email,
                            sourceId,
                            localUserId: mapping.localUserId,
                            matchedCount: sourceMatchedCount,
                            modifiedCount: 0,
                        })
                    }
                    continue
                }

                const result = await collection.updateMany(filter, { $set: { [target.fieldName]: mapping.localUserId } })
                matchedCount += result.matchedCount
                modifiedCount += result.modifiedCount
                if (result.matchedCount > 0 || result.modifiedCount > 0) {
                    sources.push({
                        email: mapping.email,
                        sourceId,
                        localUserId: mapping.localUserId,
                        matchedCount: result.matchedCount,
                        modifiedCount: result.modifiedCount,
                    })
                }
            }
        }

        targets.push({ ...target, matchedCount, modifiedCount, sources })
    }

    return targets
}

function escapeCsvValue(value: string | boolean) {
    const stringValue = String(value)
    if (!/[",\n\r]/.test(stringValue)) return stringValue
    return `"${stringValue.replace(/"/g, '""')}"`
}

function toCsv(records: MigrationRecord[]) {
    const header = "email,oldClerkId,remapSourceIds,localUserId,role,status,action,passwordImported,passwordSetupRequired,passwordHashPresent,message"
    const rows = records.map((record) => [
        record.email,
        record.oldClerkId,
        record.remapSourceIds.join("|"),
        record.localUserId,
        record.role,
        record.status,
        record.action,
        record.passwordImported,
        record.passwordSetupRequired,
        record.passwordHashPresent,
        record.message,
    ].map(escapeCsvValue).join(","))
    return [header, ...rows].join("\n") + "\n"
}

async function writeArtifacts(options: MigrationOptions, records: MigrationRecord[], remapReport: Awaited<ReturnType<typeof remapMongoDb>>) {
    await mkdir(options.outDir, { recursive: true })
    await writeFile(path.join(options.outDir, "migration-map.csv"), toCsv(records), "utf8")
    await writeFile(path.join(options.outDir, "migration-report.json"), JSON.stringify({ mode: options.mode, records }, null, 2) + "\n", "utf8")
    await writeFile(path.join(options.outDir, "mongodb-remap-report.json"), JSON.stringify({ mode: options.mode, targets: remapReport }, null, 2) + "\n", "utf8")
    await writeFile(path.join(options.outDir, "password-setup-required.csv"), toCsv(records.filter((record) => record.passwordSetupRequired)), "utf8")
}

async function main() {
    const options = parseOptions(process.argv.slice(2))
    if (options.mode === "apply" && !options.confirmBackup) {
        throw new Error("Modo apply exige --confirm-backup após backup completo do MongoDB.")
    }

    const csvContent = await readFile(options.csvPath, "utf8")
    const rows = parseCsv(csvContent)

    await connectDatabase()
    try {
        const records = await migrateUsers(options, rows)
        const remapReport = await remapMongoDb(options, records)
        await writeArtifacts(options, records, remapReport)

        console.log(`Migração Clerk -> Auth.js (${options.mode})`)
        console.log(`Processados: ${rows.length}`)
        console.log(`Atualizados: ${records.filter((record) => record.action === "updated").length}`)
        console.log(`Sem senha local: ${records.filter((record) => record.passwordSetupRequired).length}`)
        console.log(`Artefatos: ${options.outDir}`)
    } finally {
        await mongoose.disconnect()
    }
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Erro desconhecido"
    console.error(`Erro fatal: ${message}`)
    process.exit(1)
})
