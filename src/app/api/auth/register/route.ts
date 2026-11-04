import { hash } from "bcryptjs"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { dbConnect } from "@/lib/db"
import { logger } from "@/lib/logger"
import { User } from "@/features/users/models/user"

const DUPLICATE_ACCOUNT_MESSAGE = "Já existe uma conta com este email ou usuário."
const DUPLICATE_KEY_ERROR = 11000
const DUPLICATE_ACCOUNT_FIELDS = ["email", "username"] as const

const registerSchema = z.object({
    username: z.string().trim().min(3, "Usuário deve ter no mínimo 3 caracteres").max(50, "Usuário muito longo").regex(/^[a-zA-Z0-9_]+$/, "Use apenas letras, números e underscore"),
    email: z.string().trim().email("Email inválido").toLowerCase(),
    name: z.string().trim().max(100, "Nome muito longo").optional().or(z.literal("")),
    password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
})

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const parsed = registerSchema.safeParse(body)

        if (!parsed.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
        }

        await dbConnect()

        const existing = await User.findOne({
            deleted: { $ne: true },
            $or: [{ email: parsed.data.email }, { username: parsed.data.username }],
        })

        if (existing) {
            return NextResponse.json({ error: DUPLICATE_ACCOUNT_MESSAGE }, { status: 409 })
        }

        const passwordHash = await hash(parsed.data.password, 12)
        const user = await User.create({
            username: parsed.data.username,
            email: parsed.data.email,
            name: parsed.data.name || undefined,
            passwordHash,
            passwordSetupRequired: false,
            roles: await (await import("@/features/perfix/server/settings")).signupRoleIds(),
            status: "active",
            deleted: false,
        })

        return NextResponse.json({ id: user._id.toString(), email: user.email, username: user.username }, { status: 201 })
    } catch (error) {
        const { DomainError } = await import("@/lib/api/route")
        if (error instanceof DomainError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status })

        // Corrida entre o `findOne` acima e o `create` (ou índice único ainda divergente):
        // o mesmo conflito que a checagem devolve como 409 não pode virar 500.
        if (duplicateAccountField(error)) {
            return NextResponse.json({ error: DUPLICATE_ACCOUNT_MESSAGE }, { status: 409 })
        }

        // Só metadados: a mensagem do E11000 carrega o valor duplicado (email) e não vai para o log.
        logger.error(
            {
                route: "auth/register",
                method: "POST",
                errorName: error instanceof Error ? error.name : typeof error,
                code: mongoErrorCode(error) ?? null,
            },
            "Falha ao criar conta",
        )
        return NextResponse.json({ error: "Erro ao criar conta" }, { status: 500 })
    }
}

/** Campo do índice único que causou o E11000, quando ele é um dos que a rota já trata como duplicidade. */
function duplicateAccountField(error: unknown): string | null {
    if (mongoErrorCode(error) !== DUPLICATE_KEY_ERROR || !error || typeof error !== "object") return null

    const { keyPattern, keyValue } = error as { keyPattern?: unknown; keyValue?: unknown }
    const fields = [
        ...Object.keys(isRecord(keyPattern) ? keyPattern : {}),
        ...Object.keys(isRecord(keyValue) ? keyValue : {}),
    ]

    return fields.find((field) => (DUPLICATE_ACCOUNT_FIELDS as readonly string[]).includes(field)) ?? null
}

function mongoErrorCode(error: unknown): unknown {
    return isRecord(error) ? error.code : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null
}
