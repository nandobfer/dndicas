import { NextRequest } from "next/server"
import { getOwlbearRoomUserNpcs, postOwlbearRoomUserNpc } from "@/features/owlbear/server/room-npc-routes"

export async function GET(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
    const { roomId } = await params
    return getOwlbearRoomUserNpcs(req, roomId)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
    const { roomId } = await params
    return postOwlbearRoomUserNpc(req, roomId)
}
