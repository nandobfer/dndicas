## Sistema de Cores e Botões Centralizados

Este projeto utiliza um sistema centralizado de configuração de cores e estilos de botões para facilitar a manutenção e garantir consistência visual.

### 🎨 Estrutura de Configuração

```
src/lib/config/
├── colors.ts          # Paleta de cores (primária, raridades, ações, roles, glass)
├── button-styles.ts   # Estilos de botões padronizados
├── glass-config.ts    # Configurações de glassmorphism
├── motion-configs.ts  # Animações e transições
└── theme-config.ts    # Agregador de todas as configurações
```

### 🔵 Cor Primária

A cor primária do projeto é definida em `colors.ts`:

```typescript
export const primaryColor = '#3B82F6'; // Blue-500
```

**Para alterar a cor primária em todo o projeto:**

1. Abra [`src/lib/config/colors.ts`](src/lib/config/colors.ts)
2. Altere o valor de `primaryColor`
3. A mudança será refletida automaticamente em:
   - Botões primários
   - Links e interações principais
   - Tema do Clerk
   - Foco de inputs
   - Elementos interativos

### 🎯 Usando Botões

#### Método 1: Classes do Tailwind (Recomendado)

Use as classes CSS pré-definidas em `button-styles.ts`:

```tsx
import { buttons } from '@/lib/config/button-styles';

<button className={buttons.getClasses('primary', 'md')}>
  Ação Principal
</button>

<button className={buttons.getClasses('secondary', 'sm')}>
  Ação Secundária
</button>

<button className={buttons.getClasses('danger', 'lg')}>
  Deletar
</button>
```

#### Método 2: Classes Manuais

```tsx
import { buttonStyles } from '@/lib/config/button-styles';

<button className={buttonStyles.primary.classes}>
  Botão Primário
</button>

<button className={buttonStyles.secondary.classes}>
  Botão Secundário
</button>
```

#### Método 3: Valores Hex (para casos especiais)

```tsx
import { primaryColor } from '@/lib/config/colors';

<div style={{ backgroundColor: primaryColor }}>
  Custom Element
</div>
```

### 📋 Variantes de Botões Disponíveis

| Variante | Uso | Exemplo |
|----------|-----|---------|
| `primary` | Ações principais, CTAs | "Salvar", "Criar", "Enviar" |
| `secondary` | Ações secundárias | "Cancelar", "Voltar" |
| `danger` | Ações destrutivas | "Deletar", "Remover" |
| `ghost` | Ações sutis | Links de navegação |

### 📏 Tamanhos de Botões

| Tamanho | Classes | Uso |
|---------|---------|-----|
| `sm` | `px-3 py-1.5 text-sm` | Botões compactos, filtros |
| `md` | `px-4 py-2 text-sm` | Padrão geral |
| `lg` | `px-6 py-3 text-base` | CTAs destacados |

### 🎨 Paleta de Cores

Baseada no sistema de raridades de D&D:

```typescript
import { colors } from '@/lib/config/colors';

colors.primary          // #3B82F6 (Azul)
colors.rarity.common    // #9CA3AF (Cinza)
colors.rarity.uncommon  // #10B981 (Verde)
colors.rarity.rare      // #3B82F6 (Azul)
colors.rarity.veryRare  // #8B5CF6 (Roxo)
colors.rarity.legendary // #F59E0B (Dourado)
colors.rarity.artifact  // #EF4444 (Vermelho)
```

### 🔄 Importação Centralizada

Importe tudo de uma vez através do `theme-config`:

```tsx
import { themeConfig } from '@/lib/config/theme-config';

// Acesse qualquer configuração:
const primaryBtn = themeConfig.buttons.styles.primary;
const cardGlass = themeConfig.glass.card;
const adminColor = themeConfig.colors.role.admin;
```

### ✅ Exemplos Práticos

#### Botão com ícone

```tsx
import { buttons } from '@/lib/config/button-styles';
import { Plus } from 'lucide-react';

<button className={buttons.getClasses('primary', 'md', 'inline-flex items-center gap-2')}>
  <Plus className="h-4 w-4" />
  Novo Item
</button>
```

#### Botão customizado com classes adicionais

```tsx
import { buttonStyles } from '@/lib/config/button-styles';

<button 
  className={`${buttonStyles.primary.classes} w-full rounded-full`}
>
  Botão Full Width
</button>
```

#### Usando no Clerk (tema escuro)

```tsx
import { primaryColor } from '@/lib/config/colors';

<ClerkProvider
  appearance={{
    baseTheme: dark,
    variables: {
      colorPrimary: primaryColor,
      // ... outras variáveis
    },
  }}
>
  {children}
</ClerkProvider>
```

---

### 📝 Convenções

1. **Sempre use as configurações centralizadas** ao invés de cores hardcoded
2. **Não use classes como `bg-emerald-500`** diretamente - use `buttonStyles`
3. **Para mudanças globais**, edite apenas [`colors.ts`](src/lib/config/colors.ts)
4. **Para novos estilos de botão**, adicione em [`button-styles.ts`](src/lib/config/button-styles.ts)

### 🔍 Checklist para Novos Componentes

- [ ] Importar configurações de `@/lib/config/theme-config` ou sub-configs
- [ ] Usar `buttonStyles` para botões
- [ ] Usar `primaryColor` ou `colors.primary` para elementos interativos
- [ ] Usar `glassConfig` para efeitos de glassmorphism
- [ ] Usar `motionConfig` para animações

---

**Última atualização**: 19 de fevereiro de 2026
