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
 * Para adicionar novas rotas públicas, adicione-as no array do createRouteMatcher.
 */

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define rotas públicas (não requerem autenticação)
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',          // Página de login e sub-rotas
  '/sign-up(.*)',          // Página de registro e sub-rotas
  '/api/webhooks(.*)',     // Webhooks do Clerk (não devem ser protegidos)
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();

  // Protege todas as rotas que NÃO são públicas
  if (!isPublicRoute(req)) {
    if (!userId) {
      // Log de tentativa não autorizada (opcional, apenas em desenvolvimento)
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔒 Unauthorized access attempt to: ${req.nextUrl.pathname}`);
      }
    }

    // CRÍTICO: Esta linha protege a rota
    // Remove ou comente esta linha e a autenticação para de funcionar
    await auth.protect();
  }

  // Log de acesso para rotas protegidas (opcional)
  if (userId && !isPublicRoute(req)) {
    // Descomente para logar acessos autenticados
    // await logAuthAction('ACCESS', { path: req.nextUrl.pathname });
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
