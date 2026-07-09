import dotenv from "dotenv"
import { mkdir, readFile, writeFile } from "fs/promises"
import mongoose from "mongoose"
import path from "path"
import { createClerkClient } from "@clerk/backend"
import {
    buildClerkCreateUserPayload,
    CLERK_MIGRATION_REMAP_TARGETS,
    DEFAULT_CLERK_MIGRATION_CSV,
    DEFAULT_CLERK_MIGRATION_OUT_DIR,
    isSupportedPasswordImport,
    normalizeMigrationEmail,
    parseClerkMigrationCsv,
    toMigrationCsv,
    validateClerkMigrationRows,
    type ClerkCreateUserPayload,
    type ClerkMigrationCsvRow,
    type ClerkMigrationLocalUser,
    type ClerkMigrationMapRecord,
} from "./clerk-migration-utils"

type ClerkMigrationMode = "dry-run" | "apply"

type ClerkMigrationOptions = {
    mode: ClerkMigrationMode
    csvPath: string
    outDir: string
    confirmBackup: boolean
    skipClerk: boolean
    skipMongoDb: boolean
}

type ClerkUserSummary = {
    id: string
}

type MigrationReport = {
    mode: ClerkMigrationMode
    startedAt: string
    finishedAt: string
    csvPath: string
    outDir: string
    totalCsvRows: number
    created: number
    reused: number
    skipped: number
    errors: string[]
    warnings: string[]
    records: ClerkMigrationMapRecord[]
}

type MongoRemapReport = {
    mode: ClerkMigrationMode
    targets: Array<{
        label: string
        collectionName: string
        fieldName: string
        matchedCount: number
        modifiedCount: number
    }>
}

dotenv.config({ path: path.resolve(process.cwd(), ".env") })
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: false })

function parseOptions(args: string[]): ClerkMigrationOptions {
    const hasFlag = (name: string) => args.includes(`--${name}`)
    const getArgValue = (name: string): string | undefined => {
        const prefix = `--${name}=`
        const inline = args.find((arg) => arg.startsWith(prefix))
        if (inline) return inline.slice(prefix.length)

        const index = args.findIndex((arg) => arg === `--${name}`)
        if (index === -1) return undefined
        const next = args[index + 1]
        return next && !next.startsWith("--") ? next : undefined
    }

    const apply = hasFlag("apply")
    const dryRun = hasFlag("dry-run") || !apply

    if (apply && dryRun && hasFlag("dry-run")) {
        throw new Error("Use apenas um modo: --dry-run ou --apply.")
    }

    return {
        mode: apply ? "apply" : "dry-run",
        csvPath: getArgValue("csv") ?? DEFAULT_CLERK_MIGRATION_CSV,
        outDir: getArgValue("out") ?? DEFAULT_CLERK_MIGRATION_OUT_DIR,
        confirmBackup: hasFlag("confirm-backup"),
        skipClerk: hasFlag("skip-clerk"),
        skipMongoDb: hasFlag("skip-mongodb"),
    }
}

async function connectDatabase(): Promise<void> {
    const mongoUri = process.env.MONGODB_URI
    if (!mongoUri) throw new Error("MONGODB_URI não configurada.")
    await mongoose.connect(mongoUri)
}

function assertSafeEnvironment(options: ClerkMigrationOptions): void {
    const secretKey = process.env.CLERK_SECRET_KEY
    if (!options.skipClerk && !secretKey) throw new Error("CLERK_SECRET_KEY não configurada.")
    if (options.mode === "apply" && !options.confirmBackup) {
        throw new Error("Modo apply exige --confirm-backup após backup completo do MongoDB.")
    }
    if (options.mode === "apply" && !options.skipClerk && !secretKey?.startsWith("sk_live_")) {
        throw new Error("Modo apply exige CLERK_SECRET_KEY production iniciando com sk_live_.")
    }
}

async function findLocalUserByEmail(email: string): Promise<ClerkMigrationLocalUser | null> {
    const { User } = await import("../src/features/users/models/user")
    const user = await User.findOne({ email: normalizeMigrationEmail(email) }).lean()
    if (!user) return null

    return {
        id: String(user._id),
        clerkId: user.clerkId,
        email: user.email,
        username: user.username,
        name: user.name,
        role: user.role,
        status: user.status,
        deleted: user.deleted,
    }
}

async function findProductionUserByEmail(client: ReturnType<typeof createClerkClient>, email: string): Promise<ClerkUserSummary | null> {
    const response = await client.users.getUserList({ emailAddress: [email], limit: 1 })
    const user = response.data[0]
    return user ? { id: user.id } : null
}

