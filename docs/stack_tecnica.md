# Stack Técnica - Dungeons & Dicas

> Plataforma de Compêndio de D&D em Português para a Comunidade Brasileira

---

## 🎯 Visão Geral

O projeto utiliza Next.js 15+ como base, com um template core já implementado. **Analise o código já existente para implementar no mesmo padrão.**

---

## 🚀 Core Stack

### Framework e Runtime
- **Framework**: Next.js 15+ (App Router)
- **React**: 18+ (Server Components + Client Components)
- **Node.js**: 20+ LTS
- **TypeScript**: 5.0+ (strict mode enabled)

### Linguagem e Tipagem
```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

---

## 🎨 Frontend e Estilização

### Styling
- **CSS Framework**: Tailwind CSS 3+
- **Component Library**: Shadcn/ui
- **Design System**: Liquid Glass + Iluminação (fantasia D&D vintage + tecnologia moderna)
- **Animations**: Framer Motion (transições fluidas e UX aprimorada)

### Design Concept
> **Estética**: Design MUITO moderno com Liquid Glass, translúcidos e iluminação, mesclando o estilo de fantasia e dungeons & dragons antigo com tecnologia e modernidade.

**Referências visuais:**
- Glassmorphism (vidro fosco com blur)
- Iluminação neon sutil em bordas
- Gradientes místicos (roxos, azuis, dourados)
- Tipografia que remete a grimórios antigos + moderna legibilidade
- Ícones de D&D estilizados com glow effects
- Partículas mágicas sutis em backgrounds

---

## 🔐 Autenticação e Segurança

(Auth.js)


---

## 🗄️ Database e ORM

### Database
- **DBMS**: MongoDB (NoSQL)
- **ODM**: Mongoose

### Models (Mongoose Schemas)
```
models/
├── User.ts
├── Character.ts (Ficha de Personagem)
├── Class.ts (Classe)
├── Race.ts (Raça)
├── Background.ts (Origem/Antecedente)
├── Feat.ts (Talento)
├── Spell.ts (Magia)
└── Item.ts (Item/Equipamento)
```

---

## 📊 State Management

### Abordagem Híbrida (O padrão ouro no Next.js 15)

1. **Server-Side Initial Fetch**
   - Fetch inicial dos dados no servidor (performance na primeira carga + SEO)
   - Use Server Components para carregar dados críticos

2. **TanStack React Query (Client-Side)**
   - Passe dados do servidor para TanStack Query via `HydrationBoundary`
   - Assuma o controle no navegador para:
     - Paginação
     - Filtros complexos
     - Polling de indicadores
     - Cache inteligente
     - Refetch automático

3. **Client State**
   - React Context para estado global (tema, preferências)
   - Custom Hooks para lógica de negócio encapsulada
   - `useState` / `useReducer` para estado local de componentes

### Exemplo de Pattern
```typescript
// app/magias/page.tsx (Server Component)
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { getSpells } from '@/lib/api/spells';
import SpellsClient from './spells-client';

export default async function SpellsPage() {
  const queryClient = new QueryClient();
  
  // Fetch inicial no servidor
  await queryClient.prefetchQuery({
    queryKey: ['spells'],
    queryFn: getSpells,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SpellsClient />
    </HydrationBoundary>
  );
}

// spells-client.tsx (Client Component)
'use client';
import { useQuery } from '@tanstack/react-query';

export default function SpellsClient() {
  const { data, isLoading } = useQuery({
    queryKey: ['spells'],
    queryFn: getSpells,
    staleTime: 5 * 60 * 1000, // 5 minutos
  });
  
  // Filtros e paginação no cliente...
}
```

---

## 📝 Forms e Validação

### Forms
- **Library**: React Hook Form
- **Validation**: Zod schemas
- **Features**:
  - Validação client-side e server-side
  - Feedback visual de erros
  - Estados de loading e sucesso
  - Acessibilidade (ARIA labels)

### Exemplo de Pattern
```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const characterSchema = z.object({
  name: z.string().min(3, 'Nome deve ter ao menos 3 caracteres'),
  classId: z.string().uuid('Selecione uma classe válida'),
  level: z.number().min(1).max(20),
});

type CharacterForm = z.infer<typeof characterSchema>;

const form = useForm<CharacterForm>({
  resolver: zodResolver(characterSchema),
});
```

---

## 🎬 Animations e UX

### Framer Motion
- Transições fluidas entre rotas
- Animações de entrada/saída de componentes
- Micro-interações (hover, click, focus)
- Page transitions suaves
- Loading states animados
- Scroll-based animations (parallax sutil)

### Motion Configs Centralizados
```typescript
// lib/config/motion-configs.ts
export const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { duration: 0.3 },
};
```

---

## 🎨 Configurações Centralizadas

### Estrutura de Config
```
lib/config/
├── colors.ts              # Paleta de cores do tema D&D
├── motion-configs.ts      # Animações reutilizáveis
├── dnd-constants.ts       # Constantes de D&D (atributos, níveis, etc)
├── api-endpoints.ts       # URLs das APIs
└── site-config.ts         # Metadados, SEO, informações gerais
```

### Exemplo: Colors Config
```typescript
// lib/config/colors.ts
export const colors = {
  // Liquid Glass Theme
  glass: {
    light: 'rgba(255, 255, 255, 0.1)',
    medium: 'rgba(255, 255, 255, 0.15)',
    dark: 'rgba(0, 0, 0, 0.2)',
  },
  
  // D&D Themed
  magic: {
    arcane: '#8B5CF6',    // Roxo arcano
    divine: '#F59E0B',    // Dourado divino
    nature: '#10B981',    // Verde natural
    fire: '#EF4444',      // Vermelho fogo
    ice: '#3B82F6',       // Azul gelo
  },
  
  // Status colors
  rarity: {
    common: '#9CA3AF',
    uncommon: '#10B981',
    rare: '#3B82F6',
    veryRare: '#8B5CF6',
    legendary: '#F59E0B',
    artifact: '#EF4444',
  },
};
```

### Exemplo: DnD Constants
```typescript
// lib/config/dnd-constants.ts
export const ABILITY_SCORES = [
  'FOR', 'DES', 'CON', 'INT', 'SAB', 'CAR'
] as const;

