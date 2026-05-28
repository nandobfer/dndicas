// src/components/ui/glass-image-uploader.tsx
"use client"

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Upload, X, Loader2, FileImage, Sparkles } from "lucide-react"
import { cn } from "@/core/utils"
import { toast } from "sonner"

interface GeneratedImageResponse {
    success: boolean
    data?: {
        url: string
    }
    error?: string
}

interface GlassImageUploaderProps {
    value?: string
    onChange: (url: string) => void
    onRemove: () => void
    disabled?: boolean
    className?: string
    label?: string
    aspectRatio?: "square" | "video" | "portrait"
    getAIPayload?: () => unknown
    aiContextLabel?: string
}

const preferredAspectRatioByVariant = {
    square: "1:1",
    video: "16:9",
    portrait: "3:4",
} satisfies Record<NonNullable<GlassImageUploaderProps["aspectRatio"]>, string>

function buildFallbackAIPrompt({
    label,
    aiContextLabel,
    aspectRatio,
}: {
    label?: string
    aiContextLabel?: string
    aspectRatio: NonNullable<GlassImageUploaderProps["aspectRatio"]>
}): string {
    const entityName = aiContextLabel?.trim() || label?.trim() || "personagem de D&D"
    const compositionInstruction = aspectRatio === "portrait"
        ? "Crie um retrato vertical premium, com foco total no personagem, pose legivel e enquadramento heroico."
        : aspectRatio === "video"
            ? "Crie uma cena horizontal cinematografica, com leitura clara do sujeito principal e ambiente coerente."
            : "Crie uma arte quadrada premium, com composicao central forte e leitura imediata do sujeito principal."

    return [
        compositionInstruction,
        `Contexto principal: ${entityName}.`,
        "Estetica: fantasia heroica de Dungeons & Dragons 5e, acabamento editorial, iluminacao dramatica e sem texto na imagem.",
    ].join(" ")
}

