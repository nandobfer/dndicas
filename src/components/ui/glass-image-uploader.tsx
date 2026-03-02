// src/components/ui/glass-image-uploader.tsx
"use client"

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Image as ImageIcon, Upload, X, Loader2, FileImage } from "lucide-react"
import { cn } from "@/core/utils"
import { toast } from "sonner"

interface GlassImageUploaderProps {
    value?: string
    onChange: (url: string) => void
    onRemove: () => void
    disabled?: boolean
    className?: string
    label?: string
    aspectRatio?: "square" | "video" | "portrait"
}

export function GlassImageUploader({
    value,
    onChange,
    onRemove,
    disabled = false,
    className,
    label,
    aspectRatio = "square"
}: GlassImageUploaderProps) {
    const [isDragging, setIsDragging] = React.useState(false)
    const [isUploading, setIsUploading] = React.useState(false)
    const fileInputRef = React.useRef<HTMLInputElement>(null)

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

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        if (disabled || isUploading) return

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
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[2px]">
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                                    title="Trocar imagem"
                                >
                                    <Upload className="w-5 h-5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={onRemove}
                                    className="p-2 rounded-full bg-rose-500/20 hover:bg-rose-500/40 text-rose-400 transition-colors"
                                    title="Remover imagem"
                                >
                                    <X className="w-5 h-5" />
                                </button>
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
                            <div className="mb-3 p-3 rounded-full bg-white/5 group-hover:bg-white/10 transition-colors">
                                {isUploading ? (
                                    <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                                ) : (
                                    <FileImage className="w-6 h-6 text-white/40 group-hover:text-white/60" />
                                )}
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs font-medium text-white/60 group-hover:text-white/80">
                                    {isUploading ? "Enviando..." : isDragging ? "Solte para enviar" : "Clique ou arraste a imagem"}
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
                    disabled={disabled || isUploading}
                />
            </div>
        </div>
    )
}
