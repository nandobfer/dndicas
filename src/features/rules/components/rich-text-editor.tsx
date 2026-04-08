"use client"

import { useEditor, EditorContent, type Editor, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react"
import StarterKit from '@tiptap/starter-kit'
import ImageExtension from "@tiptap/extension-image"
import Placeholder from '@tiptap/extension-placeholder'
import Mention from "@tiptap/extension-mention"
import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/core/utils'
import { Button } from '@/core/ui/button'
import { glassConfig } from "@/lib/config/glass-config"
import { Bold, Italic, Strikethrough, List, ListOrdered, Undo, Redo, Image as ImageIcon } from "lucide-react"
import { getSuggestionConfig } from "../utils/suggestion"
import { Extension, Node, InputRule } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { GlassDiceValue } from "@/components/ui/glass-dice-value"
import type { DiceType } from "@/features/spells/types/spells.types"
import { diceFuse, DICE_LOOKAHEAD_REGEX } from "../utils/dice-render-utils"

// ─── Dice Highlight Extension ────────────────────────────────────────────────
// Colors plain-text dice notation and damage-type phrases.
// Acts as backward-compat for existing content (plain text "2d6").
// Newly typed dice are handled by DiceValueNode (below).
const diceHighlightKey = new PluginKey("diceHighlight")

const DiceHighlight = Extension.create({
    name: "diceHighlight",
    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: diceHighlightKey,
                props: {
                    decorations(state) {
                        const decorations: Decoration[] = []
                        const DICE_REGEX = /(\d+)d(4|6|8|10|12|20|100)/gi
                        const DAMAGE_REGEX = /(?:pontos de dano|de dano) (?:de )?([a-zA-Záàâãéèêíïóôõöúçñ]+)/gi

                        let lastDiceAtomEndPos = -1

                        state.doc.descendants((node, pos) => {
                            // Track DiceValueNode atoms so we can color following text
                            if ((node as any).type?.name === "diceValue") {
                                lastDiceAtomEndPos = pos + node.nodeSize
                                return
                            }

                            if (!node.isText || !node.text) return
                            const text = node.text

                            // ── Damage type text immediately after a DiceValueNode atom ──
                            if (lastDiceAtomEndPos >= 0 && pos === lastDiceAtomEndPos) {
                                lastDiceAtomEndPos = -1

                                // Try "de dano X" prefix first
                                const deDanoMatch = /^(\s*(?:pontos de dano|de dano) (?:de )?([a-záàâãéèêíïóôõöúçñ]+))/i.exec(text)
                                if (deDanoMatch) {
                                    const fuseResult = diceFuse.search(deDanoMatch[2])
                                    if (fuseResult.length > 0) {
                                        decorations.push(
                                            Decoration.inline(pos, pos + deDanoMatch[1].length, {
                                                style: `color: ${fuseResult[0].item.hex}; font-weight: 500;`,
                                                class: "damage-type-notation",
                                            })
                                        )
                                    }
                                } else {
                                    // Try standalone damage type word at start of text
                                    const wordMatch = /^(\s*)([a-záàâãéèêíïóôõöúçñ]{4,})/i.exec(text)
                                    if (wordMatch) {
                                        const fuseResult = diceFuse.search(wordMatch[2])
                                        if (fuseResult.length > 0) {
                                            const wordStart = wordMatch[1].length
                                            decorations.push(
                                                Decoration.inline(pos + wordStart, pos + wordStart + wordMatch[2].length, {
                                                    style: `color: ${fuseResult[0].item.hex}; font-weight: 600;`,
                                                    class: "damage-type-notation",
                                                })
                                            )
                                        }
                                    }
                                }
                            } else {
                                lastDiceAtomEndPos = -1
                            }

                            // ── Dice notation coloring ──────────────────────
                            DICE_REGEX.lastIndex = 0
                            let match: RegExpExecArray | null
                            while ((match = DICE_REGEX.exec(text)) !== null) {
                                const from = pos + match.index
                                const to = from + match[0].length
                                const remainingText = text.substring(DICE_REGEX.lastIndex)
                                const nextNaturalMatch = DICE_LOOKAHEAD_REGEX.exec(remainingText)

                                let colorHex = "#a78bfa"
                                if (nextNaturalMatch) {
                                    const fuseResult = diceFuse.search(nextNaturalMatch[1])
                                    if (fuseResult.length > 0) colorHex = fuseResult[0].item.hex
                                } else {
                                    const ctxAfter = text.substring(match.index + match[0].length, match.index + match[0].length + 40)
                                    const words = ctxAfter.match(/[a-záàâãéèêíïóôõöúçñ]+/gi) ?? []
                                    for (const word of words) {
                                        const result = diceFuse.search(word)
                                        if (result.length > 0) { colorHex = result[0].item.hex; break }
                                    }
                                }

                                decorations.push(
                                    Decoration.inline(from, to, {
                                        style: `color: ${colorHex}; font-weight: 700;`,
                                        class: "dice-notation",
                                    })
                                )
                            }

                            // ── Damage type text coloring ───────────────────
                            DAMAGE_REGEX.lastIndex = 0
                            while ((match = DAMAGE_REGEX.exec(text)) !== null) {
                                const fuseResult = diceFuse.search(match[1])
                                if (fuseResult.length === 0) continue
                                const colorHex = fuseResult[0].item.hex
                                const from = pos + match.index
                                const to = from + match[0].length
                                decorations.push(
                                    Decoration.inline(from, to, {
                                        style: `color: ${colorHex}; font-weight: 500;`,
                                        class: "damage-type-notation",
                                    })
                                )
                            }
                        })

                        return DecorationSet.create(state.doc, decorations)
                    },
                },
            }),
        ]
    },
})

