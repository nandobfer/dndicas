"use client"

import { useState } from "react"
import { Send } from "lucide-react"
import { Button } from "@/core/ui/button"
import { Textarea } from "@/core/ui/textarea"

export function FeedbackCommentComposer({ submitAction, isSubmitting }: { submitAction: (message: string) => Promise<void>; isSubmitting?: boolean }) {
    const [message, setMessage] = useState("")

    async function handleSubmit(event: { preventDefault: () => void }) {
        event.preventDefault()
        const trimmed = message.trim()
        if (!trimmed) return

        await submitAction(trimmed)
        setMessage("")
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <Textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Escreva um comentário ou detalhe adicional..."
                className="min-h-[110px] border-white/10 bg-white/5 text-white placeholder:text-white/30"
                disabled={isSubmitting}
            />
            <div className="flex justify-end">
                <Button type="submit" disabled={isSubmitting || !message.trim()} className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Send className="mr-2 h-4 w-4" />
                    {isSubmitting ? "Enviando..." : "Comentar"}
                </Button>
            </div>
        </form>
    )
}
