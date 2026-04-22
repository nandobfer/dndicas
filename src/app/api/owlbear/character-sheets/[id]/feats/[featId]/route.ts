import { NextRequest } from "next/server"
import { deleteOwlbearFeat } from "@/features/owlbear/server/character-sheet-routes"

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; featId: string }> }) {
    const { id, featId } = await params
    return deleteOwlbearFeat(req, id, featId)
}
