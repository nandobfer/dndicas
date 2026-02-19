'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Clock, User } from 'lucide-react';
import { ActionChip } from '@/components/ui/action-chip';
import { UserChip } from '@/components/ui/user-chip';
import { Button } from '@/core/ui/button';
import { Skeleton } from '@/core/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/core/ui/table';
import { glassClasses } from '@/lib/config/glass-config';
import { tableRowVariants } from '@/lib/config/motion-configs';
import type { AuditLog } from '../types/audit.types';

interface AuditLogsTableProps {
  logs: AuditLog[];
  isLoading: boolean;
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRowClick?: (log: AuditLog) => void;
}

function formatDate(date: Date | string): string {
  const d = new Date(date);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function formatEntityType(entityType: string): string {
  const labels: Record<string, string> = {
    User: 'Usuário',
    Company: 'Empresa',
    Organization: 'Organização',
  };
  return labels[entityType] || entityType;
}

export function AuditLogsTable({
  logs,
  isLoading,
  pagination,
  onPageChange,
  onRowClick,
}: AuditLogsTableProps) {
  const startItem = (pagination.page - 1) * pagination.limit + 1;
  const endItem = Math.min(pagination.page * pagination.limit, pagination.total);

  if (isLoading) {
    return (
      <div className={`${glassClasses.card} overflow-hidden`}>
        <Table>
          <TableHeader>
            <TableRow className="border-white/10">
              <TableHead className="text-purple-300">Ação</TableHead>
              <TableHead className="text-purple-300">Entidade</TableHead>
              <TableHead className="text-purple-300">Usuário</TableHead>
              <TableHead className="text-purple-300">Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i} className="border-white/5">
                <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                <TableCell><Skeleton className="h-6 w-28" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className={`${glassClasses.card} p-12 text-center`}>
        <Clock className="h-12 w-12 text-purple-400/50 mx-auto mb-3" />
        <p className="text-muted-foreground">Nenhum log de auditoria encontrado</p>
      </div>
    );
  }

  return (
    <div className={`${glassClasses.card} overflow-hidden`}>
      <Table>
        <TableHeader>
          <TableRow className="border-white/10 hover:bg-transparent">
            <TableHead className="text-purple-300 font-medium">Ação</TableHead>
            <TableHead className="text-purple-300 font-medium">Entidade</TableHead>
            <TableHead className="text-purple-300 font-medium">Usuário</TableHead>
            <TableHead className="text-purple-300 font-medium">Data</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log, index) => (
            <motion.tr
              key={log._id}
              className={`border-white/5 transition-colors ${
                onRowClick ? 'cursor-pointer hover:bg-white/5' : ''
              }`}
              onClick={() => onRowClick?.(log)}
              variants={tableRowVariants}
              initial="hidden"
              animate="visible"
              custom={index}
            >
              <TableCell>
                <ActionChip action={log.action} />
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">
                    {formatEntityType(log.entity)}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono truncate max-w-[120px]">
                    {log.entityId}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                {log.performedByUser?.email ? (
                  <UserChip
                    name={log.performedByUser.name || log.performedByUser.username}
                    email={log.performedByUser.email}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <User className="h-3 w-3" />
                    Sistema
                  </span>
                )}
              </TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground">
                  {formatDate(log.createdAt)}
                </span>
              </TableCell>
            </motion.tr>
          ))}
        </TableBody>
      </Table>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
        <span className="text-sm text-muted-foreground">
          Mostrando {startItem}-{endItem} de {pagination.total}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(pagination.page - 1)}
            disabled={pagination.page <= 1}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-foreground">
            {pagination.page} / {pagination.totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(pagination.page + 1)}
            disabled={pagination.page >= pagination.totalPages}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

AuditLogsTable.displayName = 'AuditLogsTable';
