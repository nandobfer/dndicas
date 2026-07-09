# Entity Understanding Chat

## Objetivo

Adicionar um chat contextual de IA, acionado por um icon button `Entender com IA`, em todo preview de entidade do DnDicas.

O chat deve ajudar o usuario final a entender rapidamente uma entidade de catalogo, como classe, raca, regra, origem, talento, habilidade, magia, monstro ou item. A resposta deve ser curta, util e em pt-BR, sem expor detalhes tecnicos do JSON, schemas, IDs, nomes de campos ou implementacao.

O primeiro clique no botao deve iniciar uma conversa contextual: a IA gera automaticamente um resumo inicial da entidade e, em seguida, o usuario pode continuar perguntando sobre a mesma entidade sem perder o contexto enquanto a sessao estiver ativa.

## Escopo De UI

Cada preview principal de entidade deve exibir um icon button com aparencia premium de IA:

- icone em formato de losango ou simbolo equivalente de IA;
- gradiente animado no padrao azul/roxo do `GlobalSearchFAB` (`from-blue-500/20 via-purple-500/20 to-blue-500/20`);
- tooltip `Entender com IA`;
- posicionamento junto das acoes do header do preview;
- abertura de uma janela flutuante via `src/components/ui/glass-window.tsx` e `WindowProvider`.

A janela deve renderizar uma experiencia de chat:

- baloes de conversa da IA alinhados de um lado;
- baloes de conversa do usuario alinhados do lado oposto;
- skeleton ou estado de carregamento enquanto a primeira resposta esta sendo gerada;
- streaming da resposta da IA conforme chunks chegam do servidor;
- estados de erro em pt-BR com acao simples para tentar novamente.

## Entidades Cobertas

O botao deve aparecer nos previews principais destas entidades:

- `Regra`;
- `Habilidade`;
- `Talento`;
- `Magia`;
- `Classe`;
- `Subclasse`;
- `Origem`;
- `Raça`;
- `Item`;
- `Monstro`;
- `NPC`, quando renderizado como preview independente.

Previews auxiliares ou internos, como `WeaponPreview`, `ArmorPreview`, `ToolPreview`, `ChargesPreview` e `NpcParamPreview`, nao devem receber o botao por padrao para evitar duplicidade visual dentro de um preview maior.

Listagens e paginas de detalhe devem exibir o botao na toolbar externa do card, antes do icone `Abrir em nova janela`. Nesses casos, o preview interno deve ser renderizado com `hideActionIcons: true`, e essa flag deve esconder tambem o botao `Entender com IA` interno para evitar duplicidade.

## Input Do Usuario

O input do chat deve usar `src/features/rules/components/rich-text-editor.tsx` para preservar o suporte existente a mencoes e badges.

Regras do input:

- nao usar `minRows` para resolver a altura inicial;
- inicializar com altura compacta, semelhante a um input normal;
- permitir quebra de linha com `Shift+Enter`;
- enviar a mensagem com `Enter`, desde que nao exista uma sessao de mencao ativa nem composicao IME em andamento;
- manter HTML com mencoes produzido pelo editor;
- bloquear envio vazio depois de remover tags vazias e whitespace.

O `RichTextEditor` deve proteger effects contra instancias destruidas do editor antes de chamar `getHTML`, `getText` ou `commands.setContent`, porque a janela de IA pode montar/desmontar o input durante abertura, fechamento ou minimizacao.

Se o `RichTextEditor` atual nao oferecer esse comportamento, ele deve ser estendido por props especificas e retrocompativeis, por exemplo:

- `submitOnEnter?: boolean`;
- `onSubmitRequest?: () => void`;
- uma variante compacta ou ajuste de classes para `variant="simple"` iniciar com altura normal.

## Renderizacao De Mensagens

Mensagens da IA e do usuario devem ser renderizadas com `MentionContent` para preservar badges e tooltips de entidades.

O texto da IA deve ser tratado como HTML controlado e sanitizado antes de chegar ao componente visual. O texto do usuario pode vir do `RichTextEditor`, mas tambem deve passar por normalizacao/sanitizacao antes de ser enviado ao historico do chat.

## Fluxo Conversacional

O chat deve funcionar como uma sessao multi-turno por entidade e por janela aberta.

Fluxo esperado:

