import { RolePage } from "@/features/perfix/components/RoleEditor"
import { pageAccess } from "@/features/perfix/server/page-access"
export const dynamic = "force-dynamic"
export default async function Page({ params }: { params: Promise<{ id: string }> }) { await pageAccess("roles.view"); return <RolePage id={(await params).id} /> }
