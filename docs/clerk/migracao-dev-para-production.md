# Migracao Clerk Dev Para Production

## Objetivo

Migrar os usuarios atuais do Clerk development para o Clerk production, preservando o vinculo com os dados locais no MongoDB.

Esta migracao existe porque os ambientes development e production do Clerk sao isolados. Os usuarios criados no ambiente de desenvolvimento nao sao migrados automaticamente para producao, e os IDs de usuario gerados no Clerk production serao diferentes dos IDs atuais.

## Fonte De Dados

- CSV exportado do Clerk development: `docs/clerk/clerk-users-dev.csv`
- MongoDB atual: fonte autoritativa para roles/admins, status e dados locais
- Clerk production: destino dos usuarios migrados

## Premissas

- O email sera usado como chave estavel de reconciliacao entre CSV, MongoDB e Clerk production.
- O ID do Clerk production sera diferente do ID do Clerk development.
- Sessoes nao serao migradas; todos os usuarios precisarao autenticar novamente.
- Roles/admins serao lidos do MongoDB atual, nao do CSV.
- Social login nao sera preservado automaticamente; usuarios poderao precisar reconectar provedores sociais.
- Senhas so serao importadas quando o CSV tiver `password_digest` e `password_hasher` compativeis com o Clerk.
- Usuarios sem senha importavel deverao entrar por convite, magic link, reset de senha ou novo fluxo de senha.
- A migracao de dados locais deve acontecer antes de liberar o ambiente production para uso real.

## Dados Disponiveis No CSV

O arquivo `docs/clerk/clerk-users-dev.csv` contem um snapshot dos usuarios do Clerk development.

| Campo | Uso na migracao |
| --- | --- |
| `id` | ID antigo do Clerk development. Usado para montar o mapa `oldClerkId -> newClerkId`. |
| `first_name` | Nome a ser copiado para o Clerk production. |
| `last_name` | Sobrenome a ser copiado para o Clerk production. |
| `username` | Username a ser copiado para o Clerk production, quando disponivel. |
| `primary_email_address` | Chave principal de reconciliacao. |
| `primary_phone_number` | Nao sera usado inicialmente. |
| `verified_email_addresses` | Referencia de emails verificados no ambiente dev. |
| `unverified_email_addresses` | Referencia de emails nao verificados no ambiente dev. |
| `verified_phone_numbers` | Nao sera usado inicialmente. |
| `unverified_phone_numbers` | Nao sera usado inicialmente. |
| `totp_secret` | Nao sera migrado inicialmente. |
| `password_digest` | Hash de senha para importacao, quando presente. |
| `password_hasher` | Algoritmo do hash de senha. Exemplo: `bcrypt`. |
| `created_at` | Referencia historica; nao define necessariamente a data de criacao no Clerk production. |

## Dados Que Vem Do MongoDB

O MongoDB atual deve ser consultado durante a migracao para preservar dados que nao existem no CSV.

- `User.role`: define se o usuario e `admin` ou `user`.
- `User.status`: preserva usuario `active` ou `inactive`.
- `User.deleted`: evita reativar indevidamente usuarios removidos logicamente.
- `User.clerkId`: ID atual do Clerk development para conferir contra o CSV.
- Campos de ownership em colecoes que guardam IDs do Clerk, como `userId`, `createdBy`, `performedBy` ou campos equivalentes.

## Estrategia Escolhida

1. Ler `docs/clerk/clerk-users-dev.csv`.
2. Para cada linha, buscar o usuario local no MongoDB por email.
3. Ler role, status e flags locais a partir do MongoDB.
4. Criar ou localizar o usuario correspondente no Clerk production por email.
5. Copiar dados basicos para o Clerk production.
6. Definir `publicMetadata.role` no Clerk production conforme `User.role` do MongoDB.
7. Gerar um mapa `oldClerkId -> newClerkId`.
8. Atualizar o MongoDB para trocar referencias ao ID antigo pelo ID novo.
9. Validar login, permissao admin e acesso aos dados existentes.

Usuarios presentes no CSV mas ausentes no MongoDB local sao pulados (`skipped`) por padrao, porque o MongoDB e a fonte autoritativa para roles, status e ownership local.

## Criacao Dos Usuarios No Clerk Production

Para cada usuario do CSV, o script futuro deve:

1. Procurar usuario no Clerk production por `primary_email_address`.
2. Se existir, reutilizar o usuario production encontrado.
3. Se nao existir, criar um novo usuario com:
   - `emailAddress`
   - `username`, quando disponivel
   - `firstName`
   - `lastName`
   - `publicMetadata.role` vindo do MongoDB
   - `passwordDigest` e `passwordHasher`, quando presentes e validos
4. Se nao houver senha importavel, criar usuario de forma que ele possa definir acesso depois por convite, magic link ou reset de senha.

## Mapa Obrigatorio Da Migracao

O script deve gerar um artefato persistente com o resultado da criacao/reconciliacao.

Formato sugerido:

```csv
email,oldClerkId,newClerkId,localUserId,role,status,action
usuario@example.com,user_dev_123,user_prod_456,65f...,admin,active,created
```

Este arquivo sera usado para auditar a migracao e para aplicar as atualizacoes no MongoDB com seguranca.

O script implementado grava os artefatos em `docs/clerk/migration-output/`:

- `migration-map.csv`: mapa auditavel por usuario.
- `migration-report.json`: relatorio completo da reconciliacao com o Clerk production.
- `mongodb-remap-report.json`: contagens por colecao/campo remapeado.

## Colecoes E Campos A Remapear

Lista inicial de campos que podem conter IDs antigos do Clerk development:

