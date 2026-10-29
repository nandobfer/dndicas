import { PerfixEditorForm } from "@/features/perfix/components/PerfixEditorForm"
import { pageAccess } from "@/features/perfix/server/page-access"
export const dynamic = "force-dynamic"
export default async function Page() { await pageAccess("integrations.perfix.view"); return <PerfixEditorForm /> }