1. O usuario clica em `Entender com IA` no preview de uma entidade, por exemplo a classe `Ladino`.
2. Uma `GlassWindow` abre imediatamente com skeleton/loading.
3. O client dispara a primeira chamada para a API com a entidade completa e sem mensagem manual do usuario.
4. A IA responde com um resumo curto e util sobre `Ladino`.
5. O usuario envia uma pergunta no input, por exemplo sobre um recurso especifico da classe.
6. O client envia novamente a conversa completa da sessao, incluindo resumo inicial, perguntas anteriores, respostas anteriores e a nova pergunta.
7. A IA responde considerando a entidade original e todo o historico ativo.

A conversa deve continuar enquanto a sessao estiver ativa. Fechar a janela encerra a sessao local daquele chat. Se o usuario ficar inativo por aproximadamente 5 minutos, a sessao deve expirar e a proxima interacao deve iniciar uma nova conversa com um novo resumo inicial.

Minimizar a janela nao deve criar uma nova conversa por si so. A sessao pode ser reiniciada se a janela for remontada pelo gerenciador global ou se o TTL de inatividade for atingido.

Regras de contexto:

- a entidade original deve permanecer fixa durante toda a sessao;
- cada nova pergunta deve enviar o historico completo da sessao ativa;
- respostas da IA devem considerar as mensagens anteriores;
- o historico nao precisa ser persistido em banco nesta primeira versao;
- o historico pode viver em estado React enquanto a janela estiver aberta;
- se houver expiração por inatividade, limpar mensagens e reiniciar o fluxo de resumo inicial.

Timeout recomendado:

```ts
const ENTITY_UNDERSTANDING_IDLE_TTL_MS = 5 * 60 * 1000;
```

Esse TTL e de UX/sessao local, nao uma garantia de seguranca. A API continua sendo stateless e recebe o historico enviado pelo client a cada requisicao.

## API

Criar uma rota server-side dedicada:

```http
POST /api/entity-understanding/chat
```

A rota deve:

- usar Zod para validar payload;
- exigir autenticacao;
- nunca expor chave Gemini ao client;
- responder em streaming com `text/event-stream`;
- emitir chunks de texto incrementalmente;
- emitir evento final com metadados basicos quando necessario;
- retornar mensagens de erro acionaveis em pt-BR.

Payload esperado:

```ts
type EntityUnderstandingChatRequest = {
  entityType: string;
  entityId: string;
  entity: unknown;
  mode: "initial_summary" | "conversation";
  messages: Array<{
    role: "user" | "model";
    html: string;
  }>;
};
```

O client deve enviar o JSON completo da entidade ja disponivel no preview. A rota pode buscar novamente a entidade quando precisar validar ou enriquecer dados, mas nao deve depender disso para a primeira resposta.

`mode` diferencia a chamada automatica inicial do resumo das chamadas posteriores feitas apos mensagens do usuario. Em ambos os casos a rota deve receber a entidade e o historico ativo para manter o contexto.

## Streaming

O contrato recomendado e Server-Sent Events:

```txt
event: chunk
data: {"text":"..."}

event: done
data: {"ok":true}
```

Em erro:

```txt
event: error
data: {"message":"Nao foi possivel gerar a resposta agora."}
```

O client deve montar a mensagem da IA incrementalmente e renderizar o conteudo parcial no balao correspondente.

## Prompt

O prompt inicial deve contextualizar o Gemini como um assistente especializado no DnDicas.

Regras para a IA:

- responder sempre em pt-BR;
- explicar para usuario final, nao para desenvolvedor;
- ser breve;
- priorizar uso pratico em mesa, criacao de personagem, preparacao de campanha ou consulta de regras;
- nao mencionar JSON, campos internos, IDs, schemas, banco de dados ou codigo;
- nao inventar regras fora do conteudo recebido;
- se faltar contexto, pedir uma pergunta mais especifica;
- usar HTML simples e seguro;
- quando referenciar entidade existente, usar mencao no formato suportado pelo DnDicas.

Formato de mencao permitido:

```html
<span data-type="mention" data-id="ENTITY_ID" data-label="Nome" data-entity-type="Tipo">Nome</span>
```

Tags HTML permitidas na resposta da IA devem ser limitadas, por exemplo:

- `p`;
- `strong`;
- `em`;
- `ul`;
- `ol`;
- `li`;
- `br`;
- `span[data-type="mention"]` com atributos permitidos.

