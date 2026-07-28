"use client"

import { AnimatePresence, motion } from "framer-motion"
import { ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { useEffect, useState } from "react"
import type { UseFormWatch } from "react-hook-form"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { GlassButton } from "@/components/ui/glass-button"
import { CompactRichInput } from "./compact-rich-input"
import { usePatchSheet } from "../api/character-sheets-queries"
import type { CharacterSheet, CharacterSheetNotePage, PatchSheetBody } from "../types/character-sheet.types"

interface SheetNotesProps {
    sheet: CharacterSheet
    form: {
        watch: UseFormWatch<PatchSheetBody>
        setFieldLocally: (field: keyof PatchSheetBody, value: unknown) => void
        patchField: (field: keyof PatchSheetBody, value: unknown) => void
    }
    isReadOnly?: boolean
}

function createNotePage(): CharacterSheetNotePage {
    const now = new Date().toISOString()
    const randomId = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `note-page-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    return {
        id: randomId,
        content: "",
        createdAt: now,
        updatedAt: now,
    }
}

function isBlankNoteContent(content: string): boolean {
    return content
        .replace(/&nbsp;/g, " ")
        .replace(/<br\s*\/?\s*>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim().length === 0
}

const notePageVariants = {
    enter: (direction: number) => ({ opacity: 0, x: direction * 32, scale: 0.98 }),
    center: { opacity: 1, x: 0, scale: 1 },
    exit: (direction: number) => ({ opacity: 0, x: direction * -32, scale: 0.98 }),
}

export function SheetNotes({ sheet, form, isReadOnly = false }: SheetNotesProps) {
    const { watch, setFieldLocally, patchField } = form
    const { isPending: isLoading } = usePatchSheet(sheet._id)
    const [activeNoteIndex, setActiveNoteIndex] = useState(0)
    const [pageDirection, setPageDirection] = useState(1)
    const fields = [
        {
            field: "appearance" as const,
            label: "Aparência",
            placeholder: "Descrição física, roupas, marcas, postura... use @ para mencionar",
        },
        {
            field: "history" as const,
            label: "História",
            placeholder: "Origem, jornada, vínculos, eventos marcantes... use @ para mencionar",
        },
    ]
    const extraNotePages = watch("notePages") ?? sheet.notePages ?? []
    const currentNotes = watch("notes") ?? sheet.notes ?? ""
    const notePages = [
        {
            id: "notes",
            content: currentNotes,
            createdAt: sheet.createdAt,
            updatedAt: sheet.updatedAt,
        },
        ...extraNotePages,
    ]
    const activeNotePage = notePages[activeNoteIndex] ?? notePages[0]

    useEffect(() => {
        if (activeNoteIndex <= notePages.length - 1) return
        setActiveNoteIndex(Math.max(notePages.length - 1, 0))
    }, [activeNoteIndex, notePages.length])

    const goToNotePage = (nextIndex: number) => {
        setPageDirection(nextIndex > activeNoteIndex ? 1 : -1)
        setActiveNoteIndex(nextIndex)
    }

    const setExtraNotePageContent = (pageIndex: number, content: string, shouldPersist: boolean) => {
        const now = new Date().toISOString()
        const nextPages = extraNotePages.map((page, index) => (
            index === pageIndex
                ? { ...page, content, updatedAt: now }
                : page
        ))

        if (shouldPersist) {
            const syncedPages = nextPages.filter((page) => !isBlankNoteContent(page.content))
            const removedBeforeActivePage = nextPages
                .slice(0, pageIndex + 1)
                .filter((page) => isBlankNoteContent(page.content)).length

            if (removedBeforeActivePage > 0) {
                setPageDirection(-1)
                setActiveNoteIndex(Math.max(0, activeNoteIndex - removedBeforeActivePage))
            }

            patchField("notePages", syncedPages)
            return
        }

        setFieldLocally("notePages", nextPages)
    }

    const handleNoteChange = (value: string) => {
        if (activeNoteIndex === 0) {
            setFieldLocally("notes", value)
            return
        }

        setExtraNotePageContent(activeNoteIndex - 1, value, false)
    }

    const handleNoteBlur = (value: string) => {
        if (activeNoteIndex === 0) {
            patchField("notes", value)
            return
        }

        setExtraNotePageContent(activeNoteIndex - 1, value, true)
    }

    const addNotePage = () => {
        if (isReadOnly) return

        const nextPages = [...extraNotePages, createNotePage()]
        setPageDirection(1)
        setActiveNoteIndex(nextPages.length)
        patchField("notePages", nextPages)
    }

    return (
        <GlassCard>
            <GlassCardContent className="space-y-4 p-4">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {fields.map((item) => (
                        <CompactRichInput
                            key={item.field}
                            variant="full"
                            label={item.label}
                            value={watch(item.field) ?? sheet[item.field] ?? ""}
                            onChange={(v) => setFieldLocally(item.field as keyof PatchSheetBody, v)}
                            onBlur={(v) => patchField(item.field as keyof PatchSheetBody, v)}
                            placeholder={item.placeholder}
                            isLoading={isLoading}
                            minRows={5}
                            excludeId={sheet._id}
                            disabled={isReadOnly}
                        />
                    ))}
                </div>
                <div className="flex min-h-[260px] flex-col gap-3">
                    <div className="flex items-center justify-between gap-2">
                        <div>
                            <p className="ml-1 text-[9px] font-black uppercase tracking-widest text-white/40 select-none">Notas</p>
                            <p className="ml-1 text-xs text-white/45">Página {activeNoteIndex + 1} de {notePages.length}</p>
                        </div>
                        <div className="flex items-center gap-1">
                            <GlassButton
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Página anterior"
                                disabled={activeNoteIndex === 0}
                                onClick={() => goToNotePage(activeNoteIndex - 1)}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </GlassButton>
                            <GlassButton
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Próxima página"
                                disabled={activeNoteIndex === notePages.length - 1}
                                onClick={() => goToNotePage(activeNoteIndex + 1)}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </GlassButton>
                            <GlassButton
                                type="button"
                                variant="outline"
                                size="icon"
                                aria-label="Adicionar página de notas"
                                disabled={isReadOnly || isLoading}
                                onClick={addNotePage}
                            >
                                <Plus className="h-4 w-4" />
                            </GlassButton>
                        </div>
                    </div>

                    <div className="relative flex-1 overflow-hidden">
                        <AnimatePresence initial={false} custom={pageDirection} mode="wait">
                            <motion.div
                                key={activeNotePage.id}
                                custom={pageDirection}
                                variants={notePageVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.2, ease: "easeOut" }}
                            >
                                <CompactRichInput
                                    variant="full"
                                    label="Notas"
                                    value={activeNotePage.content}
                                    onChange={handleNoteChange}
                                    onBlur={handleNoteBlur}
                                    placeholder="Anotações livres, recompensas, NPCs... use @ para mencionar"
                                    isLoading={isLoading}
                                    minRows={5}
                                    excludeId={sheet._id}
                                    disabled={isReadOnly}
                                />
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </GlassCardContent>
        </GlassCard>
    )
}
