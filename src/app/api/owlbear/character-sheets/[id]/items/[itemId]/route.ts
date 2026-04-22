import { NextRequest } from "next/server"
import { deleteOwlbearItem, patchOwlbearItem } from "@/features/owlbear/server/character-sheet-routes"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
    const { id, itemId } = await params
    return patchOwlbearItem(req, id, itemId)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
    const { id, itemId } = await params
    return deleteOwlbearItem(req, id, itemId)
}
