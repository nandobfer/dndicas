"use client"

/**
 * @fileoverview Componente do usuário no header: avatar (com nome e versão a partir de `lg`) e menu
 * Perfil / Feedback / Sair. Visitante vê "Entrar / Cadastrar" (só o ícone abaixo de `lg`).
 */

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronDown, LogOut, MessageSquare, User } from "lucide-react"
import { cn } from "@/core/utils"
import { useAuth } from "@/core/hooks/useAuth"
import { APP_VERSION } from "@/lib/config/version"
import {
    GlassDropdownMenu,
    GlassDropdownMenuContent,
    GlassDropdownMenuItem,
    GlassDropdownMenuSeparator,
    GlassDropdownMenuTrigger,
} from "./glass-dropdown-menu"

export function UserAvatar({ imageUrl, name, className }: { imageUrl: string | null; name: string; className?: string }) {
    return (
        <span className={cn("flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/10 text-white/70", className)}>
            {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt={name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            ) : (
                <User className="h-4 w-4" aria-hidden />
            )}
        </span>
    )
}

export function HeaderUserMenu() {
    const router = useRouter()
    const { isLoaded, isSignedIn, fullName, email, imageUrl, signOut } = useAuth()
    const [isSigningOut, setIsSigningOut] = React.useState(false)
    const displayName = fullName || email || "Usuário"

    const handleSignOut = async () => {
        if (isSigningOut) return
        setIsSigningOut(true)
        try {
            await signOut("/sign-in")
            router.replace("/sign-in")
            router.refresh()
        } finally {
            setIsSigningOut(false)
        }
    }

    if (!isLoaded && !isSignedIn) {
        return <span className="h-8 w-8 rounded-full border border-white/10 bg-white/5" aria-hidden />
    }

    if (!isSignedIn) {
        return (
            <Link
                href="/sign-in"
                aria-label="Entrar / Cadastrar"
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 lg:px-4"
            >
                <User className="h-4 w-4" aria-hidden />
                <span className="hidden lg:inline">Entrar / Cadastrar</span>
            </Link>
        )
    }

    return (
        <GlassDropdownMenu modal={false}>
            <GlassDropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label={`Menu do usuário: ${displayName}`}
                    title={displayName}
                    className="flex min-w-0 items-center gap-3 rounded-full p-1 text-left transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 data-[state=open]:bg-white/10 lg:rounded-xl lg:py-1.5 lg:pl-1.5 lg:pr-3"
                >
                    <UserAvatar imageUrl={imageUrl} name={displayName} />
                    <span className="hidden min-w-0 max-w-[180px] flex-col lg:flex" data-testid="header-user-details">
                        <span className="truncate text-sm font-medium text-white">{displayName}</span>
                        <span className="mt-0.5 text-[10px] font-mono uppercase tracking-wider text-white/30">{APP_VERSION}</span>
                    </span>
                    <ChevronDown className="hidden h-4 w-4 text-white/40 lg:block" aria-hidden />
                </button>
            </GlassDropdownMenuTrigger>
            <GlassDropdownMenuContent align="end" sideOffset={8} className="z-[60] min-w-[200px]">
                <GlassDropdownMenuItem asChild>
                    <Link href="/profile">
                        <User aria-hidden />
                        Perfil
                    </Link>
                </GlassDropdownMenuItem>
                <GlassDropdownMenuItem asChild>
                    <Link href="/feedback">
                        <MessageSquare aria-hidden />
                        Feedback
                    </Link>
                </GlassDropdownMenuItem>
                <GlassDropdownMenuSeparator />
                <GlassDropdownMenuItem
                    disabled={isSigningOut}
                    className="hover:text-red-300 focus:text-red-300"
                    onSelect={(event) => {
                        event.preventDefault()
                        void handleSignOut()
                    }}
                >
                    <LogOut aria-hidden />
                    {isSigningOut ? "Saindo..." : "Sair"}
                </GlassDropdownMenuItem>
            </GlassDropdownMenuContent>
        </GlassDropdownMenu>
    )
}
