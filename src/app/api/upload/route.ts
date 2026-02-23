import { NextRequest, NextResponse } from "next/server"
import { uploadFile, getFileUrl, getFile } from "@/core/storage/s3"
import { auth } from "@clerk/nextjs/server"

// Max file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"]

// Force dynamic
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
    try {
        // We allow GET without auth to support public rules viewing images
        const { searchParams } = new URL(req.url)
        const key = searchParams.get("key")

        if (!key) {
            return NextResponse.json({ error: "Missing key" }, { status: 400 })
        }

        const response = await getFile(key)

        return new NextResponse(response.Body as any, {
            headers: {
                "Content-Type": response.ContentType || "application/octet-stream",
                "Cache-Control": "public, max-age=31536000, immutable",
            },
        })
    } catch (error) {
        console.error("Download error:", error)
        return NextResponse.json({ error: "File not found" }, { status: 404 })
    }
}

export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const formData = await req.formData()
        const file = formData.get("file") as File
        
        if (!file) {
            console.error("Upload error: No file provided in formData")
            return NextResponse.json({ error: "No file provided" }, { status: 400 })
        }

        if (file.size > MAX_FILE_SIZE) {
            console.error(`Upload error: File too large (${file.size} > ${MAX_FILE_SIZE})`)
            return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 })
        }

        if (!ALLOWED_TYPES.includes(file.type)) {
            console.error(`Upload error: Invalid file type (${file.type})`)
            return NextResponse.json({ error: "Invalid file type" }, { status: 400 })
        }

        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)

        // Generate a unique filename
        const filename = `rules/${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "")}`
        
        // Upload to S3
        await uploadFile(filename, buffer, file.type)
        
        // return proxy URL instead of direct S3 URL to avoid mixed content issues
        const url = `/api/upload?key=${filename}`;

        return NextResponse.json({ url })
    } catch (error) {
        console.error("Upload error:", error)
        return NextResponse.json({ error: "Upload failed" }, { status: 500 })
    }
}
