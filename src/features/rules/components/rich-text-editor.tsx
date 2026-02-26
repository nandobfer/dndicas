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
import { entityConfig } from "@/lib/config/colors"
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
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                className={cn(editor.isActive("bulletList") ? "bg-white/10" : "", "h-8 w-8 p-0")}
            >
                <List className="h-4 w-4" />
            </Button>
            <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                className={cn(editor.isActive("orderedList") ? "bg-white/10" : "", "h-8 w-8 p-0")}
            >
                <ListOrdered className="h-4 w-4" />
            </Button>

            <div className="w-px h-6 bg-white/10 mx-1 self-center" />

            <Button type="button" variant="ghost" size="sm" onClick={addImage} className="h-8 w-8 p-0" title="Upload Image">
                <ImageIcon className="h-4 w-4" />
            </Button>

            <div className="w-px h-6 bg-white/10 mx-1 self-center" />

            <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().chain().focus().undo().run()} className="h-8 w-8 p-0">
                <Undo className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().chain().focus().redo().run()} className="h-8 w-8 p-0">
                <Redo className="h-4 w-4" />
            </Button>
        </div>
    )
}

export function RichTextEditor({ value, onChange, className, disabled = false, excludeId, variant = "full", autoFocus = false }: RichTextEditorProps) {
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
                placeholder: "Dica: digite '@' para referenciar regras, habilidades, magias, etc.",
            }),
            CustomMention.configure({
                suggestion: getSuggestionConfig({ excludeId }),
            }),
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
                ),
            },
            handlePaste: (view, event) => {
                const item = event.clipboardData?.items[0]
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
