import { NextRequest } from "next/server"
import { getOwlbearRoomNpcs, postOwlbearRoomNpc } from "@/features/owlbear/server/room-npc-routes"

export async function GET(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
    const { roomId } = await params
    return getOwlbearRoomNpcs(req, roomId)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
    const { roomId } = await params
    return postOwlbearRoomNpc(req, roomId)
}
