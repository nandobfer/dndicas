"use client"

import * as React from "react"
import { SessionProvider } from "next-auth/react"

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider refetchOnWindowFocus={false}>
            {children}
        </SessionProvider>
    )
}
