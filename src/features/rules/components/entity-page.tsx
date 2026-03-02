"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { Chip } from "@/components/ui/chip"
import { ScrollText, ExternalLink, ArrowLeft } from "lucide-react"
import { motionConfig } from "@/lib/config/motion-configs"
import { renderEntity } from "./entity-renderers"
import { useRouter } from "next/navigation"
import { Button } from "@/core/ui/button"

interface EntityPageProps {
    item: any
    entityType: string
    isLoading: boolean
}

export function EntityPage({ item, entityType, isLoading }: EntityPageProps) {
    const router = useRouter()

    if (isLoading) {
        return (
            <div className="min-h-[400px] flex items-center justify-center">
                <LoadingState variant="spinner" message={`Carregando ${entityType.toLowerCase()}...`} />
            </div>
        )
    }

    if (!item) {
        return (
            <div className="py-12">
                <EmptyState 
                    title={`${entityType} não encontrada`} 
                    description="O item que você procura pode ter sido removido ou o link está incorreto." 
                    icon={ScrollText} 
                />
                <div className="mt-6 flex justify-center">
                    <Button variant="ghost" onClick={() => router.back()}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Voltar
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6 py-2 w-full">
            <motion.div
                initial="initial"
                animate="animate"
                variants={motionConfig.variants.fadeInUp}
                className="w-full"
            >
                <div className="mb-4 flex items-center justify-between">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => router.back()}
                        className="text-white/40 hover:text-white"
                    >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Voltar
                    </Button>
                </div>

                <GlassCard className="relative overflow-hidden w-full">
                    <GlassCardContent className="p-6 md:p-8">
                        <div className="absolute top-4 right-4 z-10">
                            <Chip variant={item.status === "active" ? "uncommon" : "common"} size="sm">
                                {item.status === "active" ? "Ativa" : "Inativa"}
                            </Chip>
                        </div>
                        <div className="max-w-full overflow-hidden">
                            {renderEntity(item, entityType)}
                        </div>
                    </GlassCardContent>
                </GlassCard>
            </motion.div>
        </div>
    )
}
