import { getOwlbearIconOptionsResponse, getOwlbearIconResponse } from "@/features/owlbear/icon-routes"

export function GET() {
    return getOwlbearIconResponse("dice")
}

export function OPTIONS() {
    return getOwlbearIconOptionsResponse()
}