export const PROFICIENCY_BONUS_BY_LEVEL: Record<number, number> = {
  1: 2, 2: 2, 3: 2, 4: 2,
  5: 3, 6: 3, 7: 3, 8: 3,
  9: 4, 10: 4, 11: 4, 12: 4,
  13: 5, 14: 5, 15: 5, 16: 5,
  17: 6, 18: 6, 19: 6, 20: 6,
};

export const SPELL_LEVELS = [
  'Truque', '1º', '2º', '3º', '4º', '5º', '6º', '7º', '8º', '9º'
] as const;

export const DAMAGE_TYPES = [
  'Ácido', 'Contundente', 'Cortante', 'Elétrico', 'Fogo',
  'Frio', 'Necrótico', 'Perfurante', 'Psíquico', 'Radiante',
  'Trovejante', 'Veneno', 'Energético'
] as const;
```

---

## 🔌 Integração Externa

### Owlbear Rodeo SDK
- **Finalidade**: VTT (Virtual Tabletop) integration
- **Funcionalidades**:
  - Sincronização bidirecional de ficha
  - Atualização de HP em tempo real
  - Rolagem de dados integrada
  - Leitura de estado da sessão
  - Atualização de condições e recursos

### Documentação
- [Owlbear Rodeo SDK Docs](https://docs.owlbear.rodeo/sdk/introduction)

---

## 📦 Dependências Principais

```json
{
  "dependencies": {
    "next": "16.1.4",
    "react": "19.2.3",
    "react-dom": "19.2.3",
    "typescript": "^5.0.0",
    
    "next-auth": "^4.24.14",
    "bcryptjs": "^3.0.3",
    "@tanstack/react-query": "^5.0.0",
    "react-hook-form": "^7.0.0",
    "zod": "^3.0.0",
    "framer-motion": "^12.0.0",
    
    "mongoose": "^9.0.0",
    "axios": "^1.13.2",
    "lucide-react": "^0.563.0",
    
    "tailwindcss": "4.0.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^3.0.0"
  }
}
```


---


### Environment Variables
```env
# .env.local
DATABASE_URL=mongodb+srv://...
NEXT_PUBLIC_APP_URL=http://localhost:3000
OWLBEAR_API_KEY=...
```

---

## 🚢 Deploy

Docker

---

## 📚 Referências

- [Next.js 15 Docs](https://nextjs.org/docs)
- [TanStack Query Docs](https://tanstack.com/query/latest)
- [Shadcn/ui](https://ui.shadcn.com/)
- [Framer Motion](https://www.framer.com/motion/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Mongoose](https://mongoosejs.com/)
- [D&D 5e SRD](https://dnd.wizards.com/resources/systems-reference-document)

---

## ✅ Checklist de Setup Inicial

- [ ] Clonar repositório base com template core
- [ ] Configurar MongoDB Atlas
- [ ] Configurar variáveis de ambiente
- [ ] Instalar dependências (`npm install`)
- [ ] Configurar Tailwind + Shadcn/ui
- [ ] Configurar TanStack Query Provider
- [ ] Implementar authentication flow (Auth.js + credenciais locais)
- [ ] Criar models do Mongoose (Character, Spell, Item, etc. - User é local)
- [ ] Configurar Framer Motion global config
- [ ] Definir paleta de cores (Liquid Glass + D&D theme)
- [ ] Implementar Error Boundaries
- [ ] Configurar ESLint + Prettier
- [ ] Setup de testes (Jest + React Testing Library)
