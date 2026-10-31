# Stage 1: Dependencies
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Configura o pnpm usando corepack
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY package.json pnpm-lock.yaml* ./
# Montando o cache do pnpm para acelerar a instalação
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts

# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app

# Ativa o pnpm no builder também
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
# O corepack baixa o pnpm no primeiro uso. O estágio de dependências já fez esse download
# (ele roda `pnpm install`), então o builder reaproveita o cache e não depende da rede:
# no build da prévia o registro npm não resolve (getaddrinfo EAI_AGAIN) e `pnpm run build` falhava.
COPY --from=deps /root/.cache/node/corepack /root/.cache/node/corepack
COPY . .

# ARGS necessárias para o Next.js "injetar" no bundle do cliente durante o 'next build'
ARG AUTH_URL
ARG NEXT_PUBLIC_APP_URL

# Transforma ARGS em ENV para o processo de build
ENV AUTH_URL=$AUTH_URL
ENV NEXTAUTH_URL=$AUTH_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

# Variáveis dummy para evitar erro de validação do Prisma/Zod no build
ENV MONGODB_URI="mongodb://localhost:27017/dummy"
ENV AUTH_SECRET="auth_secret_placeholder"
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm run build

# Stage 3: Runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copiando apenas o necessário para rodar (mantendo a imagem leve)
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/src/lib/5etools-data ./src/lib/5etools-data
# Documentação viva lida pelo Agente Opex em runtime (list/read/search_app_docs).
COPY --from=builder /app/aicontext ./aicontext

USER nextjs

# Ajustado para 4005 para bater com seu docker-compose
EXPOSE 4005

ENV PORT=4005
ENV HOSTNAME="0.0.0.0"

# Comando de inicialização na porta correta
CMD ["node_modules/.bin/next", "start", "-p", "4005"]
