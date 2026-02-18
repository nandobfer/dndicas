# Componentes de Interface (UI)

## Visão Geral

O core fornece uma biblioteca completa de **27 componentes** de interface baseados em:
- **Radix UI**: Componentes acessíveis e headless
- **Tailwind CSS v4**: Estilização moderna e responsiva
- **Class Variance Authority (CVA)**: Variantes e estados
- **Lucide React**: Ícones
- **Sonner**: Toast notifications

## Localização dos Componentes

Todos os componentes estão em `src/core/ui/`:
- Componentes são reutilizáveis e seguem padrões de design consistentes
- Componentes usam `cn()` utility para merge de classes
- Acessibilidade é prioridade (ARIA, keyboard navigation)

## Componentes Disponíveis

### Botões e Ações

#### Button
Botão principal com variantes e tamanhos.

```typescript
import { Button } from '@/core/ui/button';

// Variantes
<Button variant="default">Default</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="destructive">Destructive</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>

// Tamanhos
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
<Button size="icon"><Icon /></Button>

// Com ícones
<Button>
  <Mail className="mr-2 h-4 w-4" />
  Enviar Email
</Button>

// Estados
<Button disabled>Desabilitado</Button>
```

**Localização**: `src/core/ui/button.tsx`

#### Dropdown Menu
Menu dropdown com itens, separadores e labels.

```typescript
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from '@/core/ui/dropdown-menu';

<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline">Menu</Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
    <DropdownMenuSeparator />
    <DropdownMenuItem>
      <User className="mr-2 h-4 w-4" />
      Perfil
    </DropdownMenuItem>
    <DropdownMenuItem>Configurações</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

**Localização**: `src/core/ui/dropdown-menu.tsx`

### Formulários e Inputs

#### Input
Campo de texto com suporte a tipos HTML.

```typescript
import { Input } from '@/core/ui/input';
import { Label } from '@/core/ui/label';

<div>
  <Label htmlFor="email">Email</Label>
  <Input id="email" type="email" placeholder="email@exemplo.com" />
</div>
```

**Localização**: `src/core/ui/input.tsx`

#### Textarea
Campo de texto multilinha.

```typescript
import { Textarea } from '@/core/ui/textarea';

<Textarea placeholder="Digite seu texto..." rows={4} />
```

**Localização**: `src/core/ui/textarea.tsx`

#### Select
Seletor dropdown usando Radix UI.

```typescript
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/core/ui/select';

<Select>
  <SelectTrigger>
    <SelectValue placeholder="Selecione..." />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="1">Opção 1</SelectItem>
    <SelectItem value="2">Opção 2</SelectItem>
    <SelectItem value="3">Opção 3</SelectItem>
  </SelectContent>
</Select>
```

**Localização**: `src/core/ui/select.tsx`

#### Switch
Toggle switch para configurações.

```typescript
import { Switch } from '@/core/ui/switch';

<Switch
  checked={enabled}
  onCheckedChange={setEnabled}
/>
```

**Localização**: `src/core/ui/switch.tsx`

#### Checkbox
Caixa de seleção.

```typescript
import { Checkbox } from '@/core/ui/checkbox';

<div className="flex items-center space-x-2">
  <Checkbox id="terms" checked={accepted} onCheckedChange={setAccepted} />
  <Label htmlFor="terms">Aceito os termos</Label>
</div>
```

**Localização**: `src/core/ui/checkbox.tsx`

#### Form
Wrapper para formulários com validação.

```typescript
import { Form } from '@/core/ui/form';

// Usar com react-hook-form + zod
// Ver exemplos nas páginas de CRUD
```

**Localização**: `src/core/ui/form.tsx`

### Feedback e Mensagens

#### Alert
Mensagens de alerta com variantes de cor.

```typescript
import { Alert, AlertTitle, AlertDescription } from '@/core/ui/alert';

<Alert variant="default">
  <AlertTitle>Informação</AlertTitle>
  <AlertDescription>Mensagem informativa.</AlertDescription>
</Alert>

<Alert variant="success">
  <AlertTitle>Sucesso!</AlertTitle>
  <AlertDescription>Operação concluída.</AlertDescription>
