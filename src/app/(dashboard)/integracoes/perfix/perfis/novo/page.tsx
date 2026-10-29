import { RolePage } from "@/features/perfix/components/RoleEditor"
import { pageAccess } from "@/features/perfix/server/page-access"
export const dynamic = "force-dynamic"
export default async function Page() { await pageAccess("roles.edit"); return <RolePage /> }
