import { getOwlbearManifestOptionsResponse, getOwlbearManifestResponse } from "@/features/owlbear/manifest"

export function OPTIONS() {
    return getOwlbearManifestOptionsResponse()
}

export function GET(request: Request) {
    return getOwlbearManifestResponse(request, "dice")
}
