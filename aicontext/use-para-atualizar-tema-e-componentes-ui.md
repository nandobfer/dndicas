# Use Para Atualizar Tema e Componentes UI

Guia completo para customização de tema e componentes visuais no Dungeons & Dicas.

## Sistema de Temas

O tema é baseado em **variáveis CSS** definidas em `src/app/globals.css`.

### Estrutura de Cores

Todas as cores usam o formato HSL (Hue, Saturation, Lightness):

```css
--primary: 142.1 76.2% 36.3%;  /* H S L */
```

Isso permite fácil ajuste de:
- **Hue (0-360)**: Cor base
- **Saturation (0-100%)**: Intensidade da cor
- **Lightness (0-100%)**: Claro/escuro

### Variáveis de Tema

#### Cores Principais

```css
:root {
  /* Identidade D&D */
  --primary: 142.1 76.2% 36.3%;           /* Verde D&D */
  --primary-foreground: 355.7 100% 97.3%; /* Texto sobre primary */

  /* Cores Secundárias */
  --secondary: 240 4.8% 95.9%;
  --secondary-foreground: 240 5.9% 10%;

  /* Background e Foreground */
  --background: 0 0% 100%;                /* Fundo geral */
  --foreground: 240 10% 3.9%;            /* Texto geral */

  /* Card */
  --card: 0 0% 100%;
  --card-foreground: 240 10% 3.9%;

  /* Muted (elementos discretos) */
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;

  /* Accent (destaques) */
  --accent: 240 4.8% 95.9%;
  --accent-foreground: 240 5.9% 10%;

  /* Destructive (ações de perigo) */
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 0 0% 98%;

  /* Bordas e Inputs */
  --border: 240 5.9% 90%;
  --input: 240 5.9% 90%;
  --ring: 142.1 76.2% 36.3%;             /* Focus ring */

  /* Radius */
  --radius: 0.5rem;                       /* Border radius base */
}
```

#### Dark Mode

```css
.dark {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  --primary: 142.1 70.6% 45.3%;           /* Verde mais claro no dark */
  /* ... outras variáveis ajustadas */
}
```

## Como Customizar o Tema

### 1. Alterar Cor Primária (Identidade Visual)

Para mudar a cor principal da aplicação, ajuste `--primary` e `--ring`:

```css
:root {
  /* Azul */
  --primary: 217 91% 60%;
  --ring: 217 91% 60%;

  /* Roxo */
  --primary: 271 91% 65%;
  --ring: 271 91% 65%;

  /* Laranja */
  --primary: 25 95% 53%;
  --ring: 25 95% 53%;
}
```

