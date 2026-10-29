import { AlarmClock, BookOpen, Brain, BrainCircuit, CalendarClock, Compass, LibraryBig, MessageSquareWarning, Paperclip, Plug, ScrollText, ShieldCheck, Wrench, type LucideIcon } from "lucide-react"
import type { OpexToolGroup } from "../constants"

export const OPEX_TOOL_GROUP_ICONS: Record<OpexToolGroup, LucideIcon> = {
    context: Compass,
    docs: BookOpen,
    catalog: LibraryBig,
    characters: ScrollText,
    "catalog-admin": ShieldCheck,
    files: Paperclip,
    jobs: AlarmClock,
    memories: Brain,
    integrations: Plug,
    routines: CalendarClock,
    "ai-settings": BrainCircuit,
    feedback: MessageSquareWarning,
}

export const toolIcon = (group: OpexToolGroup | null): LucideIcon => {
    if (!group) return Wrench
    return OPEX_TOOL_GROUP_ICONS[group] ?? Wrench
}
