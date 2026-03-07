import { NextRequest, NextResponse } from "next/server"
import { auth, currentUser } from "@clerk/nextjs/server"
import { listClasses, createClass } from "@/features/classes/api/classes-service"
import { classesQuerySchema, createClassSchema } from "@/features/classes/api/validation"
import type { ClassesFilters, HitDiceType } from "@/features/classes/types/classes.types"

/**
 * GET /api/classes
 * List classes with filters and pagination
 */
export async function GET(req: NextRequest) {
    try {
        const { userId } = await auth()
        const user = userId ? await currentUser() : null
        const isAdmin = user?.publicMetadata?.role === "admin"

        const url = new URL(req.url)

        const queryParams = {
            search: url.searchParams.get("search") || undefined,
            hitDice: url.searchParams.get("hitDice")?.split(",").filter(Boolean) as HitDiceType[] | undefined,
            spellcasting:
                url.searchParams
                    .get("spellcasting")
                    ?.split(",")
                    .filter(Boolean)
                    .map((v) => v === "true") || undefined,
            status: (url.searchParams.get("status") || undefined) as "active" | "inactive" | "all" | undefined,
            page: parseInt(url.searchParams.get("page") || "1", 10),
            limit: parseInt(url.searchParams.get("limit") || "10", 10),
        }

        const validation = classesQuerySchema.safeParse(queryParams)

        if (!validation.success) {
            return NextResponse.json({ error: "Parâmetros de consulta inválidos", details: validation.error.flatten() }, { status: 400 })
        }

        const { page, limit, ...filters } = validation.data
        const result = await listClasses(filters as ClassesFilters, page || 1, limit || 10, true)

        return NextResponse.json(result)
    } catch (error) {
        console.error("[API] GET /api/classes error:", error)
        return NextResponse.json({ error: "Erro ao listar classes" }, { status: 500 })
    }
}

/**
 * POST /api/classes
 * Create a new class (admin only)
 */
export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth()

        if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

        const user = await currentUser()
        if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })

        const isAdmin = user.publicMetadata?.role === "admin"
        if (!isAdmin) return NextResponse.json({ error: "Acesso negado. Apenas administradores podem criar classes." }, { status: 403 })

        let body
        try {
            body = await req.json()
        } catch {
            return NextResponse.json({ error: "Corpo da requisição inválido (JSON malformado)" }, { status: 400 })
        }

        const validation = createClassSchema.safeParse(body)
        if (!validation.success) {
            return NextResponse.json(
                { error: "Dados de validação falharam", details: validation.error.flatten() },
                { status: 400 }
            )
        }

        const newClass = await createClass(validation.data as any, userId)
        return NextResponse.json(newClass, { status: 201 })
    } catch (error) {
        console.error("[API] POST /api/classes error:", error)

        if (error instanceof Error && error.message.includes("já existe")) {
            return NextResponse.json({ error: error.message }, { status: 409 })
        }

        if (error instanceof Error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ error: "Erro ao criar classe" }, { status: 500 })
    }
}