</Alert>

<Alert variant="warning">
  <AlertTitle>Atenção</AlertTitle>
  <AlertDescription>Requer confirmação.</AlertDescription>
</Alert>

<Alert variant="destructive">
  <AlertTitle>Erro</AlertTitle>
  <AlertDescription>Algo deu errado.</AlertDescription>
</Alert>

<Alert variant="info">
  <AlertTitle>Dica</AlertTitle>
  <AlertDescription>Informação útil.</AlertDescription>
</Alert>
```

**Localização**: `src/core/ui/alert.tsx`

#### Progress
Barra de progresso.

```typescript
import { Progress } from '@/core/ui/progress';

<Progress value={60} showLabel />
```

**Localização**: `src/core/ui/progress.tsx`

#### Skeleton
Loading placeholder.

```typescript
import { Skeleton } from '@/core/ui/skeleton';

<div className="space-y-2">
  <Skeleton className="h-4 w-full" />
  <Skeleton className="h-4 w-3/4" />
</div>
```

**Localização**: `src/core/ui/skeleton.tsx`

#### Toast
Notificações toast usando Sonner.

```typescript
import { toast } from 'sonner';
import { Toaster } from '@/core/ui/toast';

// No layout principal (já incluído)
<Toaster />

// Uso
toast.success("Operação realizada com sucesso!");
toast.error("Ocorreu um erro!");
toast.info("Informação importante");
toast.warning("Atenção necessária");

// Com ação
toast("Mensagem", {
  action: {
    label: "Desfazer",
    onClick: () => toast.success("Ação desfeita!"),
  },
});
```

**Localização**: `src/core/ui/toast.tsx`

**IMPORTANTE**: O componente `<Toaster />` já está incluído no layout principal (`src/app/layout.tsx`).

### Dados e Display

#### Badge
Indicadores de status, tags, contadores.

```typescript
import { Badge } from '@/core/ui/badge';

// Variantes
<Badge variant="default">Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="destructive">Destructive</Badge>
<Badge variant="outline">Outline</Badge>
<Badge variant="success">Success</Badge>
<Badge variant="warning">Warning</Badge>
<Badge variant="info">Info</Badge>

// Exemplos de uso
<Badge variant="success">Ativo</Badge>
<Badge variant="destructive">Alta Prioridade</Badge>
<Badge variant="outline">12</Badge>
```

**Localização**: `src/core/ui/badge.tsx`

#### Card
Container para conteúdo agrupado.

```typescript
import { Card } from '@/core/ui/card';

<Card className="p-6">
  <h3>Título do Card</h3>
  <p>Conteúdo do card...</p>
</Card>
```

**Localização**: `src/core/ui/card.tsx`

#### Avatar
Imagens de perfil circulares.

```typescript
import { Avatar } from '@/core/ui/avatar';

<Avatar>
  <img src="/avatar.png" alt="User" />
</Avatar>

<Avatar>
  <div className="flex h-full w-full items-center justify-center bg-primary text-primary-foreground">
    JD
  </div>
</Avatar>
```

**Localização**: `src/core/ui/avatar.tsx`

### Layout e Organização

#### Tabs
Navegação em abas.

```typescript
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/core/ui/tabs';

<Tabs defaultValue="tab1">
  <TabsList>
    <TabsTrigger value="tab1">Tab 1</TabsTrigger>
    <TabsTrigger value="tab2">Tab 2</TabsTrigger>
  </TabsList>
  <TabsContent value="tab1">
    Conteúdo da Tab 1
  </TabsContent>
  <TabsContent value="tab2">
    Conteúdo da Tab 2
  </TabsContent>
</Tabs>
```

**Localização**: `src/core/ui/tabs.tsx`

#### Separator
Divisores horizontais ou verticais.

```typescript
import { Separator } from '@/core/ui/separator';

<div>
  <p>Conteúdo acima</p>
  <Separator className="my-4" />
  <p>Conteúdo abaixo</p>
</div>

// Vertical
<div className="flex gap-4">
  <span>Item 1</span>
  <Separator orientation="vertical" className="h-4" />
  <span>Item 2</span>
