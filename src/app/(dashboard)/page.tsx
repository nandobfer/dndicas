export default function DashboardPage() {
    return (
        <div className="flex flex-col gap-4">
            <h1 className="text-lg font-semibold md:text-2xl">Dashboard</h1>
            <div className="rounded-lg border border-dashed shadow-sm p-8 text-center bg-card">
                <h3 className="text-2xl font-bold tracking-tight">Bem-vindo ao Dungeons & Dicas</h3>
                <p className="text-sm text-muted-foreground mt-2">
                    Este é o template base com autenticação, banco de dados e integração AI.
                </p>
            </div>
        </div>
    );
}
