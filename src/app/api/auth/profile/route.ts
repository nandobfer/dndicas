import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import dbConnect from "@/core/database/db"
import { User } from "@/features/users/models/user"
import { requireAuth } from "@/core/auth/helpers"

const updateProfileSchema = z.object({
    name: z.string().trim().max(100, "Nome muito longo").optional().or(z.literal("")),
    username: z.string().trim().min(3, "Usuário deve ter no mínimo 3 caracteres").max(50, "Usuário muito longo").regex(/^[a-zA-Z0-9_]+$/, "Use apenas letras, números e underscore").optional(),
    avatarUrl: z.string().trim().url("URL inválida").optional().or(z.literal("")),
})

export async function GET() {
    try {
        const userId = await requireAuth()
        await dbConnect()

        const user = await User.findOne({ _id: userId, deleted: { $ne: true }, status: "active" }).lean()
        if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })

        return NextResponse.json({
            id: user._id.toString(),
            name: user.name || "",
            username: user.username,
            email: user.email,
            avatarUrl: user.avatarUrl || "",
            role: user.role,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro desconhecido"
        const status = message === "UNAUTHORIZED" ? 401 : 500
        return NextResponse.json({ error: status === 401 ? "Não autorizado" : "Erro ao carregar perfil" }, { status })
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const userId = await requireAuth()
        const body = await request.json()
        const parsed = updateProfileSchema.safeParse(body)

        if (!parsed.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
        }

        await dbConnect()

        if (parsed.data.username) {
            const existingUsername = await User.findOne({ _id: { $ne: userId }, username: parsed.data.username, deleted: { $ne: true } })
            if (existingUsername) return NextResponse.json({ error: "Este usuário já está em uso." }, { status: 409 })
        }

        const user = await User.findOne({ _id: userId, deleted: { $ne: true }, status: "active" })
        if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })

        if (parsed.data.name !== undefined) user.name = parsed.data.name || undefined
        if (parsed.data.username) user.username = parsed.data.username
        if (parsed.data.avatarUrl !== undefined) user.avatarUrl = parsed.data.avatarUrl || undefined
        await user.save()

        return NextResponse.json({
            id: user._id.toString(),
            name: user.name || "",
            username: user.username,
            email: user.email,
            avatarUrl: user.avatarUrl || "",
            role: user.role,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro desconhecido"
        const status = message === "UNAUTHORIZED" ? 401 : 500
        return NextResponse.json({ error: status === 401 ? "Não autorizado" : "Erro ao atualizar perfil" }, { status })
    }
}
