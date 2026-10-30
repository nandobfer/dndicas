"use client"

import { useEffect, useRef } from "react"
import { motion } from "framer-motion"
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Markdown } from "@/components/ui/opex/markdown"
import { cn } from "@/lib/utils"
import type { MaddoxInterviewMessageDto } from "../../interview-types"
import { MemberAvatar } from "../campaigns/campaign-visuals"

interface Props {
    messages: MaddoxInterviewMessageDto[]
    /** Resposta do Maddox chegando agora (`null` = nenhuma). */
    liveText: string | null
    maddoxAvatarUrl: string | null
    color: string
    userName: string
    userAvatarUrl: string | null
    onRetry?: () => void
    retrying?: boolean
}

/** Conversa da entrevista: Maddox à esquerda (avatar, Markdown), a pessoa entrevistada à direita. */
export function InterviewMessageList({ messages, liveText, maddoxAvatarUrl, color, userName, userAvatarUrl, onRetry, retrying }: Props) {
    const endRef = useRef<HTMLDivElement>(null)
    const lastIndex = messages.length - 1

    useEffect(() => {
        endRef.current?.scrollIntoView?.({ block: "end" })
    }, [messages.length, liveText])

    return (
        <ol className="space-y-4" aria-label="Conversa com o Maddox" aria-live="polite">
            {messages.map((message, index) =>
                message.role === "maddox" ? (
                    <MaddoxBubble key={message.id} avatarUrl={maddoxAvatarUrl} color={color}>
                        {message.error ? (
                            <div role="alert" className="space-y-2">
                                <p className="flex items-start gap-2 text-sm text-amber-200">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />O Maddox não conseguiu responder: {message.error}
                                </p>
                                {index === lastIndex && onRetry && (
                                    <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
                                        {retrying ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />} Tentar de novo
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <Markdown lineAction={null}>{message.content}</Markdown>
                        )}
                    </MaddoxBubble>
                ) : (
                    <motion.li key={message.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end gap-3">
                        <div className="max-w-[85%] rounded-2xl rounded-tr-sm border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm whitespace-pre-wrap text-white">{message.content}</div>
                        <MemberAvatar name={userName} imageUrl={userAvatarUrl} className="h-8 w-8 shrink-0" />
                    </motion.li>
                ),
            )}
            {liveText !== null && (
                <MaddoxBubble avatarUrl={maddoxAvatarUrl} color={color} live>
                    {liveText ? (
                        <Markdown lineAction={null}>{liveText}</Markdown>
                    ) : (
                        <p className="flex items-center gap-2 text-sm text-white/60">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Maddox está escrevendo…
                        </p>
                    )}
                </MaddoxBubble>
            )}
            <div ref={endRef} />
        </ol>
    )
}

function MaddoxBubble({ avatarUrl, color, live, children }: { avatarUrl: string | null; color: string; live?: boolean; children: React.ReactNode }) {
    return (
        <motion.li initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3" data-live={live ? "true" : undefined}>
            <MemberAvatar name="Maddox" imageUrl={avatarUrl} color={color} className="h-9 w-9 shrink-0" />
            <div className={cn("min-w-0 max-w-[85%] rounded-2xl rounded-tl-sm border px-4 py-3")} style={{ borderColor: `${color}40`, backgroundColor: `${color}0f` }}>
                <p className="mb-1 text-xs font-semibold" style={{ color }}>
                    Maddox
                </p>
                {children}
            </div>
        </motion.li>
    )
}