</div>
```

**Localização**: `src/core/ui/separator.tsx`

#### Sheet
Side panel (drawer).

```typescript
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/core/ui/sheet';

<Sheet>
  <SheetTrigger asChild>
    <Button>Abrir Menu</Button>
  </SheetTrigger>
  <SheetContent side="left">
    <SheetTitle>Título</SheetTitle>
    <div>Conteúdo do sheet...</div>
  </SheetContent>
</Sheet>
```

**Localização**: `src/core/ui/sheet.tsx`

#### VisuallyHidden
Oculta visualmente mantendo acessibilidade.

```typescript
import { VisuallyHidden } from '@/core/ui/visually-hidden';

<VisuallyHidden>
  <h1>Título para leitores de tela</h1>
</VisuallyHidden>
```

**Localização**: `src/core/ui/visually-hidden.tsx`

#### Accordion
Conteúdo expansível com animações.

```typescript
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/core/ui/accordion';

<Accordion type="single" collapsible>
  <AccordionItem value="item-1">
    <AccordionTrigger>Item 1</AccordionTrigger>
    <AccordionContent>
      Conteúdo do primeiro item.
    </AccordionContent>
  </AccordionItem>
  <AccordionItem value="item-2">
    <AccordionTrigger>Item 2</AccordionTrigger>
    <AccordionContent>
      Conteúdo do segundo item.
    </AccordionContent>
  </AccordionItem>
</Accordion>
```

**Localização**: `src/core/ui/accordion.tsx`

### Overlays e Modais

#### Dialog
Modal/Dialog com overlay.

```typescript
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/core/ui/dialog';

<Dialog>
  <DialogTrigger asChild>
    <Button>Abrir Dialog</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Título do Dialog</DialogTitle>
      <DialogDescription>
        Descrição do modal.
      </DialogDescription>
    </DialogHeader>
    <div>Conteúdo...</div>
    <DialogFooter>
      <Button variant="outline">Cancelar</Button>
      <Button>Salvar</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Localização**: `src/core/ui/dialog.tsx`

#### Popover
Menu flutuante posicionado.

```typescript
import { Popover, PopoverContent, PopoverTrigger } from '@/core/ui/popover';

<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline">Abrir</Button>
  </PopoverTrigger>
  <PopoverContent>
    <div className="space-y-2">
      <h4 className="font-medium">Popover Title</h4>
      <p>Conteúdo do popover.</p>
    </div>
  </PopoverContent>
</Popover>
```

**Localização**: `src/core/ui/popover.tsx`

#### Tooltip
Dica de contexto ao passar o mouse.

```typescript
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/core/ui/tooltip';

<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="outline">Hover me</Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>Informação adicional</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

**Localização**: `src/core/ui/tooltip.tsx`

**IMPORTANTE**: Envolva os tooltips com `<TooltipProvider>` uma vez no nível superior ou por grupo.

### Seleção e Escolha

#### Radio Group
Seleção única entre opções.

```typescript
import { RadioGroup, RadioGroupItem } from '@/core/ui/radio-group';
import { Label } from '@/core/ui/label';

<RadioGroup value={value} onValueChange={setValue}>
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="option1" id="option1" />
    <Label htmlFor="option1">Opção 1</Label>
  </div>
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="option2" id="option2" />
    <Label htmlFor="option2">Opção 2</Label>
  </div>
</RadioGroup>
```

**Localização**: `src/core/ui/radio-group.tsx`

#### Combobox
Select com busca integrada.

```typescript
import { Combobox, ComboboxOption } from '@/core/ui/combobox';

const options: ComboboxOption[] = [
  { value: "react", label: "React" },
  { value: "vue", label: "Vue" },
  { value: "angular", label: "Angular" },
];

<Combobox
  options={options}
  value={value}
  onValueChange={setValue}
  placeholder="Selecione um framework..."
  searchPlaceholder="Buscar..."
  emptyText="Nenhum resultado."
/>
```

**Localização**: `src/core/ui/combobox.tsx`

### Tabelas e Dados

#### DataTable
Tabela com filtro, ordenação e paginação.

```typescript
import { DataTable, Column } from '@/core/ui/data-table';

