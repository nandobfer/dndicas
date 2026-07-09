"use client"

import OBR from "@owlbear-rodeo/sdk"
import type { OwlbearSdkLike } from "./types"

// Keep this as a static import in the client bundle. The Owlbear SDK registers
// its postMessage listener during module evaluation and can miss OBR_READY if
// loaded later from a React effect or async import.
export const preloadedOwlbearSdk = OBR as OwlbearSdkLike