## Function Calling No Core GenAI

Expandir `src/core/ai/genai.ts` para expor suporte a tools/function-calling do Gemini.

Essa extensao e aceitavel no core porque function-calling e uma capacidade generica do servico de IA, reutilizavel por outras features, e nao uma regra de negocio especifica do DnDicas.

Requisitos para o core:

- manter `generateText`, `generateTextStream`, `chat`, `countTokens` e `generateImage` compativeis;
- adicionar tipos publicos para declaracao de tools, chamadas de tools e respostas de tools;
- expor uma API nova em vez de mudar assinaturas existentes de forma breaking;
- manter logging de uso quando `usageMetadata` estiver disponivel;
- preservar retry para indisponibilidade temporaria;
- documentar que fallback HTTP `genai` pode nao suportar function-calling.

API sugerida:

```ts
export type GenAIToolDeclaration = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type GenAIToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

export type GenAITool = {
  declaration: GenAIToolDeclaration;
  execute: GenAIToolHandler;
};

export async function chatWithToolsStream(input: {
  history: Array<{ role: "user" | "model"; parts: string }>;
  tools: GenAITool[];
  onChunk: (text: string) => void;
  modelName?: string;
  userId?: string;
  maxToolRounds?: number;
}): Promise<void>;
```

O helper deve executar loops controlados:

1. envia historico e declaracoes de tools ao Gemini;
2. se o modelo responder texto, streama ao client;
3. se o modelo solicitar tool call, valida nome e argumentos;
4. executa a tool server-side;
5. envia tool response de volta ao modelo;
6. encerra ao gerar resposta final ou atingir `maxToolRounds`.

## Tools Do Chat DnDicas

A feature deve definir tools no modulo `src/features/entity-understanding/`, usando o suporte generico do core.

Tools iniciais:

### `searchCatalogEntities`

Busca entidades no catalogo unificado.

Parametros:

```ts
{
  query: string;
  types?: string[];
  limit?: number;
}
```

Retorno:

```ts
Array<{
  id: string;
  name: string;
  type: string;
  description?: string;
}>
```

### `getCatalogEntity`

Carrega uma entidade completa por tipo e id.

Parametros:

```ts
{
  entityType: string;
  entityId: string;
}
```

Retorno:

```ts
{
  id: string;
  type: string;
  entity: unknown;
}
```

As tools devem conectar ao banco antes de usar Mongoose e reaproveitar servicos existentes do catalogo sempre que possivel.

## Seguranca E Sanitizacao

O HTML vindo da IA deve passar por sanitizacao antes de ser renderizado.

Regras minimas:

- remover tags fora da allowlist;
- remover atributos fora da allowlist;
- remover handlers como `onclick`;
- bloquear URLs perigosas;
- preservar apenas spans de mencao validos;
- descartar mencoes sem `data-id`, `data-label` ou `data-entity-type`.

O client nao deve executar nenhuma tool diretamente. O browser apenas envia mensagens e recebe texto streamado.

## Integracao Com Previews

Criar um componente compartilhado para abrir a janela, por exemplo:

```tsx
<EntityAIUnderstandButton
  entity={entity}
  entityId={entityId}
  entityType={entityType}
  entityName={name}
/>
```

Esse componente deve encapsular:

- botao animado;
- tooltip;
- abertura de `GlassWindow` via `useWindows`;
- componente de conteudo do chat;
- chamada streaming da API.

Os previews devem apenas fornecer dados da entidade. Em listagens e paginas de detalhe, a toolbar externa fornece o botao; os previews internos devem respeitar `hideActionIcons`.

## Testes

Cobertura minima:

- sanitizacao de HTML da IA;
- montagem do prompt inicial;
- validacao da rota `POST /api/entity-understanding/chat`;
- streaming feliz e erro esperado;
- function-calling no wrapper do core com tools mockadas;
- renderizacao do botao nos previews centrais;
- comportamento do input compacto com `Shift+Enter` e envio por `Enter`.

## Verificacao

Nao executar build completo automaticamente.

Verificacoes recomendadas:

- testes Vitest focados nos arquivos alterados;
- diagnosticos via `aft_inspect`;
- revisao manual da UI em desktop e mobile quando o servidor de desenvolvimento estiver disponivel.