interface Item {
  id: string;
  name: string;
  status: string;
}

const columns: Column<Item>[] = [
  { key: "id", header: "ID", sortable: true },
  { key: "name", header: "Nome", sortable: true },
  {
    key: "status",
    header: "Status",
    sortable: true,
    render: (item) => <Badge>{item.status}</Badge>
  },
];

<DataTable
  data={items}
  columns={columns}
  pageSize={10}
/>
```

**Localização**: `src/core/ui/data-table.tsx`

**Features**:
- Filtro de texto global
- Ordenação por colunas (clique no header)
- Paginação automática
- Customização de renderização por coluna
- Responsiva

## Página de Demonstração

Acesse `/ui-components` para ver todos os componentes em ação com exemplos interativos.

**Localização**: `src/app/(dashboard)/ui-components/page.tsx`

A página de demonstração inclui **8 abas organizadas**:
1. **Botões** - Button, Dropdown Menu
2. **Inputs** - Input, Textarea, Select, Combobox, Switch, Checkbox, Radio Group
3. **Feedback** - Toast, Alert, Progress, Skeleton
4. **Dados** - Badge, Avatar
5. **Layout** - Cards, Separator, Accordion
6. **Overlays** - Dialog, Popover, Tooltip
7. **Avançados** - Tabs aninhadas, combinações complexas
8. **Tabelas** - DataTable completa, tabelas simples

Todos com exemplos interativos funcionais!

## Utility: cn()

Todos os componentes usam a função `cn()` para merge de classes CSS:

```typescript
import { cn } from '@/core/utils';

<div className={cn(
  "base-classes",
  condition && "conditional-class",
  className // props
)} />
```

**Localização**: `src/core/utils/index.ts`

## Padrões de Uso

### Formulário Completo

```typescript
import { Input } from '@/core/ui/input';
import { Label } from '@/core/ui/label';
import { Button } from '@/core/ui/button';
import { Card } from '@/core/ui/card';

<Card className="p-6">
  <h3 className="text-lg font-semibold mb-4">Cadastro</h3>
  <div className="space-y-4">
    <div>
      <Label htmlFor="name">Nome</Label>
      <Input id="name" placeholder="Seu nome" />
    </div>
    <div>
      <Label htmlFor="email">Email</Label>
      <Input id="email" type="email" placeholder="seu@email.com" />
    </div>
    <Button className="w-full">Enviar</Button>
  </div>
</Card>
```

### Status com Badge

```typescript
import { Badge } from '@/core/ui/badge';

function StatusBadge({ status }: { status: string }) {
  const variants = {
    active: 'success',
    pending: 'warning',
    inactive: 'destructive',
  } as const;

  return <Badge variant={variants[status]}>{status}</Badge>;
}
```

### Confirmação com Alert

```typescript
import { Alert, AlertTitle, AlertDescription } from '@/core/ui/alert';
import { Button } from '@/core/ui/button';

<Alert variant="warning">
  <AlertTitle>Confirmar Exclusão</AlertTitle>
  <AlertDescription>
    Esta ação não pode ser desfeita.
  </AlertDescription>
  <div className="flex gap-2 mt-4">
    <Button variant="destructive" size="sm">Excluir</Button>
    <Button variant="outline" size="sm">Cancelar</Button>
  </div>
</Alert>
```

### Loading State

```typescript
import { Skeleton } from '@/core/ui/skeleton';

function UserCard({ loading, user }) {
  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-12 rounded-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  return <div>{/* user data */}</div>;
}
```

## Acessibilidade

Todos os componentes seguem padrões WCAG 2.1:
- Navegação por teclado
- ARIA attributes apropriados
- Focus management
- Screen reader support

### Exemplo: Dialog Acessível

```typescript
<Sheet>
  <SheetTrigger asChild>
    <Button>
      <span className="sr-only">Abrir menu</span>
      <Menu className="h-4 w-4" />
    </Button>
  </SheetTrigger>
  <SheetContent>
    <VisuallyHidden>
      <SheetTitle>Menu de Navegação</SheetTitle>
    </VisuallyHidden>
    {/* content */}
  </SheetContent>
