# MCP - Fase 2: Token Permanente no Perfil

## Objetivo

Permitir que usuários autenticados criem, copiem e revoguem um token permanente para uso em clientes MCP.

Esse token será usado apenas para autenticar operações protegidas do MCP, principalmente mutações e execuções na central de feedback. A consulta pública do catálogo e a consulta pública de feedbacks continuam funcionando sem token.

## Decisão de Autenticação

O token MCP deve autenticar um usuário local do Dungeons & Dicas usando o `User._id.toString()` como identificador canônico.

O token não deve criar uma sessão Auth.js com cookie. Em vez disso, o servidor MCP deve resolver o token diretamente para um usuário ativo no MongoDB e montar um contexto equivalente ao usuário autenticado para aplicar as mesmas regras de permissão já existentes.

## Relação com o Fluxo Owlbear

O fluxo Owlbear atual usa dois padrões relevantes:

- Handoff temporário assinado por HMAC para transferir login entre abas/iframe.
- Sessão backend com token aleatório, armazenado como hash no MongoDB.

Para MCP, o padrão adequado é o segundo:

- O token é permanente e configurado manualmente em clientes MCP.
- O servidor salva apenas o hash do token.
- O token completo aparece somente no momento da geração.
- O usuário pode revogar o token a qualquer momento.

Não usar o padrão de handoff do Owlbear para MCP porque ele foi desenhado para tokens curtos, com nonce, canal Pusher e expiração rápida.

## Alterações no Modelo de Usuário

Arquivo impactado:

- `src/features/users/models/user.ts`

Campos planejados:

```ts
mcpTokenHash?: string
mcpTokenPrefix?: string
mcpTokenSuffix?: string
mcpTokenCreatedAt?: Date
mcpTokenLastUsedAt?: Date
```

Campo opcional se quisermos preservar histórico de revogação:

```ts
mcpTokenRevokedAt?: Date
```

Índice recomendado:

```ts
UserSchema.index({ mcpTokenHash: 1 }, { unique: true, sparse: true })
```

## Formato do Token

Formato sugerido:

```txt
dndicas_mcp_<segredo-base64url>
```

Geração sugerida:

- `crypto.randomBytes(32).toString("base64url")`
- Prefixo fixo `dndicas_mcp_`
- Hash SHA-256 salvo no MongoDB

Exemplo de armazenamento:

- `mcpTokenHash`: hash SHA-256 do token completo
- `mcpTokenPrefix`: primeiros caracteres visíveis, por exemplo `dndicas_mcp_abcd`
- `mcpTokenSuffix`: últimos 4 a 6 caracteres
- `mcpTokenCreatedAt`: data de geração

## Rotas de API Planejadas

### Expandir `GET /api/auth/profile`

Arquivo:

- `src/app/api/auth/profile/route.ts`

Retornar estado do token sem expor o segredo completo:

```json
{
  "id": "...",
  "name": "...",
  "username": "...",
  "email": "...",
  "role": "admin",
  "mcpToken": {
    "exists": true,
    "prefix": "dndicas_mcp_abcd",
    "suffix": "wxyz",
    "createdAt": "2026-07-28T00:00:00.000Z",
    "lastUsedAt": null
  }
}
```

Quando não houver token:

```json
{
  "mcpToken": {
    "exists": false
  }
}
```

### `POST /api/auth/profile/mcp-token`

Gera ou rotaciona o token MCP do usuário autenticado.

Regras:

- Exige Auth.js via `requireAuth()`.
- Gera token novo.
- Salva hash e metadados no usuário.
- Retorna o token completo uma única vez.
- Registra auditoria.

Resposta sugerida:

```json
{
  "token": "dndicas_mcp_...",
  "prefix": "dndicas_mcp_abcd",
  "suffix": "wxyz",
  "createdAt": "2026-07-28T00:00:00.000Z"
}
```

### `DELETE /api/auth/profile/mcp-token`

Revoga o token MCP do usuário autenticado.

Regras:

- Exige Auth.js via `requireAuth()`.
- Remove hash e metadados do usuário ou marca `mcpTokenRevokedAt`.
- Registra auditoria.

## UI Planejada

Arquivo impactado:

- `src/features/auth/auth-components.tsx`

Componente atual:

- `UserProfile`

Nova seção:

- Título: `Token MCP`
- Descrição: `Use este token nas configurações do seu cliente MCP para operar a central de feedback.`

Estados:

- Loading: skeleton ou spinner compacto.
- Empty state: texto explicando que não há token e botão `Gerar token`.
- Estado gerado: token mascarado, data de criação, botão `Copiar`, botão `Excluir`.
- Estado recém-gerado: exibir token completo temporariamente com alerta `Copie agora. Depois ele não será exibido novamente.`
- Estado de erro: mensagem em pt-BR.

Animações:

- Usar `AnimatePresence` e `motion` do `framer-motion`.
- Animar troca entre empty state, loading e token gerado.
- Usar transições curtas para altura/opacidade.

## Comportamento de Copiar

Regras:

- Após gerar token, botão `Copiar` copia o token completo retornado pelo POST.
- Após recarregar a página, o token completo não existe mais no client; o botão `Copiar` não deve prometer copiar o segredo inteiro se só houver versão mascarada.
- Texto recomendado após reload: `Por segurança, o token completo só aparece ao gerar. Se perdeu o token, exclua e gere outro.`

Alternativa se for obrigatório copiar depois:

- Salvar token reversivelmente criptografado no banco, não apenas hash.
- Essa alternativa não é recomendada inicialmente por aumentar impacto de vazamento de banco.

## Segurança

Regras obrigatórias:

- Nunca salvar o token completo em texto puro.
- Nunca retornar o token completo em `GET /api/auth/profile`.
- Usar comparação por hash no servidor MCP.
- Invalidar imediatamente quando o usuário excluir o token.
- Recusar token de usuário `deleted`, `inactive` ou inexistente.
- Não aceitar token por query string; usar `Authorization: Bearer <token>`.

## Auditoria

Registrar eventos:

- `MCP_TOKEN_CREATE`
- `MCP_TOKEN_DELETE`
- Opcional: `MCP_TOKEN_ROTATE` se a UI permitir gerar outro sem excluir antes.

Metadados úteis:

- `userId`
- `tokenPrefix`
- `createdAt`
- user-agent e IP quando disponível

## Testes Planejados

- `GET /api/auth/profile` retorna `mcpToken.exists: false` sem token.
- `POST /api/auth/profile/mcp-token` exige login.
- `POST /api/auth/profile/mcp-token` retorna token completo uma única vez e salva hash.
- `GET /api/auth/profile` após geração retorna apenas token mascarado.
- `DELETE /api/auth/profile/mcp-token` exige login e revoga token.
- UI mostra empty state, loading, token recém-gerado e estado mascarado.

## Critério de Pronto

- Usuário autenticado consegue gerar token MCP permanente no perfil.
- Token completo é exibido apenas no momento de geração.
- Token pode ser revogado.
- Dados persistidos no MongoDB permitem autenticar chamadas MCP protegidas.
- UI usa estados explícitos e transições com `framer-motion`.