export function GlassImageUploader({
    value,
    onChange,
    onRemove,
    disabled = false,
    className,
    label,
    aspectRatio = "square",
    getAIPayload,
    aiContextLabel,
}: GlassImageUploaderProps) {
    const [isDragging, setIsDragging] = React.useState(false)
    const [isUploading, setIsUploading] = React.useState(false)
    const [isGeneratingWithAI, setIsGeneratingWithAI] = React.useState(false)
    const fileInputRef = React.useRef<HTMLInputElement>(null)
    const isBusy = isUploading || isGeneratingWithAI

    const handleUpload = async (file: File) => {
        if (!file.type.startsWith("image/")) {
            toast.error("Por favor, selecione uma imagem válida.")
            return
        }

        if (file.size > 5 * 1024 * 1024) {
            toast.error("A imagem deve ter no máximo 5MB.")
            return
        }

        setIsUploading(true)
        try {
            const formData = new FormData()
            formData.append("file", file)

            const res = await fetch("/api/upload", {
                method: "POST",
                body: formData,
            })

            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.error || "Erro no upload")
            }

            const data = await res.json()
            onChange(data.url)
            toast.success("Imagem enviada com sucesso!")
        } catch (error) {
            console.error("Upload error:", error)
            toast.error("Falha ao enviar imagem.")
        } finally {
            setIsUploading(false)
        }
    }

    const handleGenerateWithAI = async () => {
        if (disabled || isBusy) {
            return
        }

        const payload = getAIPayload?.()
        const hasExplicitPayload = typeof payload !== "undefined" && payload !== null
        const preferredAspectRatio = preferredAspectRatioByVariant[aspectRatio]
        const requestBody = hasExplicitPayload
            ? {
                entityLabel: aiContextLabel,
                formData: payload,
                preferredAspectRatio,
            }
            : {
                entityLabel: aiContextLabel || label,
                preferredAspectRatio,
                prompt: buildFallbackAIPrompt({ label, aiContextLabel, aspectRatio }),
            }

        setIsGeneratingWithAI(true)
        try {
            const res = await fetch("/api/core/ai/image", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify(requestBody),
            })

            const data = await res.json() as GeneratedImageResponse

            if (!res.ok || !data.success || !data.data?.url) {
                throw new Error(data.error || "Erro ao gerar imagem com IA")
            }

            onChange(data.data.url)
            toast.success("Imagem gerada com IA com sucesso!")
        } catch (error) {
            console.error("AI image generation error:", error)
            toast.error(error instanceof Error ? error.message : "Falha ao gerar imagem com IA.")
        } finally {
            setIsGeneratingWithAI(false)
        }
    }

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        if (disabled || isBusy) return

        const file = e.dataTransfer.files[0]
        if (file) handleUpload(file)
    }

    const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) handleUpload(file)
    }

    const aspectClasses = {
        square: "aspect-square",
        video: "aspect-video",
        portrait: "aspect-[3/4]"
    }

    const aiButtonClasses = "relative overflow-hidden rounded-full border border-purple-300/30 bg-[linear-gradient(135deg,rgba(96,165,250,0.18),rgba(168,85,247,0.22),rgba(59,130,246,0.18))] bg-[length:200%_200%] p-2 text-purple-100 shadow-[0_0_24px_rgba(168,85,247,0.18)] transition-all hover:border-purple-200/45 hover:shadow-[0_0_30px_rgba(168,85,247,0.26)] disabled:opacity-50 disabled:cursor-not-allowed"

    return (
        <div className={cn("space-y-2", className)}>
            {label && (
                <label className="text-sm font-medium text-white/80 block px-1">
                    {label}
                </label>
            )}

            <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                className={cn(
                    "relative rounded-xl border border-dashed transition-all overflow-hidden bg-white/5",
                    aspectClasses[aspectRatio],
                    isDragging ? "border-blue-500 bg-blue-500/10 scale-[0.98]" : "border-white/10 hover:border-white/20",
                    isUploading && "animate-pulse cursor-wait",
                    isGeneratingWithAI && "cursor-wait",
                    disabled && "opacity-50 cursor-not-allowed"
                )}
            >
                <AnimatePresence mode="wait">
                    {value ? (
                        <motion.div
                            key="preview"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="group relative w-full h-full"
                        >
                            <img
                                src={value}
                                alt="Preview"
                                className="w-full h-full object-cover"
                            />
                            <div className={cn(
                                "absolute inset-0 bg-black/40 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[2px]",
                                isGeneratingWithAI ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                            )}>
                                {isGeneratingWithAI ? (
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="relative flex items-center justify-center">
                                            <Loader2 className="h-10 w-10 animate-spin text-white/25" />
                                            <motion.div
                                                aria-hidden="true"
                                                className="absolute h-8 w-8 rounded-full bg-[linear-gradient(135deg,rgba(96,165,250,0.45),rgba(168,85,247,0.55),rgba(59,130,246,0.45))] blur-md"
                                                animate={{ scale: [0.9, 1.1, 0.9], opacity: [0.75, 1, 0.75] }}
                                                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                                            />
                                            <Sparkles className="absolute h-4 w-4 text-purple-100" />
                                        </div>
                                        <span className="bg-gradient-to-r from-blue-300 via-purple-300 to-blue-300 bg-clip-text text-xs font-medium text-transparent">
                                            Gerando com IA...
                                        </span>
                                    </div>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                                            title="Trocar imagem"
                                        >
                                            <Upload className="w-5 h-5" />
                                        </button>
                                        <motion.button
                                            type="button"
                                            onClick={handleGenerateWithAI}
                                            className={aiButtonClasses}
                                            title="Gerar imagem com IA"
                                            animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                                            transition={{ duration: 3.5, repeat: Infinity, ease: "linear" }}
                                            disabled={disabled || isBusy}
                                        >
                                            <Sparkles className="w-5 h-5" />
                                        </motion.button>
                                        <button
                                            type="button"
                                            onClick={onRemove}
                                            className="p-2 rounded-full bg-rose-500/20 hover:bg-rose-500/40 text-rose-400 transition-colors"
                                            title="Remover imagem"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="upload"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => !disabled && fileInputRef.current?.click()}
                            className="w-full h-full flex flex-col items-center justify-center p-4 cursor-pointer text-center group"
                        >
                            {isGeneratingWithAI ? (
                                <div className="mb-3 flex flex-col items-center gap-3">
                                    <div className="relative flex items-center justify-center">
                                        <Loader2 className="h-10 w-10 animate-spin text-white/25" />
                                        <motion.div
                                            aria-hidden="true"
                                            className="absolute h-8 w-8 rounded-full bg-[linear-gradient(135deg,rgba(96,165,250,0.45),rgba(168,85,247,0.55),rgba(59,130,246,0.45))] blur-md"
                                            animate={{ scale: [0.9, 1.1, 0.9], opacity: [0.75, 1, 0.75] }}
                                            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                                        />
                                        <Sparkles className="absolute h-4 w-4 text-purple-100" />
                                    </div>
                                    <span className="bg-gradient-to-r from-blue-300 via-purple-300 to-blue-300 bg-clip-text text-xs font-medium text-transparent">
                                        Gerando com IA...
                                    </span>
                                </div>
                            ) : (
                                <div className="mb-3 flex items-center gap-3">
                                    <div className="p-3 rounded-full bg-white/5 group-hover:bg-white/10 transition-colors">
                                        {isUploading ? (
                                            <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                                        ) : (
                                            <FileImage className="w-6 h-6 text-white/40 group-hover:text-white/60" />
                                        )}
                                    </div>
                                    <motion.button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            void handleGenerateWithAI()
                                        }}
                                        className={aiButtonClasses}
                                        title="Gerar imagem com IA"
                                        animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                                        transition={{ duration: 3.5, repeat: Infinity, ease: "linear" }}
                                        disabled={disabled || isBusy}
                                    >
                                        <Sparkles className="w-5 h-5" />
                                    </motion.button>
                                </div>
                            )}
                            <div className="space-y-1">
                                <p className="text-xs font-medium text-white/60 group-hover:text-white/80">
                                    {isGeneratingWithAI ? "Gerando arte com IA..." : isUploading ? "Enviando..." : isDragging ? "Solte para enviar" : "Clique ou arraste a imagem"}
                                </p>
                                <p className="text-[10px] text-white/20 font-normal">
                                    PNG, JPG ou WEBP até 5MB
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={onSelect}
                    className="hidden"
                    disabled={disabled || isBusy}
                />
            </div>
        </div>
    )
}
