import type { ReactNode } from "react"
import { pageAccess } from "@/features/perfix/server/page-access"
export default async function Layout({ children }: { children: ReactNode }) { await pageAccess("mentions.review"); return children }
