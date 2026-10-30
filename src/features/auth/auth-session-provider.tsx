"use client"

import * as React from "react"
import { SessionProvider } from "next-auth/react"
import { PerfixProvider } from "@/features/perfix/components/PerfixProvider"

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider refetchOnWindowFocus={false}>
            <PerfixProvider>{children}</PerfixProvider>
        </SessionProvider>
    )
}
