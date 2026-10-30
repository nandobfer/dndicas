# Dungeons & Dicas

Dungeons & Dicas é uma plataforma web para mestres e jogadores de Dungeons & Dragons 5e. O projeto reúne catálogo, fichas de personagem, NPCs, rolagem de dados, integração com Owlbear Rodeo e recursos de IA em uma experiência pensada para campanhas em português.

A ideia é simples: reduzir atrito na mesa. Consultar uma magia, entender uma regra, preparar um NPC, rolar dados, acompanhar iniciativa ou vincular uma ficha a um token no VTT não deveria quebrar o ritmo do jogo.

## Para Quem É

- Mestres que querem preparar e conduzir sessões com menos abas abertas.
- Jogadores que querem criar, evoluir e consultar fichas com mais fluidez.
- Grupos que jogam online e usam Owlbear Rodeo como mesa virtual.
- Pessoas que estão aprendendo D&D 5e e precisam de explicações mais acessíveis.
- Devs e entusiastas interessados em ferramentas digitais para RPG de mesa.

## O Que Você Pode Fazer

- Consultar catálogos de regras, magias, itens, raças, classes, subclasses, origens, talentos, habilidades e monstros.
- Criar fichas em branco ou com um assistente guiado para nome, raça, origem, classe e atributos.
- Evoluir personagens com apoio visual para ganho de nível, pontos de vida, subclasses e talentos.
- Criar NPCs próprios ou copiar monstros do catálogo para adaptar a sua campanha.
- Rolar dados com resultado oficial calculado no servidor e visualização 3D no navegador.
- Usar busca global, menções e previews ricos para navegar entre entidades relacionadas.
- Gerar artes com IA para personagens, monstros, itens, raças, classes, origens e magias.
- Conversar com IA para entender entidades do catálogo em linguagem natural.
- Integrar a experiência ao Owlbear Rodeo com painéis separados para compêndio, fichas, NPCs, iniciativa e dados.
- Enviar feedbacks, acompanhar discussões e participar da evolução do produto.

## Catálogo Vivo De D&D

O catálogo é o centro de consulta do Dungeons & Dicas. Entidades como magias, talentos, monstros e regras não aparecem isoladas: descrições podem mencionar outras entidades, abrir previews, navegar para páginas de detalhe e manter contexto durante a leitura.

A busca foi pensada para bases grandes. Ela combina filtros, ranking fuzzy, carregamento progressivo e caches para manter a interface responsiva mesmo quando o catálogo cresce.

## Fichas De Personagem

A área de fichas permite criar personagens rapidamente e depois refiná-los ao longo da campanha. O assistente de criação ajuda nas primeiras escolhas, enquanto a ficha completa guarda informações mecânicas e narrativas como aparência, história, notas, classe, raça, origem, magias, ataques, itens e recursos.

O fluxo de subir de nível mostra o impacto antes de confirmar: novo nível, pontos de vida, habilidades desbloqueadas, escolhas obrigatórias e alterações de recursos. A ficha também usa menções e preenchimentos contextuais para reduzir digitação repetitiva.

## NPCs, Monstros E Iniciativa

Mestres podem consultar monstros do catálogo, criar NPCs próprios e copiar criaturas existentes para adaptar nomes, imagens, ações, PV, CA e descrições. Os NPCs pessoais ficam vinculados ao usuário e podem ser usados em preparação de campanha ou dentro do Owlbear Rodeo.

Na integração com Owlbear, NPCs podem ser vinculados a uma sala, receber pontos de vida iniciais, entrar na iniciativa e ter seus PVs ajustados durante o combate. A iniciativa combina NPCs e personagens vinculados, preservando uma visão única da cena.

## Dados 3D

O rolador de dados calcula o resultado oficial no backend e usa a visualização 3D como representação visual desse resultado. Isso permite suportar vantagem, desvantagem, modificadores, d100, críticos e falhas sem depender da física visual como fonte da verdade.

No Owlbear Rodeo, a action de dados compartilha rolagens com a sala. Outros jogadores veem a animação e o histórico compacto da mesa, mantendo o jogo sincronizado sem transformar o dado em uma janela isolada.

## Integração Com Owlbear Rodeo

Dungeons & Dicas oferece actions independentes para o Owlbear Rodeo:

- `Dndicas: Compendium`: catálogo embutido para consulta rápida.
- `Dndicas: Ficha`: fichas de jogadores e gerenciamento de fichas pelo mestre.
- `Dndicas: NPC & Iniciativa`: NPCs da sala, controle de PV e ordem de iniciativa.
- `Dndicas: Dados`: rolador compartilhado com histórico da sala.

A integração também permite vincular tokens a personagens ou NPCs, exibir barras de vida sobre tokens e manter painéis diferentes abertos ao mesmo tempo. O fluxo de login foi desenhado para funcionar mesmo dentro de iframes, onde cookies podem ser bloqueados pelo navegador.

## IA No Projeto

A IA aparece como apoio, não como substituta da mesa.

