import Link from "next/link"
import { ScrollText, ArrowLeft } from "lucide-react"

export default function SheetNotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                <ScrollText className="w-7 h-7 text-white/20" />
            </div>
            <div className="space-y-1">
                <h2 className="text-lg font-bold text-white">Ficha não encontrada</h2>
                <p className="text-sm text-white/50">Esta ficha não existe ou foi removida.</p>
            </div>
            <Link
                href="/my-sheets"
                className="inline-flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                Voltar para Minhas Fichas
            </Link>
        </div>
    )
}
