import { NextRequest, NextResponse } from "next/server"
import { auth, currentUser } from "@clerk/nextjs/server"
import { getClassById, updateClass, deleteClass } from "@/features/classes/api/classes-service"
import { updateClassSchema } from "@/features/classes/api/validation"

/**
 * GET /api/classes/[id]
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const { userId } = await auth()
        const user = userId ? await currentUser() : null
        const isAdmin = user?.publicMetadata?.role === "admin"

        const doc = await getClassById(id, isAdmin)
        if (!doc) return NextResponse.json({ error: "Classe não encontrada" }, { status: 404 })

        return NextResponse.json(doc)
    } catch (error) {
        console.error("[API] GET /api/classes/[id] error:", error)
        if (error instanceof Error && error.name === "CastError") {
            return NextResponse.json({ error: "Formato de ID inválido" }, { status: 400 })
        }
        return NextResponse.json({ error: "Erro ao buscar classe" }, { status: 500 })
    }
}

/**
 * PUT /api/classes/[id]
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

        const user = await currentUser()
        if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })

        const isAdmin = user.publicMetadata?.role === "admin"
        if (!isAdmin) return NextResponse.json({ error: "Acesso negado. Apenas administradores podem editar classes." }, { status: 403 })

        const { id } = await params

        let body
        try {
            body = await req.json()
        } catch {
            return NextResponse.json({ error: "Corpo da requisição inválido (JSON malformado)" }, { status: 400 })
        }

        const validation = updateClassSchema.safeParse(body)
        if (!validation.success) {
            return NextResponse.json({ error: "Dados de validação falharam", details: validation.error.flatten() }, { status: 400 })
        }

        const updated = await updateClass(id, validation.data as any, userId)
        return NextResponse.json(updated)
    } catch (error) {
        console.error("[API] PUT /api/classes/[id] error:", error)
        if (error instanceof Error && error.name === "CastError") {
            return NextResponse.json({ error: "Formato de ID inválido" }, { status: 400 })
        }
        if (error instanceof Error && error.message.includes("já existe")) {
            return NextResponse.json({ error: error.message }, { status: 409 })
        }
        if (error instanceof Error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }
        return NextResponse.json({ error: "Erro ao atualizar classe" }, { status: 500 })
    }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    return PUT(req, { params })
}

/**
 * DELETE /api/classes/[id]
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

        const user = await currentUser()
        if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })

        const isAdmin = user.publicMetadata?.role === "admin"
        if (!isAdmin) return NextResponse.json({ error: "Acesso negado. Apenas administradores podem excluir classes." }, { status: 403 })

        const { id } = await params
        await deleteClass(id, userId)

        return NextResponse.json({ message: "Classe excluída com sucesso" })
    } catch (error) {
        console.error("[API] DELETE /api/classes/[id] error:", error)
        if (error instanceof Error && error.name === "CastError") {
            return NextResponse.json({ error: "Formato de ID inválido" }, { status: 400 })
        }
        if (error instanceof Error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }
        return NextResponse.json({ error: "Erro ao excluir classe" }, { status: 500 })
    }
}
