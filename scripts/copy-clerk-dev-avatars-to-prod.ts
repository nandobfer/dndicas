import dotenv from "dotenv"
import { mkdir, readFile, writeFile } from "fs/promises"
import path from "path"
import { createClerkClient } from "@clerk/backend"

const DEFAULT_MAP_PATH = "docs/clerk/migration-output/migration-map.csv"
const DEFAULT_OUT_DIR = "docs/clerk/migration-output"
const CLERK_API_BASE_URL = "https://api.clerk.com/v1"

type Mode = "dry-run" | "apply"

type Options = {
    mode: Mode
    mapPath: string
    outDir: string
    devSecretKey: string
    prodSecretKey: string
}

type MigrationMapRecord = {
    email: string
    oldClerkId: string
    newClerkId: string
    action: string
}

type AvatarCopyRecord = {
    email: string
    oldClerkId: string
    newClerkId: string
    action: "copied" | "would-copy" | "skipped" | "error"
    oldImageUrl: string
    message: string
}

dotenv.config({ path: path.resolve(process.cwd(), ".env") })
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: false })

function parseOptions(args: string[]): Options {
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
    const explicitDryRun = hasFlag("dry-run")
    if (apply && explicitDryRun) throw new Error("Use apenas um modo: --dry-run ou --apply.")

    const devSecretKey = getArgValue("dev-secret-key") ?? process.env.CLERK_DEV_SECRET_KEY ?? process.env.CLERK_SECRET_KEY ?? ""
    const prodSecretKey = getArgValue("prod-secret-key") ?? process.env.CLERK_PROD_SECRET_KEY ?? ""

    return {
        mode: apply ? "apply" : "dry-run",
        mapPath: getArgValue("map") ?? DEFAULT_MAP_PATH,
        outDir: getArgValue("out") ?? DEFAULT_OUT_DIR,
        devSecretKey,
        prodSecretKey,
    }
}

function assertOptions(options: Options): void {
    if (!options.devSecretKey.startsWith("sk_test_")) throw new Error("Informe a chave dev em CLERK_DEV_SECRET_KEY, CLERK_SECRET_KEY ou --dev-secret-key iniciando com sk_test_.")
    if (!options.prodSecretKey.startsWith("sk_live_")) throw new Error("Informe a chave production em CLERK_PROD_SECRET_KEY ou --prod-secret-key iniciando com sk_live_.")
}

function parseMigrationMap(content: string): MigrationMapRecord[] {
    const lines = content.trim().split(/\r?\n/)
    const header = parseCsvLine(lines[0] ?? "")
    const indexes = {
        email: header.indexOf("email"),
        oldClerkId: header.indexOf("oldClerkId"),
        newClerkId: header.indexOf("newClerkId"),
        action: header.indexOf("action"),
    }

    if (Object.values(indexes).some((index) => index === -1)) {
        throw new Error("migration-map.csv inválido: cabeçalhos esperados não encontrados.")
    }

    return lines.slice(1).map((line) => {
        const values = parseCsvLine(line)
        return {
            email: values[indexes.email] ?? "",
            oldClerkId: values[indexes.oldClerkId] ?? "",
            newClerkId: values[indexes.newClerkId] ?? "",
            action: values[indexes.action] ?? "",
        }
    })
}

function isDefaultClerkImage(imageUrl: string): boolean {
    return imageUrl.includes("ZGVmYXVsdC") || imageUrl.includes("type%22%3A%22default") || imageUrl.includes('"type":"default"')
}

async function downloadImage(imageUrl: string): Promise<{ blob: Blob; fileName: string }> {
    const response = await fetch(imageUrl)
    if (!response.ok) throw new Error(`Falha ao baixar imagem antiga: HTTP ${response.status}`)

    const contentType = response.headers.get("content-type") || "image/jpeg"
    const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg"
    const arrayBuffer = await response.arrayBuffer()
    return {
        blob: new Blob([arrayBuffer], { type: contentType }),
        fileName: `avatar.${extension}`,
    }
}

async function uploadProductionAvatar(prodSecretKey: string, clerkUserId: string, imageUrl: string): Promise<void> {
    try {
        await uploadProductionAvatarFromUrl(prodSecretKey, clerkUserId, imageUrl)
    } catch (error) {
        const message = error instanceof Error ? error.message : ""
        if (!message.includes("Image decode error")) throw error

        const fallbackUrl = imageUrl.includes("?") ? `${imageUrl}&height=256` : `${imageUrl}?height=256`
        await uploadProductionAvatarFromUrl(prodSecretKey, clerkUserId, fallbackUrl)
    }
}

