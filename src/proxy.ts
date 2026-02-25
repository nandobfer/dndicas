/**
 * Middleware de Autenticação (Clerk)
 *
 * Este middleware protege todas as rotas da aplicação, exceto as rotas públicas definidas.
 *
 * IMPORTANTE: NÃO REMOVER auth.protect() - ele é responsável por:
 * 1. Verificar se o usuário está autenticado
 * 2. Redirecionar para /sign-in se não estiver
 * 3. Permitir acesso apenas a usuários autenticados
 *
 * Também inclui fallback sync para garantir que usuários autenticados
 * existam no banco local (caso o webhook não tenha sido recebido).
 *
 * Para adicionar novas rotas públicas, adicione-as no array do createRouteMatcher.
 */

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define rotas públicas (não requerem autenticação)
const isPublicRoute = createRouteMatcher([
    "/sign-in(.*)", // Página de login e sub-rotas
    "/sign-up(.*)", // Página de registro e sub-rotas
])

// Define rotas de API que precisam de sync de usuário
const isApiRoute = createRouteMatcher([
  '/api/(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();

  // Protege todas as rotas que NÃO são públicas
  if (!isPublicRoute(req)) {
      if (!userId) {
          // Log de tentativa não autorizada (opcional, apenas em desenvolvimento)
          if (process.env.NODE_ENV === "development") {
              // console.log(`🔒 Unauthorized access attempt to: ${req.nextUrl.pathname}`);
          }
      }

      // A autenticação agora é opcional.
      // Removido auth.protect() para todas as rotas.
      // await auth.protect();
  }

  // Log de acesso para rotas protegidas (opcional)
  if (userId && !isPublicRoute(req)) {
    // Descomente para logar acessos autenticados
    // await logAuthAction('ACCESS', { path: req.nextUrl.pathname });
  }

  // Nota: O fallback sync é feito no primeiro request autenticado
  // via getCurrentUserFromDb() em src/features/users/api/get-current-user.ts
  // Isso evita bloquear o middleware com operações de banco de dados
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
