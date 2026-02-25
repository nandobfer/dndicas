"use client";

import { useUser, useAuth as useClerkAuth } from '@clerk/nextjs';

/**
 * Hook wrapper para autenticação com Clerk
 * Fornece informações do usuário autenticado e funções de controle
 *
 * @example
 * ```tsx
 * const { user, isLoaded, isSignedIn, signOut } = useAuth();
 *
 * if (!isLoaded) return <div>Loading...</div>;
 * if (!isSignedIn) return <div>Please sign in</div>;
 *
 * return <div>Welcome {user.firstName}</div>;
 * ```
 */
export function useAuth() {
  const { user, isLoaded: userLoaded, isSignedIn } = useUser();
  const { signOut, userId } = useClerkAuth();

  return {
      /** Objeto do usuário autenticado (Clerk User) */
      user,
      /** ID do usuário (string) */
      userId,
      /** Se os dados do Clerk foram carregados */
      isLoaded: userLoaded,
      /** Se o usuário está autenticado */
      isSignedIn,
      /** Função para fazer logout */
      signOut: () => signOut(),
      /** Email do usuário */
      email: user?.primaryEmailAddress?.emailAddress || null,
      /** Nome completo do usuário */
      fullName: user?.fullName || null,
      /** Primeiro nome */
      firstName: user?.firstName || null,
      /** Sobrenome */
      lastName: user?.lastName || null,
      /** URL da imagem de perfil */
      imageUrl: user?.imageUrl || null,
      /** Se o usuário é um administrador */
      isAdmin: (user?.publicMetadata?.roles as string[])?.includes("admin") || false
  }
}
