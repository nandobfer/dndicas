import Link from 'next/link'

export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen py-2">
            <h2 className="text-2xl font-bold">Página não encontrada</h2>
            <p className="mt-4">Não conseguimos encontrar o recurso solicitado.</p>
            <Link href="/" className="mt-4 text-blue-500 hover:text-blue-700">
                Voltar para o início
            </Link>
        </div>
    )
}