// ─── DiceValueNode ────────────────────────────────────────────────────────────
// Inline atom node that renders GlassDiceValue for newly typed dice notation.
const DICE_INPUT_RULE_REGEX = /(\d+)d(4|6|8|10|12|20|100)$/

const DiceNodeView = (props: { node: { attrs: { qty: number; faces: number; colorHex?: string | null } } }) => {
    const { qty, faces, colorHex } = props.node.attrs
    const tipo = `d${faces}` as DiceType
    const colorOverride = colorHex ? { text: colorHex } : undefined
    return (
        <NodeViewWrapper className="inline-block align-middle">
            <GlassDiceValue value={{ quantidade: qty, tipo }} colorOverride={colorOverride} className="mx-0.5" />
        </NodeViewWrapper>
    )
}

const DiceValueNode = Node.create({
    name: "diceValue",
    inline: true,
    group: "inline",
    atom: true,

    addAttributes() {
        return {
            qty: { default: 1, parseHTML: (el) => parseInt(el.getAttribute("data-qty") || "1", 10) },
            faces: { default: 6, parseHTML: (el) => parseInt(el.getAttribute("data-faces") || "6", 10) },
            colorHex: { default: null, parseHTML: (el) => el.getAttribute("data-color-hex") || null },
        }
    },

    parseHTML() {
        return [{ tag: 'span[data-type="dice-value"]' }]
    },

    renderHTML({ HTMLAttributes }) {
        const { qty, faces, colorHex } = HTMLAttributes
        const attrs: Record<string, string> = {
            "data-type": "dice-value",
            "data-qty": String(qty),
            "data-faces": String(faces),
        }
        if (colorHex) attrs["data-color-hex"] = colorHex
        return ["span", attrs]
    },

    addNodeView() {
        return ReactNodeViewRenderer(DiceNodeView as any)
    },

    addInputRules() {
        const type = this.type
        return [
            new InputRule({
                find: DICE_INPUT_RULE_REGEX,
                handler: ({ state, range, match }) => {
                    const node = type.create({
                        qty: parseInt(match[1], 10),
                        faces: parseInt(match[2], 10),
                        colorHex: null,
                    })
                    state.tr.replaceWith(range.from, range.to, node)
                },
            }),
        ]
    },

    addProseMirrorPlugins() {
        const nodeType = this.type
        return [
            new Plugin({
                appendTransaction(transactions, _oldState, newState) {
                    if (!transactions.some((tr) => tr.docChanged)) return null

                    const tr = newState.tr
                    let modified = false

                    newState.doc.descendants((node, pos) => {
                        if (node.type !== nodeType) return

                        const nodeEnd = pos + node.nodeSize
                        const end = Math.min(nodeEnd + 60, newState.doc.content.size)
                        if (end <= nodeEnd) return

                        const textAfter = newState.doc.textBetween(nodeEnd, end, " ")

                        let colorHex: string | null = null

                        const lookaheadMatch = DICE_LOOKAHEAD_REGEX.exec(textAfter)
                        if (lookaheadMatch) {
                            const fuseResult = diceFuse.search(lookaheadMatch[1])
                            if (fuseResult.length > 0) colorHex = fuseResult[0].item.hex
                        } else {
                            const words = textAfter.match(/[a-záàâãéèêíïóôõöúçñ]+/gi) ?? []
                            for (const word of words) {
                                const result = diceFuse.search(word)
                                if (result.length > 0) {
                                    colorHex = result[0].item.hex
                                    break
                                }
                            }
                        }

                        const currentColor = node.attrs.colorHex || null
                        if (colorHex !== currentColor) {
                            tr.setNodeMarkup(pos, null, { ...node.attrs, colorHex })
                            modified = true
                        }
                    })

                    return modified ? tr : null
                },
            }),
        ]
    },
})
import { EntityPreviewTooltip } from "./entity-preview-tooltip"
import { MentionBadge } from "./mention-badge"