async function uploadProductionAvatarFromUrl(prodSecretKey: string, clerkUserId: string, imageUrl: string): Promise<void> {
    const { blob, fileName } = await downloadImage(imageUrl)
    const formData = new FormData()
    formData.set("file", blob, fileName)

    const response = await fetch(`${CLERK_API_BASE_URL}/users/${clerkUserId}/profile_image`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${prodSecretKey}`,
        },
        body: formData,
    })

    if (!response.ok) {
        const body = await response.text().catch(() => "")
        throw new Error(`Falha ao enviar imagem para Clerk production: HTTP ${response.status} ${body}`.trim())
    }
}

async function copyAvatars(options: Options, map: MigrationMapRecord[]): Promise<AvatarCopyRecord[]> {
    const devClient = createClerkClient({ secretKey: options.devSecretKey })
    const records: AvatarCopyRecord[] = []

    for (const mapping of map) {
        if (!mapping.oldClerkId || !mapping.newClerkId || mapping.action === "skipped") {
            records.push({
                email: mapping.email,
                oldClerkId: mapping.oldClerkId,
                newClerkId: mapping.newClerkId,
                action: "skipped",
                oldImageUrl: "",
                message: "Registro sem par old/new Clerk ID; pulado.",
            })
            continue
        }

        try {
            const oldUser = await devClient.users.getUser(mapping.oldClerkId)
            const oldImageUrl = oldUser.imageUrl || ""

            if (!oldImageUrl || isDefaultClerkImage(oldImageUrl)) {
                records.push({
                    email: mapping.email,
                    oldClerkId: mapping.oldClerkId,
                    newClerkId: mapping.newClerkId,
                    action: "skipped",
                    oldImageUrl,
                    message: "Usuário dev não tinha imagem personalizada.",
                })
                continue
            }

            if (options.mode === "dry-run") {
                records.push({
                    email: mapping.email,
                    oldClerkId: mapping.oldClerkId,
                    newClerkId: mapping.newClerkId,
                    action: "would-copy",
                    oldImageUrl,
                    message: "Imagem personalizada seria copiada para o Clerk production.",
                })
                continue
            }

            await uploadProductionAvatar(options.prodSecretKey, mapping.newClerkId, oldImageUrl)
            records.push({
                email: mapping.email,
                oldClerkId: mapping.oldClerkId,
                newClerkId: mapping.newClerkId,
                action: "copied",
                oldImageUrl,
                message: "Imagem copiada para o Clerk production.",
            })
        } catch (error) {
            const message = error instanceof Error ? error.message : "Erro desconhecido"
            records.push({
                email: mapping.email,
                oldClerkId: mapping.oldClerkId,
                newClerkId: mapping.newClerkId,
                action: "error",
                oldImageUrl: "",
                message,
            })
        }
    }

    return records
}

async function writeReport(options: Options, records: AvatarCopyRecord[]): Promise<void> {
    await mkdir(options.outDir, { recursive: true })
    const report = {
        mode: options.mode,
        copied: records.filter((record) => record.action === "copied").length,
        wouldCopy: records.filter((record) => record.action === "would-copy").length,
        skipped: records.filter((record) => record.action === "skipped").length,
        errors: records.filter((record) => record.action === "error").length,
        records,
    }
    await writeFile(path.join(options.outDir, "avatar-copy-report.json"), JSON.stringify(report, null, 2) + "\n", "utf8")
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

async function main(): Promise<void> {
    const options = parseOptions(process.argv.slice(2))
    assertOptions(options)

    const mapContent = await readFile(options.mapPath, "utf8")
    const map = parseMigrationMap(mapContent)
    const records = await copyAvatars(options, map)
    await writeReport(options, records)

    const copied = records.filter((record) => record.action === "copied").length
    const wouldCopy = records.filter((record) => record.action === "would-copy").length
    const skipped = records.filter((record) => record.action === "skipped").length
    const errors = records.filter((record) => record.action === "error").length

    console.log(`Modo: ${options.mode}`)
    console.log(`Copiados: ${copied}`)
    console.log(`Copiariam: ${wouldCopy}`)
    console.log(`Pulados: ${skipped}`)
    console.log(`Erros: ${errors}`)
    console.log(`Relatório: ${path.join(options.outDir, "avatar-copy-report.json")}`)

    if (errors > 0) process.exitCode = 1
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Erro desconhecido"
    console.error(`Erro fatal: ${message}`)
    process.exit(1)
})
