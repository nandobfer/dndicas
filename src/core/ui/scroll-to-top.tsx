"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

export function ScrollToTop() {
  const pathname = usePathname()

  useEffect(() => {
    // Scroll to the top of the window when the pathname changes
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}