const MentionNode = (props: any) => {
    const { node } = props
    const type = node.attrs.entityType || "Regra"
    const label = node.attrs.label ?? node.attrs.id
    const id = node.attrs.id

    return (
        <NodeViewWrapper className="inline-block">
            <MentionBadge id={id} label={label} type={type} />
        </NodeViewWrapper>
    )
}

const CustomMention = Mention.extend({
    addKeyboardShortcuts() {
        return {
            'Mod-Enter': () => {
                const element = this.editor.options.element
                if (element instanceof HTMLElement) {
                    const form = element.closest('form')
                    if (form) {
                        form.requestSubmit()
                        return true
                    }
                }
                return false
            },
        }
    },

    addAttributes() {
        return {
            ...this.parent?.(),
            entityType: {
                default: "Regra",
                renderHTML: (attributes) => ({
                    "data-entity-type": attributes.entityType,
                }),
                parseHTML: (element) => element.getAttribute("data-entity-type"),
            },
        }
    },

    parseHTML() {
        return [
            {
                tag: 'span[data-type="mention"]',
            },
        ]
    },

    addNodeView() {
        return ReactNodeViewRenderer(MentionNode)
    },

    renderHTML({ node, HTMLAttributes }) {
        return ["span", { ...HTMLAttributes, "data-type": "mention" }, node.attrs.label ?? node.attrs.id]
    },
})

interface RichTextEditorProps {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    className?: string
    disabled?: boolean
    excludeId?: string
    variant?: "full" | "simple"
    autoFocus?: boolean
    minRows?: number
}

