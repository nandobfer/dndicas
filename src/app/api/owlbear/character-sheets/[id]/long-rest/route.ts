import { NextRequest } from "next/server"
import { postOwlbearLongRest } from "@/features/owlbear/server/character-sheet-routes"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return postOwlbearLongRest(req, id)
}