async function createProductionUser(client: ReturnType<typeof createClerkClient>, payload: ClerkCreateUserPayload): Promise<ClerkUserSummary> {
    const created = await client.users.createUser(payload)
    return { id: created.id }
}

async function updateProductionUserRole(client: ReturnType<typeof createClerkClient>, clerkId: string, role: ClerkMigrationLocalUser["role"]): Promise<void> {
    await client.users.updateUser(clerkId, { publicMetadata: { role } })
}

async function reconcileClerkUsers(options: ClerkMigrationOptions, rows: ClerkMigrationCsvRow[]): Promise<MigrationReport> {
    const startedAt = new Date().toISOString()
    const records: ClerkMigrationMapRecord[] = []
    const errors = validateClerkMigrationRows(rows)
    const warnings: string[] = []
    const client = options.skipClerk ? null : createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })

    if (errors.length > 0) {
        return buildReport(options, startedAt, rows.length, records, errors, warnings)
    }

    for (const row of rows) {
        const email = normalizeMigrationEmail(row.primary_email_address)
        const localUser = await findLocalUserByEmail(email)

        if (!localUser) {
            records.push({
                email,
                oldClerkId: row.id,
                newClerkId: "",
                localUserId: "",
                role: "",
                status: "",
                action: "skipped",
                needsAccessSetup: !isSupportedPasswordImport(row),
                message: "Usuário não existe no MongoDB local; pulado conforme política da migração.",
            })
            continue
        }

        if (localUser.deleted) {
            records.push({
                email,
                oldClerkId: row.id,
                newClerkId: "",
                localUserId: localUser.id,
                role: localUser.role,
                status: localUser.status,
                action: "skipped",
                needsAccessSetup: false,
                message: "Usuário local está removido logicamente; pulado para evitar reativação indevida.",
            })
            continue
        }

        if (localUser.clerkId !== row.id) {
            errors.push(`Email ${email}: User.clerkId (${localUser.clerkId}) diverge do id no CSV (${row.id}).`)
            records.push({
                email,
                oldClerkId: row.id,
                newClerkId: "",
                localUserId: localUser.id,
                role: localUser.role,
                status: localUser.status,
                action: "error",
                needsAccessSetup: !isSupportedPasswordImport(row),
                message: "Divergência entre MongoDB e CSV; revise antes de aplicar.",
            })
            continue
        }

        if (options.skipClerk) {
            records.push({
                email,
                oldClerkId: row.id,
                newClerkId: "",
                localUserId: localUser.id,
                role: localUser.role,
                status: localUser.status,
                action: "skipped",
                needsAccessSetup: !isSupportedPasswordImport(row),
                message: "Reconciliação Clerk pulada por --skip-clerk.",
            })
            continue
        }

        if (!client) throw new Error("Cliente Clerk não inicializado.")
        const existingProductionUser = await findProductionUserByEmail(client, email)

        if (existingProductionUser) {
            if (options.mode === "apply") await updateProductionUserRole(client, existingProductionUser.id, localUser.role)
            records.push({
                email,
                oldClerkId: row.id,
                newClerkId: existingProductionUser.id,
                localUserId: localUser.id,
                role: localUser.role,
                status: localUser.status,
                action: "reused",
                needsAccessSetup: false,
                message: options.mode === "apply" ? "Usuário production reutilizado e role sincronizada." : "Usuário production existente seria reutilizado.",
            })
            continue
        }

        const payload = buildClerkCreateUserPayload(row, localUser)
        if (options.mode === "dry-run") {
            records.push({
                email,
                oldClerkId: row.id,
                newClerkId: "dry-run:new-clerk-id",
                localUserId: localUser.id,
                role: localUser.role,
                status: localUser.status,
                action: "created",
                needsAccessSetup: !isSupportedPasswordImport(row),
                message: `Usuário seria criado no Clerk production${payload.passwordDigest ? " com hash de senha importado" : " sem senha importada"}.`,
            })
            continue
        }

        try {
            const createdUser = await createProductionUser(client, payload)
            records.push({
                email,
                oldClerkId: row.id,
                newClerkId: createdUser.id,
                localUserId: localUser.id,
                role: localUser.role,
                status: localUser.status,
                action: "created",
                needsAccessSetup: !isSupportedPasswordImport(row),
                message: payload.passwordDigest ? "Usuário criado com hash de senha importado." : "Usuário criado sem senha importada; exigir convite, magic link ou reset.",
            })
        } catch (error) {
            const message = error instanceof Error ? error.message : "Erro desconhecido"
            errors.push(`Email ${email}: falha ao criar usuário no Clerk production: ${message}`)
            records.push({
                email,
                oldClerkId: row.id,
                newClerkId: "",
                localUserId: localUser.id,
                role: localUser.role,
                status: localUser.status,
                action: "error",
                needsAccessSetup: !isSupportedPasswordImport(row),
                message,
            })
        }
    }

    return buildReport(options, startedAt, rows.length, records, errors, warnings)
}