const MenuBar = ({ editor, addImage }: { editor: Editor | null; addImage: () => void }) => {
    if (!editor) {
        return null
    }

    return (
        <div className="flex flex-wrap gap-1 p-2 border-b border-border/10 bg-black/20 rounded-t-lg items-center">
            <Button
                type="button"
                variant="ghost"
                size="sm"
                tabIndex={-1}
                onClick={() => editor.chain().focus().toggleBold().run()}
                disabled={!editor.can().chain().focus().toggleBold().run()}
                className={cn(editor.isActive("bold") ? "bg-white/10" : "", "h-8 w-8 p-0")}
            >
                <Bold className="h-4 w-4" />
            </Button>
            <Button
                type="button"
                variant="ghost"
                size="sm"
                tabIndex={-1}
                onClick={() => editor.chain().focus().toggleItalic().run()}
                disabled={!editor.can().chain().focus().toggleItalic().run()}
                className={cn(editor.isActive("italic") ? "bg-white/10" : "", "h-8 w-8 p-0")}
            >
                <Italic className="h-4 w-4" />
            </Button>
            <Button
                type="button"
                variant="ghost"
                size="sm"
                tabIndex={-1}
                onClick={() => editor.chain().focus().toggleStrike().run()}
                disabled={!editor.can().chain().focus().toggleStrike().run()}
                className={cn(editor.isActive("strike") ? "bg-white/10" : "", "h-8 w-8 p-0")}
            >
                <Strikethrough className="h-4 w-4" />
            </Button>

            <div className="w-px h-6 bg-white/10 mx-1 self-center" />

            <Button
                type="button"
                variant="ghost"
                size="sm"
                tabIndex={-1}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                className={cn(editor.isActive("bulletList") ? "bg-white/10" : "", "h-8 w-8 p-0")}
            >
                <List className="h-4 w-4" />
            </Button>
            <Button
                type="button"
                variant="ghost"
                size="sm"
                tabIndex={-1}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                className={cn(editor.isActive("orderedList") ? "bg-white/10" : "", "h-8 w-8 p-0")}
            >
                <ListOrdered className="h-4 w-4" />
            </Button>

            <div className="w-px h-6 bg-white/10 mx-1 self-center" />

            <Button type="button" variant="ghost" size="sm" tabIndex={-1} onClick={addImage} className="h-8 w-8 p-0" title="Upload Image">
                <ImageIcon className="h-4 w-4" />
            </Button>

            <div className="w-px h-6 bg-white/10 mx-1 self-center" />

            <Button type="button" variant="ghost" size="sm" tabIndex={-1} onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().chain().focus().undo().run()} className="h-8 w-8 p-0">
                <Undo className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="sm" tabIndex={-1} onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().chain().focus().redo().run()} className="h-8 w-8 p-0">
                <Redo className="h-4 w-4" />
            </Button>
        </div>
    )
}

