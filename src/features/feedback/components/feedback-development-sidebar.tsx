"use client"

import { ExternalLink, GitBranch, RadioTower, Server, Bot } from "lucide-react"
import type { Feedback } from "../types/feedback.types"
import { FeedbackDevelopmentStatusBadge } from "./feedback-development-status-badge"

function SidebarRow({ icon: Icon, label, value, href }: { icon: typeof Bot; label: string; value?: string | number; href?: string }) {
    return (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/35">
                <Icon className="h-3.5 w-3.5" />
                {label}
            </div>
            {href && value ? (
                <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-xs text-blue-300 hover:text-blue-200">
                    {value}
                    <ExternalLink className="h-3 w-3" />
                </a>
            ) : (
                <p className="break-all text-xs text-white/70">{value || "Não definido"}</p>
            )}
        </div>
    )
}

export function FeedbackDevelopmentSidebar({ feedback }: { feedback: Feedback }) {
    return (
        <aside className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/35">Status de desenvolvimento</p>
                <FeedbackDevelopmentStatusBadge status={feedback.developmentStatus} />
            </div>
            <SidebarRow icon={Bot} label="Modelo" value={feedback.selectedModel} />
            <SidebarRow icon={RadioTower} label="Sessão OpenCode" value={feedback.opencodeSessionId} />
            <SidebarRow icon={GitBranch} label="Branch" value={feedback.branchName} />
            <SidebarRow icon={GitBranch} label="Pull request" value={feedback.pullRequestUrl || (feedback.pullRequestNumber ? `#${feedback.pullRequestNumber}` : undefined)} href={feedback.pullRequestUrl} />
            <SidebarRow icon={Server} label="Preview" value={feedback.previewUrl} href={feedback.previewUrl} />
        </aside>
    )
}
