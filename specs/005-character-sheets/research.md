# Research: Minhas Fichas — Fichas de Personagem D&D 2024

**Branch**: `005-character-sheets` | **Date**: 2026-03-12  
**Phase**: 0 — Resolving technical unknowns before Phase 1 design

---

## 1. Scroll Infinito para Lista de Fichas

**Decision**: Usar `useInfiniteQuery` do TanStack Query com paginação por cursor (offset/page)

**Rationale**: O padrão `useInfiniteQuery` já está implementado em `src/features/spells/api/spells-queries.ts` com a mesma estrutura (`initialPageParam: 1`, `getNextPageParam`, `pageParam`). Reusar o mesmo padrão garante consistência arquitetural. Para fichas (volume esperado <100 por usuário), paginação simples de 12 items/página com scroll trigger é suficiente.

**Pattern adotado**:
```ts
useInfiniteQuery({
  queryKey: sheetsKeys.infinite({ search }),
  queryFn: async ({ pageParam = 1 }) => fetchSheets({ page: pageParam, limit: 12, search }),
  initialPageParam: 1,
  getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.page + 1 : undefined,
})
```

**Intersection Observer** via hook `useIntersectionObserver` para trigger automático com o último card.

**Alternatives considered**:
- Paginação clássica com "Página 1/2/3" — descartada pela UX inferior em lista de fichas pessoais
- Virtualização com `@tanstack/virtual` — overhead desnecessário para <100 fichas

---

## 2. Busca nas Fichas com Fuse.js

**Decision**: Busca **server-side** — o servidor busca todas as fichas do usuário no MongoDB e executa Fuse.js no servidor, retornando apenas os resultados filtrados ao cliente

**Rationale**: O servidor já tem acesso a todas as fichas do usuário; executar Fuse.js no servidor é trivial (mesma lib já usada em `src/core/utils/search-engine.ts`). A busca server-side garante que o cliente nunca receba fichas irrelevantes, reduz payload e centraliza a lógica de busca. O `SearchInput` continua sendo usado no cliente para o debounce de 500ms — ao disparar, envia o termo ao endpoint e exibe os resultados retornados.

**Fuse.js config no servidor** (mesmo padrão de `search-engine.ts`):
```ts
new Fuse(allUserSheets, {
  keys: [
    { name: 'name', weight: 10 },     // nome do personagem
    { name: 'class', weight: 5 },     // classe
    { name: 'race', weight: 5 },      // raça
    { name: 'subclass', weight: 3 },  // subclasse
  ],
  threshold: 0.35,
  includeScore: true,
  minMatchCharLength: 2,
})
```

**Fluxo**: `SearchInput` debounce 500ms → query param `?search=X` no endpoint `GET /api/character-sheets` → servidor busca todas as fichas do `userId` no MongoDB → executa Fuse.js → retorna resultado filtrado e paginado.

**Alternatives considered**:
- Busca client-side (Fuse.js no browser) — rejeitado: desnecessário expor todas as fichas ao cliente antes de filtrar; server-side é mais correto
- Busca sem fuzzy usando operador `$regex` do MongoDB — rejeita SC-008 de tolerância a erros de digitação

---

## 3. Componente SheetInput

**Decision**: Novo componente `sheet-input.tsx` em `src/features/character-sheets/components/` que encapsula `SearchInput` para debounce e loading, com prop opcional `catalogProvider?: EntityProvider` que exibe um botão ícone abrindo `GlassEntityChooser`

**Rationale**: 
- `SearchInput` já lida com debounce, `isLoading` state e feedback visual (ver `src/components/ui/search-input.tsx`). Reutilizar evita duplicar essa lógica.
- O botão do catálogo é genérico ("ícone de livro/catálogo") — apenas o `provider` muda por uso.
- Separa claramente: SheetInput = input da ficha com auto-save; o catálogo é um addon opcional.

**Interface proposta**:
```ts
interface SheetInputProps {
  value: string | number
  onChange: (value: string | number) => void
  onCatalogSelect?: (entity: EntityOption) => void
  catalogProvider?: EntityProvider
  isSaving?: boolean
  saveError?: boolean
  label?: string
  type?: 'text' | 'number'
  placeholder?: string
  className?: string
}
```

**Alternatives considered**:
- Implementar debounce direto no input da ficha — duplica a lógica do SearchInput
- Componente separado para inputs com catálogo e sem catálogo — overhead de manutenção desnecessário

---

## 4. Animações com Framer Motion

**Decision**: Seguir os padrões existentes em `src/lib/config/motion-configs.ts` com `AnimatePresence` para entrada/saída de cards, stagger para a grid, e transições suaves nos cálculos automáticos

