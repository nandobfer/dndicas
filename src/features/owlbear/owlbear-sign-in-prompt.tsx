"use client"

import Link from "next/link"
import { ExternalLink, ScrollText } from "lucide-react"

interface OwlbearSignInPromptProps {
    title: string
    description: string
}

export function OwlbearSignInPrompt({ title, description }: OwlbearSignInPromptProps) {
    return (
        <div className="h-full min-h-0 overflow-auto pr-1">
            <div className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center gap-5 py-4">
                <div className="rounded-3xl border border-white/10 bg-black/20 p-4 text-center shadow-2xl shadow-black/20 backdrop-blur-xl">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-300/20 bg-violet-500/15 text-violet-200">
                        <ScrollText className="h-5 w-5" />
                    </div>
                    <h2 className="mt-4 text-xl font-bold text-white">{title}</h2>
                    <p className="mt-2 text-sm leading-6 text-white/60">{description}</p>
                    <div className="mt-5 flex justify-center">
                        <Link
                            href="/sign-in"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-white/20 active:scale-95"
                        >
                            <ExternalLink className="h-4 w-4" />
                            Abrir login
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}
