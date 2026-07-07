# Consuming GenAI

## Objetivo

Este documento explica como aplicacoes internas devem consumir o microservico `genai`.

O `genai` substitui chamadas diretas ao SDK do Gemini por uma API HTTP interna, simples e controlada.

## Base URL

Via proxy HTTPS:

```txt
https://genai.nandoburgos.dev
```

Ambiente Docker interno, quando a aplicacao consumidora estiver na mesma network Docker do container `genai`:

```txt
http://genai:4007
```

Ambiente local no host:

```txt
http://localhost:4007
```

Observacao: o container publica a porta apenas em `127.0.0.1:4007` no host. Outros containers so conseguem usar `http://genai:4007` se estiverem em uma network Docker compartilhada com o container `genai`.

## Autenticacao

Todas as requisicoes devem enviar:

```http
Authorization: Bearer genai_xxx
Content-Type: application/json
```

Cada aplicacao deve usar sua propria API key.

Nao chamar o `genai` diretamente do frontend. O consumo deve ser feito por backends internos.

## Gerar Texto

Endpoint:

```http
POST /generate
```

Payload minimo:

```json
{
  "prompt": "Escreva uma descricao curta para este produto: Caneca personalizada de ceramica."
}
```

Payload completo:

```json
{
  "prompt": "Escreva uma descricao curta para este produto: Caneca personalizada de ceramica.",
  "model": "google/gemini-2.5-flash",
  "system": "Voce e um redator especializado em e-commerce.",
  "temperature": 0.7,
  "maxOutputTokens": 1000,
  "metadata": {
    "app": "queirozbrindes",
    "feature": "product-description"
  }
}
```

Campos:

- `prompt`: texto principal enviado para a IA. Obrigatorio.
- `model`: modelo desejado. Opcional.
- `system`: instrucao de sistema. Opcional.
- `temperature`: temperatura da geracao, se suportada. Opcional.
- `maxOutputTokens`: limite de tokens de saida, se suportado. Opcional.
- `metadata`: metadados livres para auditoria. Opcional, mas recomendado.

Response:

```json
{
  "id": "run_abc123",
  "model": "google/gemini-2.5-flash",
  "text": "Caneca personalizada de ceramica ideal para brindes corporativos...",
  "usage": {
    "inputTokens": 8992,
    "outputTokens": 128,
    "totalTokens": 9300
  },
  "costUsd": 0.0034401,
  "latencyMs": 1532
}
```

`usage` e `costUsd` sao extraidos do output do `opencode`. Em caso de modelo/provider que nao retorne esses dados, os campos de tokens podem ser `null` e `costUsd` pode ser `null`.

## Modelo Default

Se `model` nao for informado, o servico usa:

```txt
google/gemini-2.5-flash
```

Informe `model` apenas quando a aplicacao realmente precisar sobrescrever o padrao.

O modelo precisa existir no catalogo do `opencode`. O modelo validado atualmente e:

```txt
google/gemini-2.5-flash
```

## Prompt Guard

Antes de enviar o prompt ao `opencode run`, o `genai` envolve a requisicao com um guard interno.

Esse guard instrui a IA a nao usar:

- tools
- skills
- MCP servers
- shell commands
- leitura, escrita, listagem ou inspecao de arquivos
- acesso a rede
- operacoes de sessao do opencode

A IA deve responder apenas em texto. Se a aplicacao enviar um prompt pedindo uso de tools, arquivos ou comandos, a resposta esperada e uma recusa dessa parte operacional e uma resposta textual quando possivel.

O campo `system`, quando enviado, e tratado como uma instrucao da aplicacao, mas o guard interno do `genai` tem precedencia.

## Exemplo Com Fetch

```ts
const response = await fetch('http://genai:4007/generate', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.GENAI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    prompt: 'Explique o que e RAG em uma frase.',
    metadata: {
      app: 'planika',
      feature: 'help-text',
    },
  }),
});

if (!response.ok) {
  throw new Error(`GenAI request failed: ${response.status}`);
}

const data = await response.json();

console.log(data.text);
```

## Adapter Local Recomendado

Cada aplicacao pode criar um helper simples para isolar o consumo do `genai`.