**Patterns adotados**:
- `staggerChildren` no grid de cards (mesmo padrão do dashboard)
- `AnimatePresence` para adição/remoção de cards, itens, magias, habilidades
- Transição de valor numérico com `AnimatedNumber` (já existe na plataforma)
- Troca de seções na ficha: fade simples

**Alternatives considered**:
- CSS transitions puras — inconsistente com padrão Framer Motion da plataforma

---

## 5. Auto-Save por Campo (500ms Debounce)

**Decision**: Hook `useSheetAutoSave` que usa `useDebounce` do `src/core/hooks` e envia PATCH para `/api/character-sheets/[id]` com apenas `{ fieldName: value }`

**Rationale**: 
- `useDebounce` já está no core hooks.
- PATCH parcial mantém o payload mínimo e seguro (não sobrescreve campos concorrentes).
- Cada SheetInput gerencia seu próprio estado de saving/error localmente via `useState`.
- A lógica de cancelamento trata campos editados antes do debounce disparar.

**Pattern**:
```ts
const useSheetAutoSave = (sheetId: string) => {
  const [savingFields, setSavingFields] = useState<Set<string>>(new Set())
  const [errorFields, setErrorFields] = useState<Set<string>>(new Set())
  
  const save = useCallback(async (field: string, value: unknown) => {
    setSavingFields(prev => new Set(prev).add(field))
    try {
      await patchSheet(sheetId, { [field]: value })
      setErrorFields(prev => { const s = new Set(prev); s.delete(field); return s })
    } catch {
      setErrorFields(prev => new Set(prev).add(field))
    } finally {
      setSavingFields(prev => { const s = new Set(prev); s.delete(field); return s })
    }
  }, [sheetId])
  
  return { save, savingFields, errorFields }
}
```

---

## 6. Cálculos Automáticos D&D 2024

**Decision**: Hook `useCharacterCalculations` que recebe atributos + nível e retorna TODOS os valores derivados; utility puras em `dnd-calculations.ts`

**Fórmulas confirmadas** (via clarificações do spec):

| Campo | Fórmula |
|---|---|
| Modificador de atributo | `Math.floor((valor - 10) / 2)` |
| Bônus de proficiência | nível 1-4: +2, 5-8: +3, 9-12: +4, 13-16: +5, 17-20: +6 |
| Perícia | `modAtributo + (proficiente ? profBonus : 0) + (expertise ? profBonus : 0)` |
| Salvaguarda | `modAtributo + (proficiente ? profBonus : 0)` |
| Classe de Armadura (base) | `10 + modDestreza` |
| Iniciativa | `modDestreza` |
| Percepção Passiva | `10 + bonusPercepção` |
| CD de Magia | `8 + profBonus + modAtributoConjuração` |
| Bônus de Ataque de Magia | `profBonus + modAtributoConjuração` |

**CalcTooltip component**: exibe formula on hover (ex: `"STR 16 → floor((16-10)/2) = +3"`)

---

## 7. Wizard de Subida de Nível

**Decision**: Componente multi-step modal `LevelUpWizard` com estado gerenciado por `useLevelUp` hook. Steps são gerados dinamicamente a partir da tabela de progressão da classe carregada do catálogo.

**Steps possíveis** (dependem da classe e nível):
1. HP roll / average choice (informativo — HP max é manual)
2. Spell slots upgrade (automático, exibido como resumo)
3. New class traits (automático, listagem)
4. Ability Score Improvement (escolha: +2/+1+1/talento)
5. Spell selection (se classe concede novas magias)
6. Summary e confirmação

**Alternatives considered**:
- Wizard inline na página (não modal) — UX mais fragmentada; modal mantém foco no fluxo

---

## 8. Modelo de Dados — CharacterSheet no MongoDB

**Decision**: Modelo Mongoose `CharacterSheet` como documento principal + 5 modelos separados para os **vínculos** da ficha (itens, magias, traits, feats, ataques)

**Rationale**: Sub-entidades separadas permitem CRUD independente sem re-enviar o documento inteiro. Cada sub-entidade tem `sheetId` como foreign key.

**IMPORTANTE — Catálogo é somente leitura**: As entidades `Item`, `Spell`, `Trait` e `Feat` já existem no catálogo da plataforma. A ficha **nunca cria, edita ou deleta** entidades do catálogo. Os modelos de vínculo (`CharacterItem`, `CharacterSpell`, `CharacterTrait`, `CharacterFeat`) apenas **referenciam** o catálogo via `catalogXxxId` (ref opcional). Dados de exibição (nome, imagem) são armazenados no vínculo para suportar itens manuais (sem ref ao catálogo) e exibição rápida sem populate. Se o item do catálogo for atualizado, o vínculo exibe o nome salvo — não há sincronização automática (comportamento aceitável conforme edge case documentado no spec).