- `Entender com IA` abre um chat contextual para explicar regras, magias, monstros, itens e outras entidades em pt-BR.
- Geração de arte cria imagens no estilo de fantasia para fichas e catálogos, salvando o resultado no storage do projeto.
- Fluxos administrativos podem usar IA para revisar, traduzir ou gerar candidatos de entidades a partir de fontes estruturadas.
- A central de feedback no Opex acompanha sugestões e tarefas; o Agente Opex do DnDicas continua independente dessa integração.

Todo conteúdo HTML vindo de IA passa por sanitização antes de ser renderizado na interface.

## Feedback E Evolução

Em `/feedback`, usuários autenticados recebem automaticamente um acesso individual ao cliente configurado na integração Tarefas Opex. A página mostra os gráficos do portal do cliente e o link para abrir a central externa. Visitantes são convidados a entrar.

A antiga central interna e suas APIs/ferramentas MCP foram removidas. Os dados históricos permanecem no MongoDB; `pnpm export:feedbacks --out backups/feedback-pendentes.json` exporta os pendentes para importação posterior no Opex.

## Seção Técnica

O Dungeons & Dicas é uma aplicação full-stack em TypeScript, construída com:

- Next.js 16, React 19 e App Router.
- TypeScript em modo strict.
- MongoDB com Mongoose para persistência.
- Auth.js para autenticação e sessões.
- Tailwind CSS 4, Radix UI, Shadcn/ui e componentes Glass customizados.
- TanStack Query para estado assíncrono no cliente.
- Vercel AI SDK com provedores configuráveis (OpenCode, Gemini, Anthropic, OpenAI, DeepSeek, JEV) para os agentes de texto, ferramentas e imagens, incluindo o Agente Opex.
- S3/MinIO para uploads, imagens e arquivos gerados.
- Pusher/Soketi para realtime no Agente Opex, geração de entidades e Owlbear.
- Owlbear Rodeo SDK para actions, metadata de sala, tokens e menus de contexto.
- Tiptap para rich text, tabelas, imagens e menções.
- Fuse.js, Web Workers e busca server-side para catálogos e menções.
- `@3d-dice/dice-box-threejs` para visualização 3D dos dados.
- Vitest e Testing Library para testes automatizados.
- Docker e PM2 (uma instância) para produção, com agendador interno de rotinas.

A estrutura do código separa base compartilhada, features de produto e rotas da aplicação:

```text
src/
├── core/      # serviços, componentes e utilitários compartilhados
├── features/  # módulos de negócio do Dungeons & Dicas
└── app/       # rotas, páginas e handlers do Next.js
```

## Rodando Localmente

Este projeto usa exclusivamente `pnpm`.

```bash
pnpm install
pnpm dev
```

O servidor local fica disponível em `http://localhost:3000`.

O `.env` guarda só as variáveis de bootstrap (veja `.env.example`):

```env
MONGODB_URI=
AUTH_SECRET=
AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
INTEGRATIONS_ENCRYPTION_KEY=   # openssl rand -base64 32
```

Google, Pusher/Soketi, Storage S3, SMTP, Crons, Provedores de IA, Analytics e Tradução são
configurados por administradores em `/integracoes` e gravados no MongoDB. Na primeira subida, os
valores antigos ainda presentes no `.env` são copiados uma única vez para o banco.

Scripts principais:

```bash
pnpm dev          # inicia o ambiente de desenvolvimento
pnpm test         # executa a suíte de testes
pnpm lint         # executa o lint
pnpm seed         # importa dados de catálogo
pnpm search       # abre a CLI de busca local (TUI interativa)
pnpm query-db     # consulta o banco via CLI não-interativa (útil para scripts e agentes de IA)
```

### query-db

CLI não-interativa para consultar entidades do banco diretamente. Ideal para automação, agentes de IA e scripts. Saída em JSON puro no stdout.

```bash
# Listar todas as classes
pnpm query-db -- --type Classe --list

# Buscar por nome (case-insensitive, parcial)
pnpm query-db -- --type Classe --search "Lâmina"

# Buscar por ID com campos específicos
pnpm query-db -- --type Classe --id <objectId> --fields name,traits,subclasses

# Tipos disponíveis: Regra, Habilidade, Talento, Magia, Classe, Origem, Raça, Item
# Flags: --type --search --id --list --fields --limit --status --help
```

## Documentação Do Projeto

A documentação de desenvolvimento fica em `aicontext/`. Ela descreve padrões de API, UI, autenticação, arquitetura, módulos de negócio e decisões técnicas usadas por humanos e agentes de IA ao evoluir o projeto.

Para entender os módulos principais, veja especialmente:

- `aicontext/modules/character-sheets.md`
- `aicontext/modules/owlbear.md`
- `aicontext/modules/dice-roller.md`
- `aicontext/modules/monsters.md`
- `aicontext/modules/entity-understanding.md`
- `aicontext/modules/opex-feedback.md`

## Status

Dungeons & Dicas está em desenvolvimento ativo. Algumas áreas já estão maduras para uso diário, enquanto outras seguem recebendo melhorias de UX, performance, conteúdo e automação.

## Licença

Licença ainda não definida.