export function RichTextEditor({ value, onChange, className, disabled = false, excludeId, variant = "full", autoFocus = false, placeholder, minRows }: RichTextEditorProps) {
    const [isUploading, setIsUploading] = useState(false)

    const uploadImage = useCallback(async (file: File) => {
        setIsUploading(true)
        try {
            const formData = new FormData()
            formData.append("file", file)

            const res = await fetch("/api/upload", {
                method: "POST",
                body: formData,
            })

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}))
                throw new Error(errorData.error || "Upload failed")
            }

            const data = await res.json()
            return data.url
        } catch (error) {
            console.error("Image upload failed:", error)
            return null
        } finally {
            setIsUploading(false)
        }
    }, [])

    const editor = useEditor({
        immediatelyRender: false,
        autofocus: autoFocus,
        extensions: [
            StarterKit,
            ImageExtension,
            Placeholder.configure({
                placeholder: placeholder ?? "Digite '@' para referenciar habilidades, magias, etc.",
            }),
            CustomMention.configure({
                suggestion: getSuggestionConfig({ excludeId }),
            }),
            DiceHighlight,
            DiceValueNode,
        ],
        content: value,
        editable: !disabled,
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML())
        },
        editorProps: {
            attributes: {
                class: cn(
                    "prose prose-invert max-w-none focus:outline-none",
                    variant === "full" ? "p-4 min-h-[150px]" : "px-3 py-1.5 min-h-[38px]",
                    variant === "full" ? "prose-p:my-2" : "prose-p:my-0",
                    "prose-headings:mb-4 prose-headings:mt-6",
                    "prose-ul:list-disc prose-ol:list-decimal prose-li:my-1",
                    "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1",
                    "prose-blockquote:border-l-4 prose-blockquote:border-primary/50 prose-blockquote:pl-4 prose-blockquote:italic",
                    "prose-img:rounded-md prose-img:border prose-img:border-white/10",
                    "dark:prose-invert",
                    // TipTap placeholder CSS logic
                    "relative [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)] [&_p.is-editor-empty:first-child]:before:text-white/30 [&_p.is-editor-empty:first-child]:before:float-left [&_p.is-editor-empty:first-child]:before:h-0 [&_p.is-editor-empty:first-child]:before:pointer-events-none",
                    variant === "simple" && "[&_p.is-editor-empty:first-child]:before:text-xs",
                ),
                ...(variant === "full" && minRows ? { style: `min-height: ${minRows * 1.75}rem` } : {}),
            },
            handlePaste: (view, event) => {
                const item = event.clipboardData?.items[0]

                // Handle image paste
                if (item?.type.indexOf("image") === 0) {
                    event.preventDefault()
                    const file = item.getAsFile()
                    if (file) {
                        uploadImage(file).then((url) => {
                            if (url) {
                                const { schema } = view.state
                                const node = schema.nodes.image.create({ src: url })
                                const transaction = view.state.tr.replaceSelectionWith(node)
                                view.dispatch(transaction)
                            }
                        })
                    }
                    return true
                }

                // Handle PDF text cleanup on Ctrl+Shift+V or specific detection
                const text = event.clipboardData?.getData("text/plain")
                if (text) {
                    // Logic to detect or force cleanup:
                    // 1. If it's a "Paste as plain text" (often triggered by browser/OS shortcuts)
                    // 2. Or we can try to detect common PDF patterns (hyphenation at EOL)

                    const hasHyphenatedLineBreak = /-[\n\r]+/.test(text)
                    const hasMidSentenceLineBreak = /[a-z,]\s*[\n\r]+\s*[a-z]/.test(text)

                    // If we detect PDF-like breaks, we clean it up
                    if (hasHyphenatedLineBreak || hasMidSentenceLineBreak) {
                        event.preventDefault()

                        let cleanedText = text
                            // Remove hyphenation: "apre-\nsentados" -> "apresentados"
                            .replace(/(\w+)-\s*[\n\r]+\s*(\w+)/g, "$1$2")
                            // Join lines that end with a word and start with a word (mid-sentence)
                            .replace(/([a-z,])\s*[\n\r]+\s*([a-z])/g, "$1 $2")
                            // Optionally handle multiple spaces
                            .replace(/[ ]{2,}/g, " ")

                        view.dispatch(view.state.tr.insertText(cleanedText))
                        return true
                    }
                }

                return false
            },
            handleDrop: (view, event, _slice, moved) => {
                if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
                    const file = event.dataTransfer.files[0]
                    if (file.type.indexOf("image") === 0) {
                        event.preventDefault()
                        uploadImage(file).then((url) => {
                            if (url) {
                                const { schema } = view.state
                                const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY })
                                if (coordinates) {
                                    const node = schema.nodes.image.create({ src: url })
                                    const transaction = view.state.tr.insert(coordinates.pos, node)
                                    view.dispatch(transaction)
                                }
                            }
                        })
                        return true
                    }
                }
                return false
            },
        },
    })

    // Need to pass addImage to MenuBar inside the component to access editor and uploadImage
    const handleAddImageClick = useCallback(() => {
        if (!editor) return
        const input = document.createElement("input")
        input.type = "file"
        input.accept = "image/*"
        input.onchange = async (e: Event) => {
            const target = e.target as HTMLInputElement
            if (target.files?.length) {
                const file = target.files[0]
                const url = await uploadImage(file)
                if (url) {
                    editor.chain().focus().setImage({ src: url }).run()
                }
            }
        }
        input.click()
    }, [editor, uploadImage])

    // Update content if value changes externally
    useEffect(() => {
        if (editor && value && value !== editor.getHTML()) {
            // Avoid cursor jumps validation
            if (editor.getText() === "" && (value === "<p></p>" || value === "")) return
            if (!editor.isFocused) {
                // Ensure the update happens outside the current rendering cycle to avoid flushSync errors
                setTimeout(() => {
                    if (editor && !editor.isDestroyed) {
                        editor.commands.setContent(value)
                    }
                }, 0)
            }
        }
    }, [value, editor])

    return (
        <div
            className={cn(
                "rounded-lg overflow-hidden transition-all group",
                glassConfig.input.background,
                glassConfig.input.blur,
                glassConfig.input.border,
                "focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-blue-500/50",
                disabled && "opacity-50 cursor-not-allowed",
                isUploading && "animate-pulse pointer-events-none",
                className,
            )}
        >
            {variant === "full" && <MenuBar editor={editor} addImage={handleAddImageClick} />}
            <div className="relative">
                <EditorContent editor={editor} />
                {isUploading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-xs text-white">Uploading...</div>}
            </div>
        </div>
    )
}
