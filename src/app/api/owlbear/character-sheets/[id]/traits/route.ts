import { NextRequest } from "next/server"
import { getOwlbearTraits, postOwlbearTraits } from "@/features/owlbear/server/character-sheet-routes"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return getOwlbearTraits(req, id)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return postOwlbearTraits(req, id)
}
