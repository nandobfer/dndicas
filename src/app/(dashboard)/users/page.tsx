/**
 * @fileoverview Users management page route.
 *
 * @see specs/000/spec.md - FR-008
 */

import { Suspense } from 'react';
import { UsersPage } from '@/features/users/components/users-page';
import { LoadingState } from '@/components/ui/loading-state';

export const metadata = {
  title: 'Usuários | Dungeons & Dicas',
  description: 'Gerenciamento de usuários do sistema',
};

/**
 * Users page with SSR support.
 */
export default function UsersPageRoute() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[400px] flex items-center justify-center">
          <LoadingState variant="spinner" message="Carregando usuários..." />
        </div>
      }
    >
      <UsersPage />
    </Suspense>
  );
}
