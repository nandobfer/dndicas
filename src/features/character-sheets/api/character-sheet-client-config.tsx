"use client"

import * as React from "react"

export interface CharacterSheetClientConfig {
    apiBase: string
    getHeaders?: () => Record<string, string>
}

const DEFAULT_CONFIG: CharacterSheetClientConfig = {
    apiBase: "/api/character-sheets",
}

let currentConfig: CharacterSheetClientConfig = DEFAULT_CONFIG

export function getCharacterSheetClientConfig() {
    return currentConfig
}

export function CharacterSheetClientProvider({
    config,
    children,
}: {
    config: CharacterSheetClientConfig
    children: React.ReactNode
}) {
    currentConfig = config

    React.useEffect(() => {
        currentConfig = config

        return () => {
            currentConfig = DEFAULT_CONFIG
        }
    }, [config])

    return <>{children}</>
}