Ferramenta útil: [HSL Color Picker](https://hslpicker.com/)

### 2. Ajustar Border Radius

Para interfaces mais arredondadas ou quadradas:

```css
:root {
  --radius: 0;        /* Quadrado */
  --radius: 0.25rem;  /* Levemente arredondado */
  --radius: 0.5rem;   /* Padrão D&D */
  --radius: 1rem;     /* Muito arredondado */
}
```

### 3. Customizar Fonte

Edite `src/app/layout.tsx`:

```typescript
import { Inter, Roboto } from "next/font/google";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const roboto = Roboto({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});
```

E use no globals.css:

```css
:root {
  --font-sans: var(--font-inter);
  --font-mono: var(--font-roboto);
}
```

### 4. Adicionar Novas Variáveis

Se precisar de cores extras para o seu projeto:

```css
:root {
  --brand-blue: 217 91% 60%;
  --brand-yellow: 48 96% 53%;
  --success: 142 76% 36%;
  --warning: 38 92% 50%;
  --info: 199 89% 48%;
}
```

E no Tailwind (via globals.css):

```css
@theme {
  --color-brand-blue: hsl(var(--brand-blue));
  --color-success: hsl(var(--success));
}
```

Uso:
```tsx
<div className="bg-brand-blue text-white">Conteúdo</div>
```

## Componentes UI (ShadCN)

Os componentes base estão em `src/core/ui/`.

### Componentes Disponíveis

- `button.tsx` - Botões com variantes
- `card.tsx` - Cards para conteúdo
- `input.tsx` - Campos de entrada
- `label.tsx` - Labels de formulário
- `form.tsx` - Sistema de formulários
- `select.tsx` - Seletores
- `textarea.tsx` - Áreas de texto
- `dropdown-menu.tsx` - Menus dropdown
- `avatar.tsx` - Avatares de usuário
- `sheet.tsx` - Modais laterais
- `dialog.tsx` - Modais centrais

### Importar Componentes

```typescript
import { Button } from '@/core/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/core/ui/card';
import { Input } from '@/core/ui/input';
```

### Adicionar Novos Componentes ShadCN

Para adicionar componentes do catálogo ShadCN:

```bash
npx shadcn@latest add [component-name]
```

Exemplos:
```bash
npx shadcn@latest add table
npx shadcn@latest add tabs
npx shadcn@latest add toast
npx shadcn@latest add alert
```

Os componentes serão adicionados em `src/core/ui/`.

### Estender Componentes do Core (SEM MODIFICAR)

Se você precisa customizar um componente do core, crie um wrapper:

```typescript
// ❌ NÃO: editar src/core/ui/button.tsx

// ✅ SIM: criar src/features/custom/components/custom-button.tsx
import { Button, ButtonProps } from '@/core/ui/button';

export function CustomButton(props: ButtonProps) {
  return (
    <Button
      {...props}
      className={cn("my-custom-styles", props.className)}
    />
  );
}
```

Ou use composição:

```typescript
import { Button } from '@/core/ui/button';
import { Loader2 } from 'lucide-react';

export function LoadingButton({ isLoading, children, ...props }: Props) {
  return (
    <Button disabled={isLoading} {...props}>
      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </Button>
  );
}
```

## Ícones

Usamos **Lucide React** para ícones:

```typescript
import { Home, User, Settings, Download, Upload } from 'lucide-react';

<Home className="h-4 w-4" />
<User className="h-6 w-6 text-primary" />
```

Catálogo completo: [lucide.dev/icons](https://lucide.dev/icons)

## Utilitários CSS

### cn() - Class Names Helper

Use `cn()` de `@/core/utils` para mesclar classes:

```typescript
import { cn } from '@/core/utils';

<div className={cn(
  "base-classes",
  isActive && "active-classes",
  className
)} />
```

### Tailwind Customizações

Para customizações globais do Tailwind, edite `tailwind.config.ts` (não presente no core por padrão, pode criar se necessário).

## Layout Components

### Sidebar

Edite `src/core/ui/layout/sidebar.tsx` para adicionar itens:

```typescript
export const SidebarItems = [
  { label: "Início", href: "/", icon: Home },
  { label: "Empresas", href: "/companies", icon: Building },
  { label: "Perfil", href: "/profile", icon: User },
];
```

### Topbar

Customizável em `src/core/ui/layout/topbar.tsx`.

## Responsividade

Use breakpoints do Tailwind:

```tsx
<div className="
  grid
  grid-cols-1       /* Mobile */
  md:grid-cols-2    /* Tablet */
  lg:grid-cols-3    /* Desktop */
  gap-4
">
```

Breakpoints:
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px
- `2xl`: 1536px

## Animações

Use Framer Motion (já instalado):

```typescript
import { motion } from 'framer-motion';

<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3 }}
>
  Conteúdo animado
</motion.div>
```

## Dark Mode

Para implementar toggle de dark mode:

```typescript
// Usar next-themes (já instalado)
import { ThemeProvider } from 'next-themes';
import { useTheme } from 'next-themes';

// Em layout.tsx
<ThemeProvider attribute="class" defaultTheme="light">
  {children}
</ThemeProvider>

// Em componente
const { theme, setTheme } = useTheme();
<Button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
  Toggle Theme
</Button>
```

## Exemplos Práticos

### Card Personalizado

```typescript
import { Card, CardHeader, CardTitle, CardContent } from '@/core/ui/card';

export function StatsCard({ title, value, icon: Icon }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
```

### Form com Validação

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/core/ui/form';
import { Input } from '@/core/ui/input';
import { Button } from '@/core/ui/button';

const schema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  email: z.string().email('Email inválido'),
});

export function MyForm() {
  const form = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = (data: z.infer<typeof schema>) => {
    console.log(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* Mais campos */}
        <Button type="submit">Enviar</Button>
      </form>
    </Form>
  );
}
```

---

**Lembre-se**: Nunca modifique diretamente os arquivos do core. Use composição e extensão!