</Sheet>
```

## Adicionando Novos Componentes

Para adicionar um novo componente ao core:

1. Crie o arquivo em `src/core/ui/nome-componente.tsx`
2. Use TypeScript com tipos apropriados
3. Exporte o componente e suas variantes
4. Use `cn()` para merge de classes
5. Adicione exemplo na página de demonstração
6. Documente neste arquivo

### Template de Componente

```typescript
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/core/utils"

const componentVariants = cva(
  "base-classes",
  {
    variants: {
      variant: {
        default: "default-classes",
        secondary: "secondary-classes",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ComponentProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof componentVariants> {}

const Component = React.forwardRef<HTMLDivElement, ComponentProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(componentVariants({ variant, size }), className)}
        {...props}
      />
    )
  }
)
Component.displayName = "Component"

export { Component, componentVariants }
```

## Temas e Customização

Os componentes usam variáveis CSS do Tailwind para temas:

```css
/* Em globals.css */
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  /* ... */
}
```

Para customizar, edite:
- `src/app/globals.css` - Variáveis de tema
- `tailwind.config.ts` - Configuração do Tailwind

**Documentação**: Ver `use-para-atualizar-tema-e-componentes-ui.md`

## Lista Completa de Componentes (27)

### Botões e Ações (2)
1. **Button** - Botão com variantes e tamanhos
2. **Dropdown Menu** - Menu dropdown com itens

### Formulários e Inputs (8)
3. **Input** - Campo de texto
4. **Textarea** - Campo multilinha
5. **Select** - Seletor dropdown
6. **Combobox** - Select com busca
7. **Switch** - Toggle on/off
8. **Checkbox** - Caixa de seleção
9. **Radio Group** - Seleção única
10. **Label** - Rótulo de campo

### Feedback e Mensagens (5)
11. **Toast** - Notificações flutuantes (Sonner)
12. **Alert** - Mensagens de alerta (5 variantes)
13. **Progress** - Barra de progresso
14. **Skeleton** - Loading placeholder

### Dados e Display (3)
15. **Badge** - Indicadores (7 variantes)
16. **Avatar** - Imagens de perfil
17. **Card** - Container de conteúdo

### Layout e Organização (6)
18. **Tabs** - Navegação em abas
19. **Separator** - Divisores
20. **Sheet** - Side panel/drawer
21. **Accordion** - Conteúdo expansível
22. **VisuallyHidden** - Acessibilidade

### Overlays e Modais (3)
23. **Dialog** - Modal/dialog
24. **Popover** - Menu flutuante
25. **Tooltip** - Dica de contexto

### Tabelas (2)
26. **DataTable** - Tabela com filtro/sort/paginação
27. **Form** - Wrapper de formulário

## Componentes para Sistemas Empresariais

Componentes essenciais adicionados para desenvolvimento de sistemas empresariais:

### Notificações e Feedback
- **Toast** - Notificações não-invasivas para ações do usuário
- **Alert** - Mensagens importantes com variantes de contexto
- **Progress** - Indicadores visuais de progresso de operações
- **Skeleton** - Estados de carregamento profissionais

### Organização de Dados
- **Badge** - Status, prioridades, categorias, contadores
- **DataTable** - Tabelas interativas com filtros e ordenação
- **Accordion** - Organização de conteúdo expansível (FAQs, categorias)
- **Tabs** - Navegação em abas para conteúdo complexo

### Formulários Avançados
- **Combobox** - Select com busca para listas grandes
- **Radio Group** - Escolhas mutuamente exclusivas
- **Switch** - Ativação/desativação de recursos
- **Dialog** - Modais para formulários e confirmações

### Interação e UX
- **Tooltip** - Ajuda contextual
- **Popover** - Menus e controles adicionais
- **Separator** - Organização visual e hierarquia

## Referências

- [Radix UI Documentation](https://www.radix-ui.com/)
- [Tailwind CSS Documentation](https://tailwindcss.com/)
- [Lucide Icons](https://lucide.dev/)
- [Class Variance Authority](https://cva.style/)
- [Sonner Toast](https://sonner.emilkowal.ski/)
