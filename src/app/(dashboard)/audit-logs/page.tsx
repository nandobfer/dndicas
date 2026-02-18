"use client";

import { useEffect, useState } from 'react';
import { Card, CardHeader, CardContent } from '@/core/ui/card';
import { Button } from '@/core/ui/button';
import { Input } from '@/core/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/core/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/core/ui/dialog';
import { Loader2, FileText, Eye, Filter, X } from 'lucide-react';
import api from '@/core/utils/api';
import { PaginatedResponse } from '@/core/types';
import { toast } from 'sonner';

interface AuditLogDisplay {
  _id: string;
  action: string;
  collectionName: string;
  documentId: string;
  userId?: string;
  details?: any;
  timestamp: string;
}

export default function AuditLogsPage() {
  // Dados e paginação
  const [logs, setLogs] = useState<AuditLogDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filtros
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedAction, setSelectedAction] = useState('all');
  const [selectedCollection, setSelectedCollection] = useState('all');

  // Modal de detalhes
  const [selectedLog, setSelectedLog] = useState<AuditLogDisplay | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '10',
        ...(startDate && { startDate: new Date(startDate).toISOString() }),
        ...(endDate && { endDate: new Date(endDate).toISOString() }),
        ...(selectedUser && { userId: selectedUser }),
        ...(selectedAction && selectedAction !== 'all' && { action: selectedAction }),
        ...(selectedCollection && selectedCollection !== 'all' && { collectionName: selectedCollection }),
      });

      const response = await api.get<PaginatedResponse<AuditLogDisplay>>(
        `/audit-logs?${params}`
      );

      if (response.data.success) {
        setLogs(response.data.data || []);
        setTotalPages(response.data.pagination?.totalPages || 1);
        setTotal(response.data.pagination?.total || 0);
      }
    } catch (error: any) {
      console.error('Error fetching audit logs:', error);
      if (error.response?.status === 403) {
        toast.error('Acesso negado. Apenas administradores podem visualizar logs de auditoria.');
      } else {
        toast.error('Erro ao carregar logs de auditoria');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page]);

  const handleApplyFilters = () => {
    setPage(1);
    fetchLogs();
  };

  const handleClearFilters = () => {
    setStartDate('');
    setEndDate('');
    setSelectedUser('');
    setSelectedAction('all');
    setSelectedCollection('all');
    setPage(1);
    setTimeout(() => fetchLogs(), 0);
  };

  const handleViewDetails = (log: AuditLogDisplay) => {
    setSelectedLog(log);
    setDialogOpen(true);
  };

  const getActionBadgeColor = (action: string) => {
    switch (action.toUpperCase()) {
      case 'CREATE':
        return 'bg-green-100 text-green-800';
      case 'UPDATE':
        return 'bg-blue-100 text-blue-800';
      case 'DELETE':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold md:text-2xl">Logs de Auditoria</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visualize todas as ações realizadas no sistema
          </p>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            <h3 className="font-semibold">Filtros</h3>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Data Início</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Data Fim</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">ID do Usuário</label>
              <Input
                placeholder="user_..."
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Ação</label>
              <Select value={selectedAction} onValueChange={setSelectedAction}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas as ações" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as ações</SelectItem>
                  <SelectItem value="CREATE">CREATE</SelectItem>
                  <SelectItem value="UPDATE">UPDATE</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                  <SelectItem value="LOGIN">LOGIN</SelectItem>
                  <SelectItem value="LOGOUT">LOGOUT</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Coleção</label>
              <Select value={selectedCollection} onValueChange={setSelectedCollection}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas as coleções" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as coleções</SelectItem>
                  <SelectItem value="Company">Company</SelectItem>
                  <SelectItem value="Branch">Branch</SelectItem>
                  <SelectItem value="Client">Client</SelectItem>
                  <SelectItem value="Auth">Auth</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end gap-2">
              <Button onClick={handleApplyFilters} className="flex-1">
                <Filter className="mr-2 h-4 w-4" />
                Aplicar Filtros
              </Button>
              <Button onClick={handleClearFilters} variant="outline">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Logs */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum log encontrado</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Tente ajustar os filtros para ver mais resultados
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium">Ação</th>
                      <th className="text-left p-3 font-medium">Coleção</th>
                      <th className="text-left p-3 font-medium">ID do Documento</th>
                      <th className="text-left p-3 font-medium">Usuário</th>
                      <th className="text-left p-3 font-medium">Data/Hora</th>
                      <th className="text-right p-3 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log._id} className="border-b hover:bg-muted/50">
                        <td className="p-3">
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getActionBadgeColor(
                              log.action
                            )}`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="p-3">{log.collectionName}</td>
                        <td className="p-3 font-mono text-sm">
                          {log.documentId.length > 12
                            ? `${log.documentId.substring(0, 12)}...`
                            : log.documentId}
                        </td>
                        <td className="p-3 font-mono text-sm">
                          {log.userId
                            ? log.userId.length > 12
                              ? `${log.userId.substring(0, 12)}...`
                              : log.userId
                            : 'N/A'}
                        </td>
                        <td className="p-3 text-sm">
                          {new Date(log.timestamp).toLocaleString('pt-BR')}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewDetails(log)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginação */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Página {page} de {totalPages} - Total: {total} registro{total !== 1 ? 's' : ''}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Modal de Detalhes */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Log de Auditoria</DialogTitle>
            <DialogDescription>
              {selectedLog?.action} - {selectedLog?.collectionName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Grid com informações básicas */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium">Ação</p>
                <p className="text-sm text-muted-foreground">{selectedLog?.action}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Coleção</p>
                <p className="text-sm text-muted-foreground">{selectedLog?.collectionName}</p>
              </div>
              <div>
                <p className="text-sm font-medium">ID do Documento</p>
                <p className="text-sm text-muted-foreground font-mono">{selectedLog?.documentId}</p>
              </div>
              <div>
                <p className="text-sm font-medium">ID do Usuário</p>
                <p className="text-sm text-muted-foreground font-mono">
                  {selectedLog?.userId || 'N/A'}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-sm font-medium">Data/Hora</p>
                <p className="text-sm text-muted-foreground">
                  {selectedLog ? new Date(selectedLog.timestamp).toLocaleString('pt-BR') : ''}
                </p>
              </div>
            </div>

            {/* JSON formatado */}
            <div>
              <p className="text-sm font-medium mb-2">Detalhes (JSON)</p>
              <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
                {JSON.stringify(selectedLog?.details, null, 2)}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
