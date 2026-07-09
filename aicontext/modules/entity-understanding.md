# Módulo: Entendimento de Entidades com IA

## Objetivo

Oferecer o chat `Entender com IA` em previews de entidades do catálogo, iniciando com um resumo automático e permitindo perguntas multi-turno sobre a mesma entidade.

## Estrutura

- `src/features/entity-understanding/components/entity-ai-understand-button.tsx`: botão premium e tooltip que abrem uma `GlassWindow` pelo `WindowProvider`.
- `src/features/entity-understanding/components/entity-ai-chat-window-content.tsx`: conteúdo client-side do chat exibido dentro da janela.
- `src/app/api/entity-understanding/chat/route.ts`: rota SSE pública para conversar com a IA.
- `src/features/entity-understanding/services/entity-understanding-prompt.ts`: prompt e histórico enviados ao Gemini.
- `src/features/entity-understanding/services/entity-understanding-html.ts`: sanitização e validação de HTML/mensagens.
- `src/features/entity-understanding/services/entity-understanding-storage.ts`: persistência client-side da sessão no `localStorage` por entidade.
- `src/features/entity-understanding/services/entity-understanding-tools.ts`: tools server-side de catálogo para function-calling.
- `src/core/ai/genai.ts`: expõe `chatWithToolsStream` como wrapper genérico de function-calling Gemini.

## Fluxo

1. O usuário clica em `Entender com IA` no preview.
2. Uma `GlassWindow` abre e inicia `mode: "initial_summary"`.
3. A IA streama um resumo curto em pt-BR.
4. O usuário pode enviar perguntas pelo `RichTextEditor`.
5. Cada nova chamada usa `mode: "conversation"` e envia o histórico ativo completo.
6. O histórico é salvo no `localStorage` por entidade para sobreviver a minimizar/restaurar a janela.
7. A sessão local expira por inatividade.

## Regras

- O input envia com `Enter` e insere nova linha com `Shift+Enter`.
- O `RichTextEditor` usado no chat deve validar `editor && !editor.isDestroyed` antes de acessar `getHTML`, `getText` ou `commands.setContent` em effects assíncronos.
- O chat mantém contexto apenas no client; a API é stateless.
- O histórico ativo deve ser persistido no `localStorage` com chave `entity-understanding:chat:<entityType>:<entityId>`.
- Persistir apenas mensagens e `lastActivity`; não persistir input parcial, loading ou erro.
- O TTL de inatividade local é `ENTITY_UNDERSTANDING_IDLE_TTL_MS = 24 * 60 * 60 * 1000`.
- A IA não deve expor JSON, IDs, campos internos, schemas ou detalhes técnicos.
- HTML de resposta da IA sempre deve passar por sanitização antes de renderizar com `MentionContent`.
- Tools são executadas apenas no servidor e nunca expostas diretamente ao browser.

## Entidades

O botão deve aparecer nos previews principais de Regra, Habilidade, Talento, Magia, Classe, Subclasse, Origem, Raça, Item, Monstro e NPC quando houver preview independente.

Previews auxiliares internos não devem ganhar botão por padrão para evitar duplicidade visual.

Em listagens (`EntityList`) e páginas de detalhe (`EntityPage`), o botão é exibido na toolbar externa do card antes do ícone `Abrir em nova janela`. Nessas superfícies, o preview interno deve ser renderizado com `hideActionIcons: true`, e previews principais devem tratar essa flag como ocultação do botão `Entender com IA` interno também.

O visual do botão segue o padrão azul/roxo do `GlobalSearchFAB`, usando gradiente `from-blue-500/20 via-purple-500/20 to-blue-500/20`, vidro `bg-black/40 backdrop-blur-[4px]` e ícone azul com hover branco.
