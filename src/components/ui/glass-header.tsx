"use client"

import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs"
import { Menu, User } from "lucide-react"
import Link from "next/link"
import { Button } from "@/core/ui/button"

interface GlassHeaderProps {
    onExpand: () => void
    title?: string
}

/**
 * Mobile-only Header with Liquid Glass effect.
 * Features a sidebar toggle, application title, and Clerk UserButton.
 */
export function GlassHeader({ onExpand, title = "Dungeons & Dicas" }: GlassHeaderProps) {
    return (
        <header className="md:hidden fixed top-0 left-0 right-0 h-16 z-30 bg-black/40 backdrop-blur-sm border-b border-white/10 flex items-center justify-between px-4">
            <div className="flex items-center gap-3">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onExpand}
                    className="text-white/70 hover:text-white hover:bg-white/5 h-10 w-10 rounded-full"
                >
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Abrir menu</span>
                </Button>
                <span className="text-sm font-bold text-white tracking-widest uppercase truncate">{title}</span>
            </div>

            <div className="flex items-center">
                <SignedIn>
                    <UserButton
                        afterSignOutUrl="/"
                        appearance={{
                            elements: {
                                userButtonAvatarBox: "h-8 w-8 border border-white/10 shadow-lg",
                                userButtonTrigger: "focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                            }
                        }}
                    />
                </SignedIn>
                <SignedOut>
                    <Link href="/sign-in">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-white/70 hover:text-white h-9 w-9 rounded-full bg-white/5 border border-white/10"
                        >
                            <User className="h-4 w-4" />
                        </Button>
                    </Link>
                </SignedOut>
            </div>
        </header>
    )
}