**CharacterSheet** — campos principais:
- Identidade: `name`, `class`, `classRef?`, `subclass?`, `subclassRef?`, `level`, `race`, `raceRef?`, `origin`, `originRef?`, `inspiration`
- Visibilidade: `isPublic` (default false), `userId` (Clerk ID do dono)
- Aparência: `photo?`, `age?`, `height?`, `weight?`, `eyes?`, `skin?`, `hair?`, `appearance?`
- Atributos: `strength/dexterity/constitution/intelligence/wisdom/charisma` (todos default 10)
- Competências: `proficiencyBonusOverride?`, `savingThrows: Record<AttributeType, bool>`, `skills: Record<SkillName, {proficient, expertise, override?}>`
- Combate: `movementSpeed?`, `hpMax?`, `hpCurrent?`, `hpTemp?`, `hitDiceTotal?`, `hitDiceUsed?`, `deathSavesSuccess?`, `deathSavesFailure?`, `armorClassOverride?`, `initiativeOverride?`, `passivePerceptionOverride?`
- Conjuração: `spellcastingAttribute?`, `spellSaveDCOverride?`, `spellAttackBonusOverride?`, `spellSlots: Record<string, {total, used}>`
- Moedas: `coins: {cp, sp, ep, gp, pp}` (todos default 0)
- Personalidade: `personalityTraits?`, `ideals?`, `bonds?`, `flaws?`
- Notas: `notes?`, `multiclassNotes?`
- Slug: `slug` (único — `{id}-{name-slug}`)

---

## 9. Rota da Ficha e Slug

**Decision**: Slug gerado como `{mongoId}-{kebab-case-do-nome}` (ou apenas o ID se nome vazio). A busca por slug extrai o ID da primeira parte e faz lookup pelo `_id` do Mongoose.

**Rationale**: Garante unicidade via ID + legibilidade via nome. Slug é atualizado ao salvar o nome, mas o ID permanece fixo. Evita colisões.

---

## 10. Upload de Foto do Personagem

**Decision**: Reutilizar o endpoint `/api/upload` existente e o `src/core/storage/s3.ts` (AWS S3-compatible, suporta Minio). Retorna URL pública da imagem salva.

**Rationale**: Infraestrutura já existente e testada. Nenhuma dependência nova necessária.

**Alternatives considered**:
- Suporte a URL externa — explicitamente fora do escopo (clarificação Q6)

---

## 11. Cores da Ficha

**Decision**: Usar `attributeColors` do `src/lib/config/colors.ts` para cada atributo (Força=amber, Destreza=emerald, CON=red, INT=blue, SAB=slate, CAR=purple). Para a ficha como um todo, usar `entityColors['Personagem']` se existir ou criar um tema neutro glass.

**Rationale**: `attributeColors` já tem `.bg`, `.text`, `.border`, `.bgAlpha`, `.hex` para cada atributo. Os 6 modificadores de atributo no card e na ficha ficam color-coded.

---

## 12. Autenticação e Autorização

**Decision**: Clerk via `auth()` nas Server Routes. Todas as fichas são **públicas por padrão** — qualquer pessoa com o link pode acessar a página da ficha. A lista de fichas (`/my-sheets`) é restrita ao usuário autenticado.

**Authorization rules**:
- `GET /api/character-sheets/[id]`: acessível sem autenticação; retorna 404 apenas se a ficha não existir
- `POST /api/character-sheets`: requer autenticação (cria ficha para o usuário logado)
- `PATCH /api/character-sheets/[id]`: requer autenticação; retorna 403 se o usuário não é o dono da ficha
- `DELETE /api/character-sheets/[id]`: requer autenticação; retorna 403 se o usuário não é o dono
- `GET /my-sheets`: redireciona para login se não autenticado
- `GET /api/character-sheets`: requer autenticação; retorna apenas fichas do `userId` do usuário logado

**Campo `isPublic` removido do modelo**: não existe visibilidade privada. A lista de fichas é filtrada por `userId` no servidor — o usuário só vê as suas próprias fichas na lista, mas o link da ficha é sempre aberto para qualquer visitante.

---

## 13. React Hook Form na Ficha

**Decision**: Usar `useForm` do React Hook Form sem submit — cada campo usa `watch` + `useEffect` para detectar mudanças e disparar o auto-save via `useSheetAutoSave`.

**Rationale**: RHF é o padrão da plataforma (ver `item-form-modal.tsx`, `spell-form-modal.tsx`). Para a ficha, não há "submit" — cada campo salva independentemente. O `watch(fieldName)` + debounce é a abordagem mais simples.

**Alternatives considered**:
- Estado local `useState` por campo — não escala para ~50 campos
- `useForm` com submit — anti-pattern para auto-save por campo
