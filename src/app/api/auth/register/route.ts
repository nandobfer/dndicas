import { hash } from "bcryptjs"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import dbConnect from "@/core/database/db"
import { User } from "@/features/users/models/user"

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
            return NextResponse.json({ error: "Já existe uma conta com este email ou usuário." }, { status: 409 })
        }

        const passwordHash = await hash(parsed.data.password, 12)
        const user = await User.create({
            username: parsed.data.username,
            email: parsed.data.email,
            name: parsed.data.name || undefined,
            passwordHash,
            passwordSetupRequired: false,
            role: "user",
            status: "active",
            deleted: false,
        })

        return NextResponse.json({ id: user._id.toString(), email: user.email, username: user.username }, { status: 201 })
    } catch (error) {
        console.error("[Auth Register] error:", error)
        const message = error instanceof Error ? error.message : "Erro desconhecido"
        return NextResponse.json({ error: "Erro ao criar conta", details: message }, { status: 500 })
    }
}