async function remapMongoDb(options: ClerkMigrationOptions, records: ClerkMigrationMapRecord[]): Promise<MongoRemapReport> {
    const mappings = records.filter((record) => {
        if (record.action === "error" || record.action === "skipped" || !record.oldClerkId || !record.newClerkId) return false
        if (options.mode === "dry-run") return true
        return !record.newClerkId.startsWith("dry-run:")
    })
    const targets: MongoRemapReport["targets"] = []

    for (const target of CLERK_MIGRATION_REMAP_TARGETS) {
        let matchedCount = 0
        let modifiedCount = 0
        const collection = mongoose.connection.collection(target.collectionName)

        for (const mapping of mappings) {
            const filter = { [target.fieldName]: mapping.oldClerkId }
            if (options.mode === "dry-run" || options.skipMongoDb) {
                matchedCount += await collection.countDocuments(filter)
                continue
            }

            const result = await collection.updateMany(filter, { $set: { [target.fieldName]: mapping.newClerkId } })
            matchedCount += result.matchedCount
            modifiedCount += result.modifiedCount
        }

        targets.push({ ...target, matchedCount, modifiedCount })
    }

    return { mode: options.mode, targets }
}

function buildReport(
    options: ClerkMigrationOptions,
    startedAt: string,
    totalCsvRows: number,
    records: ClerkMigrationMapRecord[],
    errors: string[],
    warnings: string[],
): MigrationReport {
    return {
        mode: options.mode,
        startedAt,
        finishedAt: new Date().toISOString(),
        csvPath: options.csvPath,
        outDir: options.outDir,
        totalCsvRows,
        created: records.filter((record) => record.action === "created").length,
        reused: records.filter((record) => record.action === "reused").length,
        skipped: records.filter((record) => record.action === "skipped").length,
        errors,
        warnings,
        records,
    }
}

async function writeArtifacts(options: ClerkMigrationOptions, report: MigrationReport, remapReport: MongoRemapReport): Promise<void> {
    await mkdir(options.outDir, { recursive: true })
    await writeFile(path.join(options.outDir, "migration-map.csv"), toMigrationCsv(report.records), "utf8")
    await writeFile(path.join(options.outDir, "migration-report.json"), JSON.stringify(report, null, 2) + "\n", "utf8")
    await writeFile(path.join(options.outDir, "mongodb-remap-report.json"), JSON.stringify(remapReport, null, 2) + "\n", "utf8")
}

async function main(): Promise<void> {
    const options = parseOptions(process.argv.slice(2))
    assertSafeEnvironment(options)

    console.log(`Migração Clerk dev -> production (${options.mode})`)
    console.log(`CSV: ${options.csvPath}`)
    console.log(`Saída: ${options.outDir}`)

    const csvContent = await readFile(options.csvPath, "utf8")
    const rows = parseClerkMigrationCsv(csvContent)

    await connectDatabase()
    try {
        const report = await reconcileClerkUsers(options, rows)
        if (options.mode === "apply" && report.errors.length > 0) {
            const emptyRemapReport: MongoRemapReport = { mode: options.mode, targets: [] }
            await writeArtifacts(options, report, emptyRemapReport)
            throw new Error(`Migração abortada por ${report.errors.length} erro(s). Revise ${path.join(options.outDir, "migration-report.json")}.`)
        }

        const remapReport = await remapMongoDb(options, report.records)
        await writeArtifacts(options, report, remapReport)

        console.log(`Processados: ${report.totalCsvRows}`)
        console.log(`Criados: ${report.created}`)
        console.log(`Reutilizados: ${report.reused}`)
        console.log(`Pulados: ${report.skipped}`)
        console.log(`Erros: ${report.errors.length}`)
        console.log(`Artefatos gerados em ${options.outDir}`)

        if (report.errors.length > 0) process.exitCode = 1
    } finally {
        await mongoose.disconnect()
    }
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Erro desconhecido"
    console.error(`Erro fatal: ${message}`)
    process.exit(1)
})
