# Testes

Guia para escrever e executar testes no Dungeons & Dicas.

## Executando Testes

```bash
# Arquivos específicos (o modo do dia a dia)
pnpm exec vitest run tests/frontend/core/ui/button.test.tsx

# Testes que dependem dos arquivos de src alterados
pnpm exec vitest related --run src/lib/ai/stream.ts

# Pelo grafo de imports do que mudou no git
pnpm exec vitest run --changed origin/main

# Suíte completa — só com pedido explícito (roda no CI em todo PR e push na main)
pnpm test

# Um shard da suíte, como no CI
pnpm test --shard=1/4

# Com cobertura
pnpm test --coverage
```

Há uma única config (`vitest.config.ts`, ambiente `node`, `maxWorkers: "100%"`) e um único setup
(`tests/setup.ts`). O DOM entra por arquivo; veja "Ambiente dos testes de UI" abaixo e a seção 5 do
`AGENTS.md`.

## Estrutura de Testes

```
tests/
├── backend/             # Rotas, serviços e regras server-side (node)
├── frontend/            # Componentes, hooks e utilitários de UI (happy-dom por arquivo)
├── owlbear/             # Extensões do Owlbear: backend (node) e frontend (happy-dom por arquivo)
├── scripts/             # Testes de scripts e seed-data (node)
├── setup.ts             # Setup único (mocks globais; jest-dom, cleanup e polyfills só no DOM)
└── README.md            # Este arquivo
```

## Ambiente dos testes de UI

Todo teste que renderiza componente, usa hook com `renderHook` ou toca em `window`/`document`/`self`
começa com o docblock:

```typescript
/** @vitest-environment happy-dom */
```

Arquivos sem o docblock rodam em `node` e não pagam o custo de montar um DOM. `jsdom` é exceção,
com o motivo no docblock; hoje nenhum arquivo precisa dele. As diferenças conhecidas do happy-dom e
as regras de mock (construtor como `function`, nada de rede real) estão na seção 5 do `AGENTS.md`.

## Tipos de Testes

### 1. Testes de Componentes

Teste componentes React usando React Testing Library:

```typescript
import { render, screen } from '@testing-library/react';
import { MyComponent } from '@/components/my-component';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### 2. Testes de Hooks

Teste custom hooks:

```typescript
import { renderHook, act } from '@testing-library/react';
import { useMyHook } from '@/core/hooks/useMyHook';

describe('useMyHook', () => {
  it('should update value', () => {
    const { result } = renderHook(() => useMyHook());

    act(() => {
      result.current.setValue('new value');
    });

    expect(result.current.value).toBe('new value');
  });
});
```

### 3. Testes de Utilidades

Teste funções utilitárias:

```typescript
import { myUtilFunction } from '@/core/utils';

describe('myUtilFunction', () => {
  it('should return expected result', () => {
    const result = myUtilFunction('input');
    expect(result).toBe('expected output');
  });
});
```

### 4. Testes de API

Mock de APIs usando MSW ou fetch mock:

```typescript
import { GET } from '@/app/api/example/route';
import { NextRequest } from 'next/server';

describe('GET /api/example', () => {
  it('should return 200', async () => {
    const request = new NextRequest('http://localhost:3000/api/example');
    const response = await GET(request);
    expect(response.status).toBe(200);
  });
});
```

## Mocking

### Mock de Módulos

```typescript
vi.mock('@/core/database/db', () => ({
  default: vi.fn(),
}));
```

### Mock de Auth Interno

```typescript
vi.mock('@/core/auth/server', () => ({
  auth: vi.fn(() => ({ userId: 'user_123' })),
  currentUser: vi.fn(() => ({ id: 'user_123', primaryEmailAddress: { emailAddress: 'test@test.com' } })),
}));
```

### Mock de Fetch

```typescript
global.fetch = vi.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({ data: 'test' }),
  })
);
```

## Cobertura de Testes

Alvo de cobertura:
- **Statements**: 80%+
- **Branches**: 75%+
- **Functions**: 80%+
- **Lines**: 80%+

Foco em testar:
1. Lógica de negócio crítica
2. Componentes reutilizáveis do core
3. Funções utilitárias
4. APIs críticas

## Boas Práticas

1. **Teste comportamento, não implementação**
2. **Um conceito por teste**
3. **Nomes descritivos**
4. **Arrange-Act-Assert pattern**
5. **Evite duplicação com beforeEach**
6. **Mock apenas o necessário**
7. **Testes devem ser independentes**
8. **Evite testes frágeis (que quebram facilmente)**

## Exemplos por Categoria

Veja os testes exemplo em:
- `tests/frontend/core/ui/button.test.tsx` - Componente UI
- `tests/frontend/core/utils/storage.test.ts` - Utilitário

## Continuous Integration

`.github/workflows/ci-cd.yml` roda a suíte em 4 shards paralelos (`pnpm test --shard=i/4`) e o
`tsc --noEmit` em todo pull request e push na `main`; o build e o deploy só acontecem na `main`,
depois de todos os shards e do TypeScript. Os checks aparecem como "Vitest (1/4)"…"Vitest (4/4)" e
"TypeScript".

## Troubleshooting

### Erro: Cannot find module

Verifique o alias em `vitest.config.ts`:

```typescript
resolve: {
  alias: {
    '@': path.resolve(__dirname, './src'),
  },
}
```

### Erro: TextEncoder is not defined

Adicione ao setup único (`tests/setup.ts`):

```typescript
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
```

### Erro ao testar componentes com Next.js

Garanta que o arquivo declare `/** @vitest-environment happy-dom */` na primeira linha.

---

Mantenha uma boa cobertura de testes para garantir qualidade e facilitar refatorações!
