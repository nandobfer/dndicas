"use client"

import * as React from "react"
import { NpcsTable } from "./npcs-table"

export function MonstersTable(props: React.ComponentPropsWithoutRef<typeof NpcsTable>) {
    return <NpcsTable {...props} entityType="Monstro" entityLabel="Monstro" />
}
