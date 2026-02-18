"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Card } from "@/core/ui/card"
import { Button } from "@/core/ui/button"
import { Input } from "@/core/ui/input"
import { Label } from "@/core/ui/label"
import { Textarea } from "@/core/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/core/ui/select"
import { Badge } from "@/core/ui/badge"
import { Separator } from "@/core/ui/separator"
import { Alert, AlertTitle, AlertDescription } from "@/core/ui/alert"
import { Switch } from "@/core/ui/switch"
import { Checkbox } from "@/core/ui/checkbox"
import { Progress } from "@/core/ui/progress"
import { Skeleton } from "@/core/ui/skeleton"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/core/ui/tabs"
import { Avatar } from "@/core/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from "@/core/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/core/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/core/ui/popover"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/core/ui/accordion"
import { RadioGroup, RadioGroupItem } from "@/core/ui/radio-group"
import { Combobox, ComboboxOption } from "@/core/ui/combobox"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/core/ui/tooltip"
import { DataTable, Column } from "@/core/ui/data-table"
import {
  ArrowRight,
  Download,
  Mail,
  Settings,
  User,
  LogOut,
  ChevronDown,
  Copy,
  Check,
  Info,
  HelpCircle,
  Trash2
} from "lucide-react"

interface DemoData {
  id: string
  name: string
  status: string
  priority: string
  date: string
}

