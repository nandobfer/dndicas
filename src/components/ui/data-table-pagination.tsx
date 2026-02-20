"use client";

/**
 * @fileoverview Reusable pagination component for data tables.
 * 
 * @example
 * ```tsx
 * <DataTablePagination
 *   page={1}
 *   totalPages={10}
 *   total={100}
 *   limit={10}
 *   onPageChange={setPage}
 *   itemLabel="usuários"
 * />
 * ```
 */

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/core/utils';

export interface DataTablePaginationProps {
  /** Current page number (1-indexed) */
  page: number;
  /** Total number of pages */
  totalPages: number;
  /** Total number of items */
  total: number;
  /** Items per page */
  limit: number;
  /** Page change callback */
  onPageChange: (page: number) => void;
  /** Label for items (e.g., "usuários", "logs") */
  itemLabel?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Reusable pagination component with previous/next buttons and page info.
 */
export function DataTablePagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  itemLabel = 'itens',
  className,
}: DataTablePaginationProps) {
  const startItem = total === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);
  const hasPrevPage = page > 1;
  const hasNextPage = page < totalPages;

  return (
      <div className={cn("flex items-center justify-between px-4 py-3 border-t border-white/10", className)}>
          {/* Item count */}
          <span className="text-sm text-white/50">
              {total === 0 ? (
                  `Nenhum ${itemLabel}`
              ) : (
                  <>
                      Mostrando {startItem} a {endItem} de {total} {itemLabel}
                  </>
              )}
          </span>

          {/* Navigation */}
          <div className="flex items-center gap-2">
              <button
                  onClick={() => onPageChange(page - 1)}
                  disabled={!hasPrevPage}
                  className={cn(
                      "p-2 rounded-lg transition-all duration-200 border border-transparent",
                      hasPrevPage
                          ? "text-white/60 hover:text-white hover:bg-white/10 hover:border-white/10 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] active:scale-95"
                          : "text-white/10 cursor-not-allowed opacity-50",
                  )}
                  aria-label="Página anterior"
              >
                  <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/5 text-xs font-medium text-white/60">
                  <span className="text-white">Página {page}</span>
                  <span className="text-white/20">/</span>
                  <span>{totalPages || 1}</span>
              </div>

              <button
                  onClick={() => onPageChange(page + 1)}
                  disabled={!hasNextPage}
                  className={cn(
                      "p-2 rounded-lg transition-all duration-200 border border-transparent",
                      hasNextPage
                          ? "text-white/60 hover:text-white hover:bg-white/10 hover:border-white/10 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] active:scale-95"
                          : "text-white/10 cursor-not-allowed opacity-50",
                  )}
                  aria-label="Próxima página"
              >
                  <ChevronRight className="h-4 w-4" />
              </button>
          </div>
      </div>
  )
}

DataTablePagination.displayName = 'DataTablePagination';
