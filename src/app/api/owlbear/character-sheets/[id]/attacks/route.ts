import { NextRequest } from "next/server"
import { getOwlbearAttacks, postOwlbearAttacks } from "@/features/owlbear/server/character-sheet-routes"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return getOwlbearAttacks(req, id)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return postOwlbearAttacks(req, id)
}
