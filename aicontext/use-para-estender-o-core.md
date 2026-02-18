# Use Para Estender o Core

Guia completo para estender funcionalidades do core sem modificá-lo diretamente.

## Princípio Fundamental

**NUNCA modifique arquivos em `src/core/` diretamente nos projetos derivados.**

Em vez disso, use:
1. **Composição** - Componha sobre o core
2. **Wrappers** - Encapsule funcionalidades do core
3. **Extensão** - Estenda tipos e interfaces
4. **Override** - Substitua comportamentos quando necessário

## Estendendo Componentes UI

### Método 1: Wrapper Simples

Crie um wrapper que adiciona funcionalidades:

```typescript
// ✅ src/features/my-feature/components/custom-button.tsx
import { Button, ButtonProps } from '@/core/ui/button';
import { cn } from '@/core/utils';

export function CustomButton({ className, ...props }: ButtonProps) {
  return (
    <Button
      {...props}
      className={cn("my-custom-styles shadow-lg", className)}
    />
  );
}
```

### Método 2: Composição

Componha novos componentes usando os do core:

```typescript
// ✅ src/features/my-feature/components/icon-button.tsx
import { Button, ButtonProps } from '@/core/ui/button';
import { LucideIcon } from 'lucide-react';

interface IconButtonProps extends ButtonProps {
  icon: LucideIcon;
  label: string;
}

export function IconButton({ icon: Icon, label, ...props }: IconButtonProps) {
  return (
    <Button {...props}>
      <Icon className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}
```

### Método 3: Extensão de Variantes

Para adicionar novas variantes sem modificar o core:

```typescript
// ✅ src/features/my-feature/components/branded-button.tsx
import { Button } from '@/core/ui/button';
import { cn } from '@/core/utils';

type BrandVariant = 'brand-primary' | 'brand-secondary' | 'brand-danger';

interface BrandedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BrandVariant;
}

const brandVariants: Record<BrandVariant, string> = {
  'brand-primary': 'bg-brand-primary text-white hover:bg-brand-primary/90',
  'brand-secondary': 'bg-brand-secondary text-white hover:bg-brand-secondary/90',
  'brand-danger': 'bg-red-600 text-white hover:bg-red-700',
};

export function BrandedButton({ variant = 'brand-primary', className, ...props }: BrandedButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md px-4 py-2 font-medium transition-colors",
        brandVariants[variant],
        className
      )}
      {...props}
    />
  );
}
```

## Estendendo Serviços

### Método 1: Wrapper com Lógica Adicional

```typescript
// ✅ src/features/my-feature/services/enhanced-email.ts
import { sendEmail } from '@/core/email/mailer';

/**
 * Envia email com template personalizado
 */
export async function sendTemplatedEmail(
  to: string,
  template: 'welcome' | 'reset-password',
  data: Record<string, any>
) {
  const templates = {
    welcome: (data: any) => `<h1>Bem-vindo, ${data.name}!</h1><p>${data.message}</p>`,
    'reset-password': (data: any) => `<h1>Redefinir Senha</h1><p>Token: ${data.token}</p>`,
  };

  const html = templates[template](data);
  const subjects = {
    welcome: 'Bem-vindo ao Sistema',
    'reset-password': 'Redefinir sua Senha',
  };

  return sendEmail(to, subjects[template], html);
}
```

### Método 2: Serviço Complementar

Crie serviços que usam o core mas adicionam funcionalidades:

```typescript
// ✅ src/features/my-feature/services/ai-assistant.ts
import { generateText } from '@/core/ai/genai';

export class AIAssistant {
  /**
   * Gera resumo de texto longo
   */
  async summarize(text: string, maxLength: number = 100): Promise<string> {
    const prompt = `Resuma o seguinte texto em no máximo ${maxLength} palavras:\n\n${text}`;
    return generateText(prompt);
  }

  /**
   * Traduz texto
   */
  async translate(text: string, targetLanguage: string): Promise<string> {
    const prompt = `Traduza o seguinte texto para ${targetLanguage}:\n\n${text}`;
    return generateText(prompt);
  }

  /**
   * Gera sugestões
   */
  async suggest(context: string, count: number = 3): Promise<string[]> {
    const prompt = `Dado o contexto: "${context}", sugira ${count} ideias relacionadas.`;
    const response = await generateText(prompt);
    return response.split('\n').filter(Boolean).slice(0, count);
  }
}

export const aiAssistant = new AIAssistant();
```

## Estendendo Types

### Método 1: Tipos Específicos do Módulo

```typescript
// ✅ src/features/my-feature/types/index.ts
import { BaseEntity, ApiResponse } from '@/core/types';

/**
 * Estende BaseEntity com campos específicos
 */
export interface MyEntity extends BaseEntity {
  specificField: string;
  anotherField: number;
}

/**
 * Tipo de resposta específico
 */
export interface MyApiResponse<T> extends ApiResponse<T> {
  metadata?: {
    processingTime: number;
    version: string;
  };
}
```

### Método 2: Augmentation de Types Globais

Para adicionar propriedades a tipos do core (use com cautela):

```typescript
// ✅ src/features/my-feature/types/augmentations.d.ts
import { BaseEntity } from '@/core/types';

declare module '@/core/types' {
  interface BaseEntity {
    // Adicione propriedades opcionais apenas
    customField?: string;
  }
}
```

## Estendendo Hooks

### Método 1: Hook Composto

