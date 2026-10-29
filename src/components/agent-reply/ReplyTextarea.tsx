"use client"

import { forwardRef, useCallback, useRef } from "react"
import { Textarea, type TextareaProps } from "@/components/ui/opex/textarea"
import { REPLY_PRIORITY, useReplyTarget } from "./ReplyTargetProvider"

interface ReplyTextareaProps extends Omit<TextareaProps, "value"> {
    value: string
    /** Recebe o texto com a citação inserida (o `onChange` comum continua valendo para a digitação). */
    onValueChange: (value: string) => void
    replyPriority?: number
    /** `false` tira o campo da lista de destinos (ex.: desabilitado). */
    replyEnabled?: boolean
}

/** `Textarea` que também recebe as citações de linha das saídas de IA (`ReplyTargetProvider`). */
export const ReplyTextarea = forwardRef<HTMLTextAreaElement, ReplyTextareaProps>(function ReplyTextarea({ value, onValueChange, replyPriority = REPLY_PRIORITY.message, replyEnabled = true, onChange, ...props }, forwarded) {
    const ref = useRef<HTMLTextAreaElement | null>(null)
    const setRefs = useCallback(
        (element: HTMLTextAreaElement | null) => {
            ref.current = element
            if (typeof forwarded === "function") forwarded(element)
            else if (forwarded) forwarded.current = element
        },
        [forwarded],
    )
    useReplyTarget({ ref, value, setValue: onValueChange, priority: replyPriority, enabled: replyEnabled && !props.disabled })
    return (
        <Textarea
            ref={setRefs}
            value={value}
            onChange={(event) => {
                onChange?.(event)
                onValueChange(event.target.value)
            }}
            {...props}
        />
    )
})
