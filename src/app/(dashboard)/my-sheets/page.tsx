"use client"

import { useRouter } from "next/navigation"
import { MySheetsContent } from "./_components/my-sheets-content"

export default function MySheetsPage() {
    const router = useRouter()

    return (
        <MySheetsContent
            onSheetOpen={(sheet) => {
                router.push(`/sheets/${sheet.slug}`)
            }}
            onSheetCreated={(sheet) => {
                router.push(`/sheets/${sheet.slug}`)
            }}
        />
    )
}