```typescript
// ✅ src/features/my-feature/hooks/use-enhanced-auth.ts
import { useAuth } from '@/core/hooks';
import { useEffect, useState } from 'react';

export function useEnhancedAuth() {
  const auth = useAuth();
  const [permissions, setPermissions] = useState<string[]>([]);

  useEffect(() => {
    if (auth.userId) {
      // Buscar permissões do usuário
      fetchUserPermissions(auth.userId).then(setPermissions);
    }
  }, [auth.userId]);

  const hasPermission = (permission: string) => {
    return permissions.includes(permission);
  };

  return {
    ...auth,
    permissions,
    hasPermission,
  };
}

async function fetchUserPermissions(userId: string): Promise<string[]> {
  // Implementação
  return [];
}
```

### Método 2: Hook Wrapper

```typescript
// ✅ src/features/my-feature/hooks/use-cached-api.ts
import { useApi } from '@/core/hooks';
import { useEffect } from 'react';
import { storage } from '@/core/utils/storage';

export function useCachedApi<T>(
  apiFunction: (...args: any[]) => Promise<any>,
  cacheKey: string,
  cacheDuration: number = 5 * 60 * 1000 // 5 minutos
) {
  const api = useApi<T>(apiFunction);

  // Carregar do cache ao montar
  useEffect(() => {
    const cached = storage.get<{ data: T; timestamp: number }>(cacheKey);

    if (cached && Date.now() - cached.timestamp < cacheDuration) {
      // Usar cache
      api.execute = () => Promise.resolve(cached.data);
    }
  }, [cacheKey]);

  // Salvar no cache após sucesso
  useEffect(() => {
    if (api.state === 'success' && api.data) {
      storage.set(cacheKey, {
        data: api.data,
        timestamp: Date.now(),
      });
    }
  }, [api.state, api.data, cacheKey]);

  return api;
}
```

## Estendendo Utilitários

### Método 1: Utilitários Complementares

```typescript
// ✅ src/features/my-feature/utils/formatters.ts
import { cn } from '@/core/utils';

/**
 * Formata CPF
 */
export function formatCPF(cpf: string): string {
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

/**
 * Formata CNPJ
 */
export function formatCNPJ(cnpj: string): string {
  return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

/**
 * Formata moeda BRL
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}
```

## Estendendo Contextos

### Método 1: Contexto Adicional

```typescript
// ✅ src/features/my-feature/context/feature-context.tsx
"use client";

import React, { createContext, useContext, useState } from 'react';
import { useAppContext } from '@/core/context/app-context';

interface FeatureContextType {
  featureEnabled: boolean;
  toggleFeature: () => void;
}

const FeatureContext = createContext<FeatureContextType | undefined>(undefined);

export function FeatureProvider({ children }: { children: React.ReactNode }) {
  const appContext = useAppContext(); // Usa o contexto do core
  const [featureEnabled, setFeatureEnabled] = useState(false);

  const toggleFeature = () => {
    setFeatureEnabled((prev) => !prev);
  };

  return (
    <FeatureContext.Provider value={{ featureEnabled, toggleFeature }}>
      {children}
    </FeatureContext.Provider>
  );
}

export function useFeatureContext() {
  const context = useContext(FeatureContext);
  if (!context) {
    throw new Error('useFeatureContext must be used within FeatureProvider');
  }
  return context;
}
```

## Override de Comportamento (Casos Especiais)

Em casos raros onde você REALMENTE precisa substituir comportamento do core:

### Método 1: Reimplementação Local

```typescript
// ✅ src/features/my-feature/services/custom-storage.ts
// Reimplementa a interface do core com comportamento diferente

import { S3Client } from '@aws-sdk/client-s3';

class CustomStorageService {
  // Sua implementação customizada que pode ter comportamento diferente
  async uploadFile(key: string, body: Buffer): Promise<void> {
    // Lógica customizada
  }

  async getFileUrl(key: string): Promise<string> {
    // Lógica customizada
    return '';
  }
}

export const customStorage = new CustomStorageService();
```

### Método 2: Feature Flag

```typescript
// ✅ src/features/my-feature/services/storage-service.ts
import { uploadFile as coreUploadFile } from '@/core/storage/s3';
import { customStorage } from './custom-storage';

const USE_CUSTOM_STORAGE = process.env.NEXT_PUBLIC_USE_CUSTOM_STORAGE === 'true';

export async function uploadFile(key: string, body: Buffer) {
  if (USE_CUSTOM_STORAGE) {
    return customStorage.uploadFile(key, body);
  }
  return coreUploadFile(key, body);
}
```

## Melhores Práticas

1. **Preferir Composição sobre Modificação**
   - Sempre componha sobre o core em vez de modificá-lo

2. **Documentar Extensões**
   - Documente suas extensões em `aicontext/modules/`

3. **Manter Compatibilidade**
   - Suas extensões devem funcionar mesmo se o core for atualizado

4. **Evitar Duplicação**
   - Se você está reescrevendo muito do core, talvez deva contribuir para o template

5. **Testes**
   - Teste suas extensões independentemente do core

6. **Namespacing**
   - Use prefixos ou namespaces claros para suas extensões

## Exemplos Práticos

### Componente de Formulário Estendido

```typescript
// ✅ src/features/my-feature/components/company-form.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormField, FormItem, FormLabel, FormControl } from '@/core/ui/form';
import { Input } from '@/core/ui/input';
import { Button } from '@/core/ui/button';

const schema = z.object({
  name: z.string().min(1),
  cnpj: z.string().regex(/^\d{14}$/),
});

export function CompanyForm({ onSubmit }: { onSubmit: (data: any) => void }) {
  const form = useForm({
    resolver: zodResolver(schema),
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Usa componentes do core */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <Button type="submit">Salvar</Button>
      </form>
    </Form>
  );
}
```

---

Seguindo estas diretrizes, você pode estender o core mantendo a capacidade de atualizar o template base.