- `users.clerkId`
- `characterSheets.userId`
- `owlbearSessions.userId`
- `owlbearRoomNpcs.userId`
- `userNpcs.userId`
- `feedback.createdBy`
- `auditlogs.userId`
- `auditlogs.performedBy`
- `usagelogs.userId`

A lista foi confirmada contra os modelos atuais. A migracao remapeia tambem logs historicos para manter filtros e rastreabilidade usando o novo ID do Clerk production.

IDs sinteticos do Owlbear, como `owlbear-gm:*` e `owlbear-player:*`, nao fazem parte do mapa Clerk e nao sao remapeados.

## Script Implementado

Arquivo principal: `scripts/migrate-clerk-dev-to-prod.ts`.

Utilitarios testaveis: `scripts/clerk-migration-utils.ts`.

Comandos principais:

```bash
pnpm clerk:migrate:dry-run
pnpm clerk:migrate:apply
```

O modo `dry-run` e o caminho seguro inicial. Ele le o CSV, consulta MongoDB e Clerk production, gera relatorios e simula o remapeamento sem criar usuarios e sem alterar o MongoDB.

O modo `apply` exige backup confirmado e so deve ser executado depois do relatorio de `dry-run` ser revisado:

```bash
pnpm clerk:migrate:apply
```

Flags aceitas pelo script:

```bash
tsx scripts/migrate-clerk-dev-to-prod.ts --dry-run
tsx scripts/migrate-clerk-dev-to-prod.ts --apply --confirm-backup
tsx scripts/migrate-clerk-dev-to-prod.ts --csv docs/clerk/clerk-users-dev.csv --out docs/clerk/migration-output --dry-run
tsx scripts/migrate-clerk-dev-to-prod.ts --dry-run --skip-clerk
tsx scripts/migrate-clerk-dev-to-prod.ts --dry-run --skip-mongodb
```

Regras de seguranca do script:

- `dry-run` e o padrao quando `--apply` nao e informado.
- `apply` exige `--confirm-backup`.
- `apply` exige `CLERK_SECRET_KEY` iniciando com `sk_live_`, exceto quando `--skip-clerk` for usado.
- Usuarios sem registro local no MongoDB sao marcados como `skipped`.
- Usuarios locais com `deleted=true` sao marcados como `skipped` para evitar reativacao indevida.
- Divergencia entre `User.clerkId` e `id` do CSV vira erro bloqueante no `apply`.
- Usuarios sem hash importavel recebem `needsAccessSetup=true` no mapa.

## Fluxo Operacional

1. Fazer backup completo do MongoDB.
2. Configurar a aplicacao production no Clerk.
3. Configurar dominio, URLs de login/cadastro e provedores desejados no Clerk production.
4. Configurar o webhook production apontando para `/api/webhooks/clerk`.
5. Preparar secrets de migracao com `CLERK_SECRET_KEY` production e `MONGODB_URI` correto.
6. Rodar o script de migracao em modo `dry-run`.
7. Revisar o relatorio do `dry-run`.
8. Corrigir inconsistencias de email, username ou usuario local antes de aplicar.
9. Rodar o script em modo `apply`.
10. Revisar o mapa `oldClerkId -> newClerkId` gerado.
11. Rodar verificacoes de usuarios orfaos e dados remapeados.
12. Trocar a aplicacao para `pk_live` e `sk_live` apenas depois da migracao validada.
13. Testar login com um admin e um usuario comum.

## Validacoes Obrigatorias

- O total de usuarios processados deve bater com o total de linhas do CSV, excluindo o cabecalho.
- Todo email do CSV deve ter resultado claro: `created`, `reused`, `skipped` ou `error`.
- Todo usuario local ativo esperado deve ter um `newClerkId`.
- Admins no MongoDB devem continuar admins no Clerk production e no MongoDB.
- Um usuario comum deve conseguir acessar suas fichas apos login.
- Um admin deve conseguir listar usuarios e fichas administrativas.
- O webhook production deve aceitar eventos assinados com o `CLERK_WEBHOOK_SECRET` production.
- Nao devem restar fichas orfas apontando para IDs antigos do Clerk development.

## Rollback

Se a migracao falhar antes da liberacao do production:

1. Restaurar o backup do MongoDB.
2. Voltar variaveis da aplicacao para as chaves Clerk development, se necessario.
3. Registrar usuarios criados no Clerk production para limpeza manual ou nova tentativa.
4. Nao reutilizar parcialmente um mapa de migracao sem validar todos os registros novamente.

Depois que usuarios reais comecarem a usar o ambiente production, rollback deve ser tratado como operacao de recuperacao de dados, nao apenas troca de chaves.

## Riscos E Cuidados

- Nunca commitar secrets do Clerk ou MongoDB.
- Nao misturar `sk_test` com `pk_live`, nem `sk_live` com `pk_test`.
- Nao rodar atualizacao destrutiva no MongoDB sem backup e `dry-run` revisado.
- Evitar login de usuarios durante a janela de migracao.
- Conferir manualmente usuarios com email nao verificado ou sem senha importavel.
- Tratar username duplicado no Clerk production como erro revisavel, nao como ajuste silencioso.
- Guardar o mapa de migracao como evidencia operacional.

## Resultado Esperado

Ao final da migracao:

- O Clerk production contem os usuarios atuais do Clerk development.
- O MongoDB aponta para os novos IDs do Clerk production.
- Roles/admins foram preservados a partir do MongoDB atual.
- Fichas, NPCs, feedbacks e demais dados com ownership continuam acessiveis pelos usuarios corretos.
- A aplicacao pode operar com `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_*` e `CLERK_SECRET_KEY=sk_live_*`.