export default function UIComponentsPage() {
  const [switchChecked, setSwitchChecked] = useState(false)
  const [checkboxChecked, setCheckboxChecked] = useState(false)
  const [progress, setProgress] = useState(33)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [radioValue, setRadioValue] = useState("option1")
  const [comboValue, setComboValue] = useState("")

  const handleCopy = () => {
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleLoadingDemo = () => {
    setLoading(true)
    setTimeout(() => setLoading(false), 3000)
  }

  const comboboxOptions: ComboboxOption[] = [
    { value: "react", label: "React" },
    { value: "vue", label: "Vue" },
    { value: "angular", label: "Angular" },
    { value: "svelte", label: "Svelte" },
    { value: "nextjs", label: "Next.js" },
  ]

  const tableData: DemoData[] = [
    { id: "1", name: "Projeto Alpha", status: "Em andamento", priority: "Alta", date: "2024-01-15" },
    { id: "2", name: "Projeto Beta", status: "Concluído", priority: "Média", date: "2024-01-10" },
    { id: "3", name: "Projeto Gamma", status: "Pendente", priority: "Baixa", date: "2024-01-20" },
    { id: "4", name: "Projeto Delta", status: "Em andamento", priority: "Alta", date: "2024-01-18" },
    { id: "5", name: "Projeto Epsilon", status: "Cancelado", priority: "Média", date: "2024-01-05" },
  ]

  const tableColumns: Column<DemoData>[] = [
    { key: "id", header: "ID", sortable: true },
    { key: "name", header: "Nome", sortable: true },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (item) => {
        const variants: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
          "Concluído": "success",
          "Em andamento": "warning",
          "Pendente": "secondary",
          "Cancelado": "destructive",
        }
        return <Badge variant={variants[item.status]}>{item.status}</Badge>
      }
    },
    {
      key: "priority",
      header: "Prioridade",
      sortable: true,
      render: (item) => {
        const variants: Record<string, "destructive" | "warning" | "secondary"> = {
          "Alta": "destructive",
          "Média": "warning",
          "Baixa": "secondary",
        }
        return <Badge variant={variants[item.priority]}>{item.priority}</Badge>
      }
    },
    { key: "date", header: "Data", sortable: true },
  ]

  return (
    <div className="flex-1 space-y-8 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Componentes de Interface</h2>
          <p className="text-muted-foreground">
            Biblioteca completa de componentes do core para construção de interfaces
          </p>
        </div>
      </div>

      <Tabs defaultValue="buttons" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8">
          <TabsTrigger value="buttons">Botões</TabsTrigger>
          <TabsTrigger value="inputs">Inputs</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
          <TabsTrigger value="data">Dados</TabsTrigger>
          <TabsTrigger value="layout">Layout</TabsTrigger>
          <TabsTrigger value="overlays">Overlays</TabsTrigger>
          <TabsTrigger value="advanced">Avançados</TabsTrigger>
          <TabsTrigger value="tables">Tabelas</TabsTrigger>
        </TabsList>

        {/* Buttons Tab */}
        <TabsContent value="buttons" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Botões</h3>
            <div className="space-y-4">
              <div>
                <Label className="mb-2 block">Variantes</Label>
                <div className="flex flex-wrap gap-2">
                  <Button variant="default">Default</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="destructive">Destructive</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="link">Link</Button>
                </div>
              </div>

              <Separator />

              <div>
                <Label className="mb-2 block">Tamanhos</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm">Small</Button>
                  <Button size="default">Default</Button>
                  <Button size="lg">Large</Button>
                  <Button size="icon"><Mail className="h-4 w-4" /></Button>
                </div>
              </div>

              <Separator />

              <div>
                <Label className="mb-2 block">Com Ícones</Label>
                <div className="flex flex-wrap gap-2">
                  <Button>
                    <Mail className="mr-2 h-4 w-4" />
                    Enviar Email
                  </Button>
                  <Button variant="outline">
                    Download
                    <Download className="ml-2 h-4 w-4" />
                  </Button>
                  <Button variant="secondary">
                    Continuar
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>

              <Separator />

              <div>
                <Label className="mb-2 block">Estados</Label>
                <div className="flex flex-wrap gap-2">
                  <Button disabled>Desabilitado</Button>
                  <Button>
                    <span className="mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                    Carregando
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Dropdown Menu</h3>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  Menu <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  Perfil
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  Configurações
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Card>
        </TabsContent>

        {/* Inputs Tab */}
        <TabsContent value="inputs" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Campos de Texto</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="text-input">Input Padrão</Label>
                <Input id="text-input" placeholder="Digite algo..." />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email-input">Email</Label>
                <Input id="email-input" type="email" placeholder="email@exemplo.com" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password-input">Password</Label>
                <Input id="password-input" type="password" placeholder="••••••••" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="disabled-input">Desabilitado</Label>
                <Input id="disabled-input" disabled placeholder="Campo desabilitado" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="textarea">Textarea</Label>
                <Textarea id="textarea" placeholder="Digite um texto longo..." rows={4} />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Select e Combobox</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Select Padrão</Label>
                <Select>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Opção 1</SelectItem>
                    <SelectItem value="2">Opção 2</SelectItem>
                    <SelectItem value="3">Opção 3</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Combobox (com busca)</Label>
                <Combobox
                  options={comboboxOptions}
                  value={comboValue}
                  onValueChange={setComboValue}
                  placeholder="Selecione um framework..."
                  searchPlaceholder="Buscar framework..."
                />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Controles</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Switch</Label>
                  <p className="text-sm text-muted-foreground">
                    Ativar ou desativar funcionalidade
                  </p>
                </div>
                <Switch
                  checked={switchChecked}
                  onCheckedChange={setSwitchChecked}
                />
              </div>

              <Separator />

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="checkbox"
                  checked={checkboxChecked}
                  onCheckedChange={setCheckboxChecked}
                />
                <Label
                  htmlFor="checkbox"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Aceito os termos e condições
                </Label>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Radio Group</Label>
                <RadioGroup value={radioValue} onValueChange={setRadioValue}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="option1" id="option1" />
                    <Label htmlFor="option1">Opção 1</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="option2" id="option2" />
                    <Label htmlFor="option2">Opção 2</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="option3" id="option3" />
                    <Label htmlFor="option3">Opção 3</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Feedback Tab */}
        <TabsContent value="feedback" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Toast Notifications</h3>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => toast.success("Operação realizada com sucesso!")}>
                Success Toast
              </Button>
              <Button variant="destructive" onClick={() => toast.error("Ocorreu um erro!")}>
                Error Toast
              </Button>
              <Button variant="outline" onClick={() => toast.info("Informação importante")}>
                Info Toast
              </Button>
              <Button variant="secondary" onClick={() => toast.warning("Atenção necessária")}>
                Warning Toast
              </Button>
              <Button
                variant="outline"
                onClick={() => toast("Mensagem simples", {
                  action: {
                    label: "Desfazer",
                    onClick: () => toast.success("Ação desfeita!"),
                  },
                })}
              >
                Toast com Ação
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Alertas</h3>
            <div className="space-y-4">
              <Alert variant="default">
                <AlertTitle>Informação</AlertTitle>
                <AlertDescription>
                  Este é um alerta informativo padrão.
                </AlertDescription>
              </Alert>

              <Alert variant="info">
                <AlertTitle>Dica</AlertTitle>
                <AlertDescription>
                  Você pode usar atalhos de teclado para navegar mais rápido.
                </AlertDescription>
              </Alert>

              <Alert variant="success">
                <AlertTitle>Sucesso!</AlertTitle>
                <AlertDescription>
                  Sua operação foi concluída com sucesso.
                </AlertDescription>
              </Alert>

              <Alert variant="warning">
                <AlertTitle>Atenção</AlertTitle>
                <AlertDescription>
                  Esta ação requer confirmação antes de prosseguir.
                </AlertDescription>
              </Alert>

              <Alert variant="destructive">
                <AlertTitle>Erro</AlertTitle>
                <AlertDescription>
                  Ocorreu um erro ao processar sua solicitação.
                </AlertDescription>
              </Alert>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Progress</h3>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Progresso: {progress}%</Label>
                  <div className="space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setProgress(Math.max(0, progress - 10))}
                    >
                      -10%
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setProgress(Math.min(100, progress + 10))}
                    >
                      +10%
                    </Button>
                  </div>
                </div>
                <Progress value={progress} showLabel />
              </div>

              <Separator />

              <div className="space-y-2">
                <Progress value={25} />
                <Progress value={50} />
                <Progress value={75} />
                <Progress value={100} />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Loading States</h3>
            <div className="space-y-4">
              <Button onClick={handleLoadingDemo} disabled={loading}>
                {loading ? "Carregando..." : "Iniciar Loading"}
              </Button>

              {loading && (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-3/4" />

                  <div className="flex items-center space-x-4 mt-4">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-4/5" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* Data Tab */}
        <TabsContent value="data" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Badges</h3>
            <div className="space-y-4">
              <div>
                <Label className="mb-2 block">Variantes</Label>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="default">Default</Badge>
                  <Badge variant="secondary">Secondary</Badge>
                  <Badge variant="destructive">Destructive</Badge>
                  <Badge variant="outline">Outline</Badge>
                  <Badge variant="success">Success</Badge>
                  <Badge variant="warning">Warning</Badge>
                  <Badge variant="info">Info</Badge>
                </div>
              </div>

              <Separator />

              <div>
                <Label className="mb-2 block">Exemplos de Uso</Label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">Status:</span>
                    <Badge variant="success">Ativo</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">Prioridade:</span>
                    <Badge variant="destructive">Alta</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">Categoria:</span>
                    <Badge variant="info">Desenvolvimento</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">Notificações:</span>
                    <Badge variant="outline">12</Badge>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Avatar</h3>
            <div className="flex flex-wrap gap-4">
              <Avatar>
                <img src="https://github.com/shadcn.png" alt="Avatar" />
              </Avatar>
              <Avatar>
                <div className="flex h-full w-full items-center justify-center bg-primary text-primary-foreground">
                  JD
                </div>
              </Avatar>
              <Avatar>
                <div className="flex h-full w-full items-center justify-center bg-secondary text-secondary-foreground">
                  AB
                </div>
              </Avatar>
            </div>
          </Card>
        </TabsContent>

        {/* Layout Tab */}
        <TabsContent value="layout" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Cards</h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card className="p-4">
                <h4 className="font-semibold">Card Simples</h4>
                <p className="text-sm text-muted-foreground mt-2">
                  Este é um card básico com conteúdo.
                </p>
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-4">
                  <Avatar>
                    <div className="flex h-full w-full items-center justify-center bg-primary text-primary-foreground">
                      US
                    </div>
                  </Avatar>
                  <div>
                    <h4 className="font-semibold">Card com Avatar</h4>
                    <p className="text-sm text-muted-foreground">Usuário Sistema</p>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold">Card com Badge</h4>
                  <Badge variant="success">Novo</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Combinação de elementos.
                </p>
              </Card>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Separadores</h3>
            <div className="space-y-4">
              <div>
                <p className="text-sm">Conteúdo acima</p>
                <Separator className="my-4" />
                <p className="text-sm">Conteúdo abaixo</p>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-sm">Item 1</span>
                <Separator orientation="vertical" className="h-4" />
                <span className="text-sm">Item 2</span>
                <Separator orientation="vertical" className="h-4" />
                <span className="text-sm">Item 3</span>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Accordion</h3>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger>Accordion Item 1</AccordionTrigger>
                <AccordionContent>
                  Conteúdo do primeiro item. Pode incluir qualquer elemento HTML ou React.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2">
                <AccordionTrigger>Accordion Item 2</AccordionTrigger>
                <AccordionContent>
                  Conteúdo do segundo item com mais informações.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3">
                <AccordionTrigger>Accordion Item 3</AccordionTrigger>
                <AccordionContent>
                  Conteúdo do terceiro item.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Card>
        </TabsContent>

        {/* Overlays Tab */}
        <TabsContent value="overlays" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Dialog / Modal</h3>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>Abrir Dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Título do Dialog</DialogTitle>
                  <DialogDescription>
                    Descrição do modal. Adicione qualquer conteúdo aqui.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome</Label>
                    <Input id="name" placeholder="Digite seu nome" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" placeholder="seu@email.com" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={() => {
                    toast.success("Dados salvos!")
                    setDialogOpen(false)
                  }}>
                    Salvar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Popover</h3>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">Abrir Popover</Button>
              </PopoverTrigger>
              <PopoverContent>
                <div className="space-y-2">
                  <h4 className="font-medium leading-none">Dimensões</h4>
                  <p className="text-sm text-muted-foreground">
                    Defina as dimensões do elemento.
                  </p>
                  <div className="grid gap-2">
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="width">Largura</Label>
                      <Input
                        id="width"
                        defaultValue="100%"
                        className="col-span-2 h-8"
                      />
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="height">Altura</Label>
                      <Input
                        id="height"
                        defaultValue="25px"
                        className="col-span-2 h-8"
                      />
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Tooltip</h3>
            <TooltipProvider>
              <div className="flex gap-4">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline">
                      <Info className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Informação adicional</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline">
                      <HelpCircle className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Clique para obter ajuda</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Excluir permanentemente</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </Card>
        </TabsContent>

        {/* Advanced Tab */}
        <TabsContent value="advanced" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Tabs Aninhadas</h3>
            <Tabs defaultValue="sub1" className="w-full">
              <TabsList>
                <TabsTrigger value="sub1">Sub Tab 1</TabsTrigger>
                <TabsTrigger value="sub2">Sub Tab 2</TabsTrigger>
                <TabsTrigger value="sub3">Sub Tab 3</TabsTrigger>
              </TabsList>
              <TabsContent value="sub1" className="mt-4">
                <p className="text-sm">Conteúdo da primeira sub-aba.</p>
              </TabsContent>
              <TabsContent value="sub2" className="mt-4">
                <p className="text-sm">Conteúdo da segunda sub-aba.</p>
              </TabsContent>
              <TabsContent value="sub3" className="mt-4">
                <p className="text-sm">Conteúdo da terceira sub-aba.</p>
              </TabsContent>
            </Tabs>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Componentes Combinados</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <div className="flex h-full w-full items-center justify-center bg-blue-500 text-white">
                      PR
                    </div>
                  </Avatar>
                  <div>
                    <h4 className="font-semibold">Projeto React</h4>
                    <p className="text-sm text-muted-foreground">Atualizado há 2 horas</p>
                  </div>
                </div>
                <Badge variant="success">Em andamento</Badge>
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Progresso do projeto</span>
                  <span className="font-medium">68%</span>
                </div>
                <Progress value={68} />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="outline" onClick={handleCopy}>
                          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Copiar link</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button size="sm" variant="outline">
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
                <Button size="sm">Ver Detalhes</Button>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Tables Tab */}
        <TabsContent value="tables" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">DataTable Completa</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Tabela com filtro, ordenação e paginação integrados.
            </p>
            <DataTable
              data={tableData}
              columns={tableColumns}
              pageSize={3}
            />
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Tabela Simples</h3>
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="h-12 px-4 text-left font-medium">ID</th>
                    <th className="h-12 px-4 text-left font-medium">Nome</th>
                    <th className="h-12 px-4 text-left font-medium">Status</th>
                    <th className="h-12 px-4 text-left font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-4">#001</td>
                    <td className="p-4">Produto A</td>
                    <td className="p-4">
                      <Badge variant="success">Ativo</Badge>
                    </td>
                    <td className="p-4">
                      <Button size="sm" variant="ghost">Editar</Button>
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4">#002</td>
                    <td className="p-4">Produto B</td>
                    <td className="p-4">
                      <Badge variant="warning">Pendente</Badge>
                    </td>
                    <td className="p-4">
                      <Button size="sm" variant="ghost">Editar</Button>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-4">#003</td>
                    <td className="p-4">Produto C</td>
                    <td className="p-4">
                      <Badge variant="destructive">Inativo</Badge>
                    </td>
                    <td className="p-4">
                      <Button size="sm" variant="ghost">Editar</Button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
