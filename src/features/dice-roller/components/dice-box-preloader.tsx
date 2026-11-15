"use client"

import * as React from "react"
import { preloadDiceBoxAssets } from "../dice-box-loader"

/** DND-61: agenda no boot, uma vez por documento, o aquecimento dos motores 3D dos dados (site e Owlbear). */
export function DiceBoxPreloader() {
    React.useEffect(() => {
        preloadDiceBoxAssets()
    }, [])
    return null
}
