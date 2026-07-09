import { getOwlbearIconOptionsResponse, getOwlbearIconResponse } from "@/features/owlbear/icon-routes"

export function GET() {
    return getOwlbearIconResponse("catalog")
}

export function OPTIONS() {
    return getOwlbearIconOptionsResponse()
}
