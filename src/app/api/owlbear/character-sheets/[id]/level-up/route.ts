import { NextRequest } from "next/server"
import { getOwlbearLevelUp, postOwlbearLevelUp } from "@/features/owlbear/server/character-sheet-routes"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return getOwlbearLevelUp(req, id)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return postOwlbearLevelUp(req, id)
}
