"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/core/utils"

interface FeedbackMarkdownProps {
    children: string
    compact?: boolean
    className?: string
}

export function FeedbackMarkdown({ children, compact, className }: FeedbackMarkdownProps) {
    return (
        <div className={cn("min-w-0 max-w-full overflow-hidden text-sm leading-relaxed text-white/75", compact && "text-xs leading-relaxed", className)}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    h1: ({ children: nodeChildren }) => <h1 className="mb-3 mt-5 text-xl font-bold tracking-tight text-white first:mt-0">{nodeChildren}</h1>,
                    h2: ({ children: nodeChildren }) => <h2 className="mb-2.5 mt-5 border-b border-white/10 pb-1.5 text-lg font-semibold tracking-tight text-white first:mt-0">{nodeChildren}</h2>,
                    h3: ({ children: nodeChildren }) => <h3 className="mb-2 mt-4 text-base font-semibold text-white/90 first:mt-0">{nodeChildren}</h3>,
                    h4: ({ children: nodeChildren }) => <h4 className="mb-1.5 mt-3 text-sm font-semibold text-white/85 first:mt-0">{nodeChildren}</h4>,
                    p: ({ children: nodeChildren }) => <p className="my-2 first:mt-0 last:mb-0">{nodeChildren}</p>,
                    ul: ({ children: nodeChildren }) => <ul className="my-2 list-disc space-y-1 pl-5 first:mt-0 last:mb-0">{nodeChildren}</ul>,
                    ol: ({ children: nodeChildren }) => <ol className="my-2 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0">{nodeChildren}</ol>,
                    li: ({ children: nodeChildren }) => <li className="pl-1 marker:text-blue-300/70">{nodeChildren}</li>,
                    blockquote: ({ children: nodeChildren }) => <blockquote className="my-3 border-l-2 border-blue-300/40 bg-blue-500/10 py-2 pl-3 text-white/70">{nodeChildren}</blockquote>,
                    hr: () => <hr className="my-5 border-white/10" />,
                    a: ({ children: nodeChildren, href }) => (
                        <a href={href} target="_blank" rel="noreferrer" className="text-blue-300 underline decoration-blue-300/40 underline-offset-4 transition-colors hover:text-blue-200">
                            {nodeChildren}
                        </a>
                    ),
                    code: ({ children: nodeChildren, className: codeClassName }) => {
                        const isBlock = Boolean(codeClassName)
                        if (isBlock) {
                            return <code className={cn("block min-w-0 whitespace-pre text-xs leading-relaxed text-blue-100", codeClassName)}>{nodeChildren}</code>
                        }

                        return <code className="rounded-md border border-white/10 bg-white/10 px-1.5 py-0.5 text-[0.85em] text-blue-100">{nodeChildren}</code>
                    },
                    pre: ({ children: nodeChildren }) => <pre className="my-3 max-w-full overflow-x-auto rounded-lg border border-white/10 bg-black/35 p-3 shadow-inner shadow-black/20">{nodeChildren}</pre>,
                    table: ({ children: nodeChildren }) => (
                        <div className="my-3 max-w-full overflow-x-auto rounded-lg border border-white/10">
                            <table className="min-w-full border-collapse text-left text-xs">{nodeChildren}</table>
                        </div>
                    ),
                    thead: ({ children: nodeChildren }) => <thead className="bg-white/10 text-white">{nodeChildren}</thead>,
                    tbody: ({ children: nodeChildren }) => <tbody className="divide-y divide-white/10">{nodeChildren}</tbody>,
                    tr: ({ children: nodeChildren }) => <tr className="divide-x divide-white/10">{nodeChildren}</tr>,
                    th: ({ children: nodeChildren }) => <th className="px-3 py-2 font-semibold text-white/85">{nodeChildren}</th>,
                    td: ({ children: nodeChildren }) => <td className="px-3 py-2 align-top text-white/70">{nodeChildren}</td>,
                    input: ({ checked, type }) => {
                        if (type !== "checkbox") return null
                        return <input type="checkbox" checked={checked} readOnly className="mr-2 align-middle accent-blue-400" />
                    },
                }}
            >
                {children}
            </ReactMarkdown>
        </div>
    )
}
