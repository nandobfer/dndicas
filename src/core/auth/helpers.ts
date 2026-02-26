import { auth, currentUser } from '@clerk/nextjs/server';
import { logAction } from '@/core/database/audit-log';

/**
 * Obtém o usuário atual autenticado (server-side)
 * @returns userId ou null se não autenticado
 */
export async function getCurrentUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

/**
 * Obtém o usuário atual com todos os dados (server-side)
 * @returns Objeto User do Clerk ou null
 */
export async function getCurrentUser() {
  return await currentUser();
}

/**
 * Verifica se o usuário está autenticado (server-side)
 * Lança erro se não estiver autenticado
 * @returns userId
 * @throws Error se não autenticado
 */
export async function requireAuth(): Promise<string> {
  const { userId } = await auth();

  if (!userId) {
    throw new Error('UNAUTHORIZED');
  }

  return userId;
}

/**
 * Verifica se o usuário tem uma role específica
 * @param role - Role a verificar
 * @returns boolean
 */
export async function hasRole(role: string): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;

  const userRole = user.publicMetadata?.role as string | undefined;
  return userRole === role;
}

/**
 * Verifica se o usuário tem alguma das roles especificadas
 * @param roles - Array de roles
 * @returns boolean
 */
export async function hasAnyRole(roles: string[]): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;

  const userRole = user.publicMetadata?.role as string | undefined;
  if (!userRole) return false;

  return roles.includes(userRole);
}

/**
 * Verifica se o usuário tem todas as roles especificadas
 * (Como o sistema tem apenas uma role por usuário, retorna true apenas se 
 * o array contiver apenas a role do usuário ou se for redundante)
 * @param roles - Array de roles
 * @returns boolean
 */
export async function hasAllRoles(roles: string[]): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;

  const userRole = user.publicMetadata?.role as string | undefined;
  if (!userRole) return false;

  // Se pedir múltiplas roles, mas o usuário só pode ter uma,
  // nunca terá "todas" se pedir mais de uma diferente.
  return roles.length === 1 && roles[0] === userRole;
}

/**
 * Loga uma ação de autenticação
 * @param action - Ação realizada (LOGIN, LOGOUT, etc.)
 * @param details - Detalhes adicionais
 */
export async function logAuthAction(
    action: "LOGIN" | "LOGOUT" | "SIGNUP" | "PASSWORD_RESET" | "SESSION_EXPIRED",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    details?: any,
) {
    try {
        const { userId } = await auth()

        await logAction(action, "Auth", userId || "anonymous", userId || undefined, {
            ...details,
            timestamp: new Date().toISOString(),
        })
    } catch (error) {
        console.error("Failed to log auth action:", error)
    }
}

/**
 * Obtém informações básicas do usuário para exibição
 * @returns Objeto com dados básicos ou null
 */
export async function getUserInfo() {
  const user = await currentUser();

  if (!user) return null;

  return {
    id: user.id,
    email: user.primaryEmailAddress?.emailAddress || null,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    imageUrl: user.imageUrl,
  };
}

/**
 * Verifica se o email do usuário está verificado
 * @returns boolean
 */
export async function isEmailVerified(): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;

  const primaryEmail = user.emailAddresses.find(
    (email) => email.id === user.primaryEmailAddressId
  );

  return primaryEmail?.verification?.status === 'verified';
}