```ts
type GenerateInput = {
  prompt: string;
  model?: string;
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
  metadata?: Record<string, unknown>;
};

type GenerateOutput = {
  id: string;
  model: string;
  text: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
  costUsd: number | null;
  latencyMs: number;
};

export async function generateText(input: GenerateInput): Promise<GenerateOutput> {
  const response = await fetch(`${process.env.GENAI_BASE_URL}/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error?.message ?? `GenAI error: ${response.status}`);
  }

  return response.json() as Promise<GenerateOutput>;
}
```

Uso:

```ts
const result = await generateText({
  prompt: 'Crie uma descricao curta para uma agenda personalizada.',
  metadata: {
    app: 'queirozbrindes',
    feature: 'product-description',
  },
});

console.log(result.text);
```

## Exemplo De Substituicao Do SDK Gemini

Antes, com SDK Gemini direto:

```ts
const result = await gemini.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: 'Escreva uma descricao curta para este produto.',
});
```

Depois, com `genai`:

```ts
const result = await generateText({
  prompt: 'Escreva uma descricao curta para este produto.',
  model: 'google/gemini-2.5-flash',
  metadata: {
    app: 'minha-app',
    feature: 'product-description',
  },
});

console.log(result.text);
```

## Tratamento De Erros

Erros terao formato padronizado:

```json
{
  "error": {
    "code": "OPENCODE_TIMEOUT",
    "message": "The AI request timed out.",
    "requestId": "run_abc123"
  }
}
```

Codigos esperados:

- `UNAUTHORIZED`
- `VALIDATION_ERROR`
- `PROMPT_TOO_LARGE`
- `MODEL_NOT_ALLOWED`
- `OPENCODE_TIMEOUT`
- `OPENCODE_FAILED`
- `INTERNAL_ERROR`

Observacao: o rate limit atual e aplicado pelo servidor HTTP. Em caso de excesso de requisicoes, o servico pode responder `429` no formato padrao do Fastify Rate Limit, nao necessariamente no envelope `error` acima.

Exemplo de tratamento:

```ts
try {
  const result = await generateText({
    prompt: 'Gere um titulo curto para esta campanha.',
    metadata: {
      app: 'forrocwb',
      feature: 'campaign-title',
    },
  });

  return result.text;
} catch (error) {
  console.error('Failed to generate text with GenAI', error);
  return 'Titulo indisponivel no momento';
}
```

## Timeouts No Client

As aplicacoes consumidoras devem configurar timeout proprio.

O timeout interno do servico para o `opencode` e configurado por `REQUEST_TIMEOUT_MS`, atualmente `120000ms`. Quando consumir via `https://genai.nandoburgos.dev`, considere tambem o timeout do proxy/CDN. Para chamadas via Cloudflare, prefira um timeout de client abaixo de 100 segundos.

Exemplo com `AbortController`:

```ts
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 90_000);

try {
  const response = await fetch(`${process.env.GENAI_BASE_URL}/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: 'Resuma este texto em tres frases.',
      metadata: {
        app: 'planika',
        feature: 'summary',
      },
    }),
    signal: controller.signal,
  });

  return await response.json();
} finally {
  clearTimeout(timeout);
}
```

## Metadados Recomendados

Sempre que possivel, enviar:

```json
{
  "metadata": {
    "app": "nome-da-aplicacao",
    "feature": "nome-da-funcionalidade"
  }
}
```

`metadata.app` e util para auditoria funcional, mas nao define autenticacao, permissao ou contabilizacao principal. O app usado para auth, usage report e controle de acesso vem da API key usada na requisicao.

Exemplos de `feature`:

- `product-description`
- `summary`
- `help-text`
- `campaign-title`
- `customer-message`

## Boas Praticas

- Usar uma API key diferente por aplicacao.
- Manter `GENAI_API_KEY` apenas em variaveis de ambiente ou secrets.
- Configurar `GENAI_BASE_URL` por ambiente.
- Nao enviar dados sensiveis desnecessarios no prompt.
- Enviar `metadata.app` e `metadata.feature`.
- Definir timeout na aplicacao consumidora.
- Usar `usage` e `costUsd` para observabilidade, mas tratar `null` como valor possivel.
- Nao chamar o `genai` diretamente do frontend.
- Usar o modelo default sempre que possivel.
- Nao pedir que a IA use tools, MCP, skills, comandos ou arquivos; o servico aplica um guard para impedir esse tipo de uso.

## Limitacoes Atuais

- A resposta e sincrona; nao ha streaming na versao atual.
- `temperature` e `maxOutputTokens` sao aceitos no payload para manter a interface estavel, mas o adapter atual do `opencode` ainda nao aplica esses parametros de forma garantida.
- O servico salva apenas metadados, previews e hashes; nao deve persistir prompt/resposta completos.
- O consumo deve ser feito por backends internos, nao por frontend/browser.
