# Testes

Guia para escrever e executar testes no Dungeons & Dicas.

## Executando Testes

```bash
# Executar todos os testes
npm test

# Modo watch (re-executa ao salvar)
npm test -- --watch

# Com cobertura
npm test -- --coverage

# Teste específico
npm test -- button.test.tsx
```

## Estrutura de Testes

```
tests/
├── backend/             # Rotas, serviços e regras server-side (env: node)
├── frontend/            # Componentes, hooks e utilitários de UI (env: jsdom)
├── scripts/             # Testes de scripts e seed-data (env: node)
└── README.md            # Este arquivo
```

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

### Mock de Clerk

```typescript
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(() => ({ userId: 'user_123' })),
  currentUser: vi.fn(() => ({ id: 'user_123', email: 'test@test.com' })),
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

Os testes devem rodar automaticamente no CI/CD antes de merge.

```yaml
# .github/workflows/test.yml
- name: Run tests
  run: npm test -- --ci --coverage
```

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

Adicione ao setup do Vitest adequado (`tests/backend/setup.ts` ou `tests/frontend/setup.ts`):

```typescript
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
```

### Erro ao testar componentes com Next.js

Garanta que o teste esteja em `tests/frontend/**` para rodar com `jsdom`.

---

Mantenha uma boa cobertura de testes para garantir qualidade e facilitar refatorações!
