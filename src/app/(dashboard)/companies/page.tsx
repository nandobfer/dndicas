"use client";

import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/core/ui/card';
import { Button } from '@/core/ui/button';
import { GlassInput } from "@/components/ui/glass-input"
import { Plus, Search, Loader2, Building2, Edit, Trash2 } from "lucide-react"
import api from "@/core/utils/api"
import { PaginatedResponse } from "@/core/types"

interface Company {
    _id: string
    name: string
    cnpj: string
    email: string
    phone?: string
    status: "active" | "inactive"
    createdAt: string
}

export default function CompaniesPage() {
    const [companies, setCompanies] = useState<Company[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)

    const fetchCompanies = async () => {
        setLoading(true)
        try {
            const response = await api.get<PaginatedResponse<Company>>(`/companies?page=${page}&limit=10&search=${search}`)

            if (response.data.success) {
                setCompanies(response.data.data || [])
                setTotalPages(response.data.pagination?.totalPages || 1)
            }
        } catch (error) {
            console.error("Error fetching companies:", error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchCompanies()
    }, [page])

    const handleSearch = () => {
        setPage(1)
        fetchCompanies()
    }

    const handleDelete = async (id: string) => {
        if (!confirm("Tem certeza que deseja excluir esta empresa?")) return

        try {
            await api.delete(`/companies/${id}`)
            fetchCompanies()
        } catch (error) {
            console.error("Error deleting company:", error)
            alert("Erro ao excluir empresa")
        }
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-semibold md:text-2xl">Empresas</h1>
                    <p className="text-sm text-muted-foreground mt-1">Gerencie as empresas cadastradas no sistema</p>
                </div>
                <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Nova Empresa
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <div className="flex-1 flex gap-2">
                            <GlassInput
                                placeholder="Buscar por nome ou CNPJ..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                                className="max-w-sm"
                                icon={<Search className="w-4 h-4" />}
                            />
                            <Button onClick={handleSearch} variant="secondary">
                                <Search className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : companies.length === 0 ? (
                        <div className="text-center py-8">
                            <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                            <h3 className="text-lg font-semibold mb-2">Nenhuma empresa encontrada</h3>
                            <p className="text-sm text-muted-foreground mb-4">{search ? "Tente buscar com outros termos" : "Comece adicionando sua primeira empresa"}</p>
                            {!search && (
                                <Button>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Adicionar Empresa
                                </Button>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b">
                                            <th className="text-left p-3 font-medium">Nome</th>
                                            <th className="text-left p-3 font-medium">CNPJ</th>
                                            <th className="text-left p-3 font-medium">Email</th>
                                            <th className="text-left p-3 font-medium">Telefone</th>
                                            <th className="text-left p-3 font-medium">Status</th>
                                            <th className="text-right p-3 font-medium">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {companies.map((company) => (
                                            <tr key={company._id} className="border-b hover:bg-muted/50">
                                                <td className="p-3">{company.name}</td>
                                                <td className="p-3 font-mono text-sm">{company.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")}</td>
                                                <td className="p-3 text-sm">{company.email}</td>
                                                <td className="p-3 text-sm">{company.phone || "-"}</td>
                                                <td className="p-3">
                                                    <span
                                                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                                            company.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                                                        }`}
                                                    >
                                                        {company.status === "active" ? "Ativa" : "Inativa"}
                                                    </span>
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Button variant="ghost" size="sm">
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                        <Button variant="ghost" size="sm" onClick={() => handleDelete(company._id)}>
                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Paginação */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                                    <p className="text-sm text-muted-foreground">
                                        Página {page} de {totalPages}
                                    </p>
                                    <div className="flex gap-2">
                                        <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                                            Anterior
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                                            Próxima
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Sobre este Módulo</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>
                        Este é um módulo exemplo de CRUD completo implementado <strong>fora do core</strong>.
                    </p>
                    <p>
                        <strong>Localização:</strong> <code className="bg-muted px-1 rounded">src/features/organizations/</code>
                    </p>
                    <p>
                        <strong>APIs:</strong>
                    </p>
                    <ul className="list-disc list-inside ml-4">
                        <li>
                            <code className="bg-muted px-1 rounded">GET /api/companies</code> - Lista empresas
                        </li>
                        <li>
                            <code className="bg-muted px-1 rounded">POST /api/companies</code> - Cria empresa
                        </li>
                        <li>
                            <code className="bg-muted px-1 rounded">GET /api/companies/[id]</code> - Busca por ID
                        </li>
                        <li>
                            <code className="bg-muted px-1 rounded">PUT /api/companies/[id]</code> - Atualiza
                        </li>
                        <li>
                            <code className="bg-muted px-1 rounded">DELETE /api/companies/[id]</code> - Exclui
                        </li>
                    </ul>
                    <p>Use este exemplo como referência para criar seus próprios módulos.</p>
                </CardContent>
            </Card>
        </div>
    )
}
