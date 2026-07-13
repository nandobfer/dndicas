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
COPY . .

# ARGS necessárias para o Next.js "injetar" no bundle do cliente durante o 'next build'
ARG AUTH_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_PUSHER_HOST
ARG NEXT_PUBLIC_PUSHER_PORT
ARG NEXT_PUBLIC_PUSHER_SCHEME
ARG NEXT_PUBLIC_PUSHER_CLUSTER
ARG NEXT_PUBLIC_PUSHER_APP_KEY

# Transforma ARGS em ENV para o processo de build
ENV AUTH_URL=$AUTH_URL
ENV NEXTAUTH_URL=$AUTH_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_PUSHER_HOST=$NEXT_PUBLIC_PUSHER_HOST
ENV NEXT_PUBLIC_PUSHER_PORT=$NEXT_PUBLIC_PUSHER_PORT
ENV NEXT_PUBLIC_PUSHER_SCHEME=$NEXT_PUBLIC_PUSHER_SCHEME
ENV NEXT_PUBLIC_PUSHER_CLUSTER=$NEXT_PUBLIC_PUSHER_CLUSTER
ENV NEXT_PUBLIC_PUSHER_APP_KEY=$NEXT_PUBLIC_PUSHER_APP_KEY

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

USER nextjs

# Ajustado para 4005 para bater com seu docker-compose
EXPOSE 4005

ENV PORT=4005
ENV HOSTNAME="0.0.0.0"

# Comando de inicialização na porta correta
CMD ["node_modules/.bin/next", "start", "-p", "4005"]
