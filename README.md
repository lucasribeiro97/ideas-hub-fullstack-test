# Ideas Hub — Teste Prático Fullstack

Aplicação fullstack para consulta e gerenciamento de usuários, com integração a um
serviço externo de informações climáticas.

**Node.js 22 + TypeScript + Fastify + PostgreSQL 16** no backend,
**React 19 + TypeScript + Vite** no frontend.

- 361 testes na API, 245 no frontend
- 220.875 usuários importados do CSV de origem, a partir de 500 mil linhas
- Contrato documentado em OpenAPI, servido pelo Swagger UI

## Demonstração no ar

| | |
|---|---|
| **Aplicação** | https://ideas-hub-web.onrender.com |
| **Contrato da API (Swagger UI)** | https://ideas-hub-api.onrender.com/docs |
| **Saúde da API** | https://ideas-hub-api.onrender.com/health |

A base da API é `https://ideas-hub-api.onrender.com`, e ela **não tem rota em `/`** —
abrir o endereço puro no navegador devolve `404 ROUTE_NOT_FOUND`, que é o envelope de
erro previsto na SPEC §6, e não um defeito. Os endpoints estão em `/users`, `/users/:id`
e `/weather/:city`; o Swagger UI acima permite executá-los pelo navegador.

> **O primeiro acesso demora.** O plano gratuito do Render hiberna o serviço após
> inatividade, e a instância leva cerca de 50 segundos para responder de novo. Não é
> lentidão da aplicação.
>
> **O banco expira em 22 de outubro de 2026**, por ser gratuito. O repositório não —
> a avaliação não depende do link estar no ar.
>
> A demonstração tem **41.259 usuários**, importados das primeiras 50 mil linhas do
> CSV. O volume completo não cabe no plano gratuito: os 220.875 registros locais ocupam
> 179 MB, dos quais 120 MB são os índices GIN de trigrama, contra um limite de 0,5 GB.

O procedimento de publicação, as restrições da plataforma e o que foi verificado estão
em [Deploy de demonstração](#deploy-de-demonstração).

## Índice

- [Demonstração no ar](#demonstração-no-ar)
- [Pré-requisitos](#pré-requisitos)
- [Executando pela primeira vez](#executando-pela-primeira-vez)
- [Importando o CSV de origem](#importando-o-csv-de-origem)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Comandos disponíveis](#comandos-disponíveis)
- [Testes](#testes)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Decisões técnicas](#decisões-técnicas)
- [Medições](#medições)
- [Limitações conhecidas](#limitações-conhecidas)
- [Integração contínua](#integração-contínua)
- [Deploy de demonstração](#deploy-de-demonstração)
- [Com mais tempo](#com-mais-tempo)
- [Documentação do processo](#documentação-do-processo)

> A sequência abaixo foi executada do zero num diretório limpo, a partir de um clone
> novo, antes desta entrega. Os 606 testes passam numa instalação virgem.

## Pré-requisitos

| Ferramenta | Versão | Observação |
|---|---|---|
| Node.js | 22 ou superior | O projeto usa `--env-file-if-exists`, disponível a partir da 22.9 |
| Docker | qualquer recente | Para o PostgreSQL e para os testes de integração |
| Chave da WeatherAPI | — | Gratuita e sem cartão em [weatherapi.com](https://www.weatherapi.com/) |

Não é necessário instalar PostgreSQL localmente: o `docker compose` cuida disso.

## Executando pela primeira vez

Do zero, em um diretório limpo:

```bash
# 1. Clonar e entrar no repositório
git clone <url-do-repositório> ideas-hub
cd ideas-hub

# 2. Configurar as variáveis de ambiente
cp .env.example .env
# Abra o .env e preencha WEATHER_API_KEY com sua chave.
# Os demais valores já vêm prontos para desenvolvimento local.

# 3. Subir o banco
docker compose up -d

# 4. Instalar as dependências (backend e frontend são pacotes independentes)
cd apps/api && npm install
cd ../web && npm install
cd ../..

# 5. Aplicar as migrations
cd apps/api && npm run db:migrate
```

A partir daqui, **dois terminais**:

```bash
# Terminal 1 — API em http://localhost:3000
cd apps/api && npm run dev

# Terminal 2 — Interface em http://localhost:5173
cd apps/web && npm run dev
```

Abra **http://localhost:5173**. A documentação da API fica em
**http://localhost:3000/docs**.

> **Porta 5173 ocupada?** O Vite escolhe outra e informa no terminal. Repare que a
> API só aceita requisições da origem configurada em `CORS_ORIGIN`: se o Vite subir em
> outra porta, ajuste `CORS_ORIGIN` no `.env` e reinicie a API. Sem isso a interface
> carrega mas mostra "Não foi possível contatar o servidor" — o navegador bloqueia as
> requisições antes de saírem.

## Importando o CSV de origem

O arquivo é distribuído como **tar gzipado**, apesar do nome sugerir apenas gzip.
`gunzip` sozinho não resolve:

```bash
# 1. Baixe o arquivo para data/ (o diretório é ignorado pelo git)
mkdir -p data
# ...coloque users.csv.tgz em data/

# 2. Extraia — é um tar, não um .gz simples
tar -xzf data/users.csv.tgz -C data/

# 3. Importe
cd apps/api && npm run import
```

O comando processa **500 mil linhas por padrão**, o que leva cerca de 16 segundos.
Para o arquivo completo:

```bash
npm run import -- --limit=0        # 10 milhões de linhas
npm run import -- --help           # todas as opções
```

Ao final, um relatório com as contagens:

```
─── Importação concluída ───────────────────────────
  Linhas lidas               500.000
  Importados                 220.875  44.2%
  Duplicados no arquivo      279.125  55.8%
  Já existentes no banco           0  0.0%
  Rejeitados                       0  0.0%

  Tempo   copy 6.5s   deduplicação 9.4s   total 15.9s
  Conferência das contagens: ok
────────────────────────────────────────────────────
```

A importação é **reproduzível**: executá-la duas vezes sobre o mesmo arquivo produz
exatamente o mesmo conjunto de usuários, sem duplicar nem alterar nada.

## Variáveis de ambiente

Um único `.env` na raiz atende os dois aplicativos — a API o lê via
`node --env-file`, e o Vite via `envDir`. O `.env.example` traz todas as chaves sem
valores reais.

> **`NODE_ENV` não entra neste arquivo.** O Vite respeita um `NODE_ENV` vindo de arquivo
> `.env`, e como o mesmo arquivo serve aos dois lados, um `NODE_ENV=development` escrito
> para a API fazia o `npm run build` do frontend publicar o React de desenvolvimento —
> 920 KB em vez de 672 KB, com as verificações de dev ativas em produção. A API assume
> `development` na ausência da variável; quem publicar define `NODE_ENV=production` no
> ambiente de execução, que é onde ela pertence. O `npm run build` verifica isso
> sozinho e falha se o pacote sair errado.

| Variável | Padrão | Descrição |
|---|---|---|
| `POSTGRES_USER` | `ideas_hub` | Consumida pelo `docker-compose.yml` |
| `POSTGRES_PASSWORD` | `ideas_hub_dev` | Credencial de desenvolvimento |
| `POSTGRES_DB` | `ideas_hub` | Nome do banco |
| `POSTGRES_PORT` | `5432` | Porta publicada pelo container |
| `DATABASE_URL` | — | Conexão da API; precisa refletir as credenciais acima |
| `PORT` | `3000` | Porta HTTP da API |
| `HOST` | `0.0.0.0` | Interface de escuta. Veja as limitações conhecidas antes de publicar |
| `LOG_LEVEL` | `info` | Nível do log estruturado |
| `CORS_ORIGIN` | `http://localhost:5173` | Origem autorizada a chamar a API |
| **`WEATHER_API_KEY`** | — | **Obrigatória.** Chave da WeatherAPI |
| `WEATHER_API_BASE_URL` | `https://api.weatherapi.com/v1` | Endereço da origem |
| `WEATHER_CACHE_TTL_SECONDS` | `600` | Expiração do cache de clima |
| `WEATHER_TIMEOUT_MS` | `5000` | Tempo limite da chamada externa |
| `DB_STATEMENT_TIMEOUT_MS` | `10000` | Tempo máximo de uma consulta da API. Não se aplica à importação |
| `VITE_API_URL` | `http://localhost:3000` | URL da API usada pela interface |

A API **valida todas na inicialização** e encerra com mensagem clara se algo faltar,
em vez de falhar na primeira requisição:

```
Variáveis de ambiente inválidas:
  - WEATHER_API_KEY: obrigatória: chave da WeatherAPI (veja .env.example)
```

A chave da WeatherAPI **nunca chega ao navegador**: a interface chama `/weather/:city`
na nossa API, e só o servidor conhece a origem externa. O `.env` está no `.gitignore`
desde o commit inicial, de modo que não existe ponto no histórico em que ela vaze.

## Comandos disponíveis

Executados dentro de `apps/api`:

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe a API com recarga automática |
| `npm run build` | Compila para `dist/` |
| `npm start` | Executa o build |
| `npm run db:migrate` | Aplica as migrations pendentes |
| `npm run db:generate` | Gera migration a partir do schema |
| `npm run db:studio` | Abre o Drizzle Studio para navegar no banco |
| `npm run import` | Importa o CSV de origem |
| `npm test` | Testes de integração com PostgreSQL efêmero |
| `npm run test:coverage` | Testes com relatório de cobertura |
| `npm run typecheck` | Verificação de tipos |
| `npm run lint` | ESLint |

Dentro de `apps/web`:

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe a interface |
| `npm run build` | Gera o build de produção e **recusa** um pacote que traga o React de desenvolvimento |
| `npm run preview` | Serve o build |
| `npm test` | Testes com Testing Library e MSW |
| `npm run test:coverage` | Testes com cobertura |
| `npm run typecheck` | Verificação de tipos |
| `npm run lint` | oxlint |

## Testes

```bash
cd apps/api && npm test    # 361 testes
cd apps/web && npm test    # 226 testes
```

Os testes da API sobem **um PostgreSQL real e efêmero** via Testcontainers, aplicando
as mesmas migrations de produção. Docker precisa estar em execução.

Isso é deliberado: rejeição de email duplicado é comportamento de constraint do banco,
e simulá-la testaria apenas o simulador. O mesmo vale para o índice funcional em
`lower(email)` e para as consultas de paginação.

A WeatherAPI **nunca é chamada em teste** — o servidor simulado está configurado para
falhar o teste se alguma requisição escapar para a rede.

### Cobertura

Há um limite de **90% de linhas e branches** onde mora a regra de negócio
(`modules/**` na API e o script de importação); o build falha abaixo disso. A
cobertura global é medida e publicada, mas não bloqueia.

O gate é seletivo de propósito. Cobertura mede linha executada, não asserção feita:
um teste que renderiza sem verificar nada cobre 100% do arquivo e não detecta
regressão alguma. Aplicar o limite apenas onde há regra de negócio evita criar
incentivo para teste raso em código de cola. O raciocínio completo está na
[`SPEC.md` §8](./SPEC.md).

## Estrutura do projeto

```
.
├── apps/
│   ├── api/                  # Node.js + TypeScript + Fastify + PostgreSQL
│   │   ├── src/
│   │   │   ├── db/           # schema, migrations, conexão
│   │   │   ├── lib/          # env, erros, logger, OpenAPI
│   │   │   ├── modules/      # users, weather, health
│   │   │   └── scripts/      # importação do CSV
│   │   └── tests/
│   └── web/                  # React + TypeScript + Vite
│       ├── src/
│       │   ├── api/          # cliente HTTP e tipos do contrato
│       │   ├── components/
│       │   ├── hooks/
│       │   ├── lib/
│       │   └── pages/
│       └── tests/
├── tasks/                    # plano técnico e lista de tarefas
├── docs/                     # enunciado original
├── docker-compose.yml        # PostgreSQL
├── SPEC.md                   # especificação
├── CAPABILITY_MAP.md         # capacidades e ordem de construção
└── AI_USAGE.md               # registro do uso de IA
```

**Monorepo com pastas independentes**, sem workspace. `apps/api` e `apps/web` têm
`package.json` e ciclo de instalação próprios. Os artefatos de especificação exigidos
são de raiz e o histórico de commits precisa ser único para a rastreabilidade — dois
repositórios quebrariam ambos. Não há workspace porque um pacote compartilhado não se
justifica neste escopo, e a consequência é que os tipos do contrato aparecem
declarados nos dois lados.

## Decisões técnicas

### Banco de dados

**Índice único funcional em `lower(email)`**, em vez de normalizar o valor gravado.
Garante unicidade sem distinguir maiúsculas de minúsculas **preservando no banco
exatamente o valor que veio da origem** — normalizar faria o dado divergir do CSV
importado.

**`pg_trgm` com índices GIN** em `name` e `email`. Sem eles, `ILIKE '%termo%'` sobre
1,6 milhão de linhas vira varredura sequencial. É a decisão não óbvia que o enunciado
pede para justificar. Com 220.875 registros, o planner os escolhe espontaneamente.

**Índice de ordenação composto `(created_at DESC, id)`.** O `id` é o desempate que
mantém a paginação estável quando há timestamps repetidos — sem ele, um registro
apareceria em duas páginas enquanto outro sumiria. E o índice precisa ser composto:
com apenas `created_at`, o PostgreSQL descarta o índice e ordena a tabela inteira.
Medido: **29 ms → 0,33 ms** na primeira página.

### API

**Sem verificação prévia de email existente.** Um `SELECT` antes do `INSERT` abre
janela de corrida: duas requisições simultâneas consultam, ambas não encontram nada, e
ambas inserem. Quem decide é o índice único, e a violação vira `409` num ponto único de
tratamento de erros.

**Formato de erro único**, com `code` estável e `message` que pode mudar de redação.
Erros de validação incluem `details` por campo, que é o que permite ao formulário
marcar o campo errado em vez de exibir um aviso genérico.

**`400` e `422` separados**: `400` indica requisição malformada no endereçamento (rota
ou query), `422` indica corpo bem formado que viola regra. Permite ao frontend
distinguir "link quebrado" de "formulário a corrigir".

**Paginação por `OFFSET`/`LIMIT` com `COUNT` total.** É o que entrega os metadados que
a interface precisa para numerar páginas. O custo está medido e documentado abaixo.

### Integração climática

**Contrato próprio**, desacoplado da forma da WeatherAPI. `temp_c` vira
`temperatureC`, `forecast.forecastday[0].hour` vira `hourly`. Trocar de provedor não
exigiria mexer na interface.

**Cache em memória com `stale-if-error`.** Dentro do TTL, serve do cache. Expirado,
busca na origem. Se a origem falhar e ainda houver entrada expirada, devolve o dado
antigo marcado como desatualizado em vez de propagar o erro — resolve cache e
indisponibilidade com a mesma peça, e mostra a temperatura de dez minutos atrás com
aviso em vez de uma tela de erro.

O cache tem **limite de entradas**: a chave vem do nome de cidade na URL, ou seja, é
controlada por quem chama, e sem teto requisições com nomes aleatórios fariam o mapa
crescer até consumir a memória do processo.

**Nenhum status da origem atravessa direto.** A WeatherAPI usa `400` para "cidade não
existe", que repassado viraria erro de quem chamou; e `401/403` significam chave
errada, que é problema nosso de configuração e vira `502`, não `403`.

### Importação

**`COPY` para tabela de rascunho, depois deduplicação em uma consulta.** A staging não
tem restrição alguma, o que permite receber as linhas brutas sem o banco rejeitar 84%
delas uma a uma. A deduplicação usa
`DISTINCT ON (lower(email)) ... ORDER BY lower(email), line_no`, e o número de linha é
o que torna determinístico qual registro vence: **a primeira ocorrência no arquivo**.

**Leitura em streaming.** O arquivo tem 935 MB; o uso de memória fica constante
independentemente do tamanho.

### Frontend

**A URL é a fonte de verdade dos filtros.** Busca, ordenação, página e itens por página
vivem em `useSearchParams`. Não há estado paralelo: recarregar ou compartilhar o link
preserva o contexto.

**Debounce na busca de usuários, envio explícito na de cidade.** Parece inconsistente,
e é proposital: a busca de usuários consulta o nosso banco, onde o debounce economiza
requisições sem custo externo; a de clima atravessa para um serviço com cota, e
disparar a cada pausa gastaria consultas em nomes incompletos.

**Confirmação de exclusão embutida na tela**, não `window.confirm`. O diálogo nativo
não pode ser estilizado nem traduzido, bloqueia a thread do navegador e trava
automação.

**A localidade resolvida aparece em destaque na tela de clima.** A WeatherAPI faz
correspondência aproximada: `"sao pualo"` devolve `"Sao Sao, Chad"` com status `200`.
Sem exibir cidade, região e país, alguém leria esse resultado achando que é São Paulo.

## Medições

Feitas nesta máquina, sobre o arquivo real. Não são estimativas.

### Leitura do CSV

| Linhas | Tempo | Taxa | Pico de memória |
|---:|---:|---:|---:|
| 500.000 | 0,5 s | 969 mil/s | 106 MB |
| 10.000.000 | 9,8 s | 1,02 milhão/s | 102 MB |

O pico praticamente idêntico entre 500 mil e 10 milhões de linhas é a evidência de que
o consumo é constante.

### `COPY` contra `INSERT`

Com 10 mil linhas reais:

| Estratégia | Taxa | Projeção para 10 milhões |
|---|---:|---:|
| `INSERT` sequencial | 4.752 linhas/s | ~35 min |
| `COPY` | 84.752 linhas/s | **~2 min** |

**17,8× mais rápido.**

### Consultas com 220.875 registros

| Consulta | Tempo |
|---|---:|
| `COUNT` com filtro parcial em nome e email | 64 ms |
| Primeira página ordenada | 0,33 ms |
| `OFFSET 100000` | 67 ms |

O `COUNT` com filtro usa `BitmapOr` sobre os dois índices GIN. O risco de ele se tornar
proibitivo **não se materializou** nesse volume.

## Limitações conhecidas

As entradas abaixo marcadas com **[revisão]** vieram de uma varredura adversarial do
código feita por um agente revisor próprio, em seis frentes paralelas, cada achado com
reprodução executada. As de severidade alta foram corrigidas; estas são as que ficaram,
com o custo medido e a razão de terem ficado. O processo está descrito em
[`AI_USAGE.md`](./AI_USAGE.md#review-agente-revisor-próprio), e a definição do agente em
[`.claude/agents/revisor-codigo.md`](./.claude/agents/revisor-codigo.md).

**`sort=name` e `sort=email` não têm índice.** [revisão] A tabela de índices da SPEC §7
documenta apenas o de `created_at`, e a interface oferece as três colunas como
ordenáveis. Medido com 220.874 registros: 0,43 ms com índice contra 57,9 ms sem, e 135×
mais buffers lidos por clique na coluna "Nome". Criar `(name, id)` e `(email, id)`
resolveria, ao custo de escrita e espaço na importação de 10 milhões de linhas — a
decisão precisa de medição da carga completa, que não foi feita. O teto de `page` e o
tempo limite de consulta, ambos aplicados, limitam o pior caso enquanto isso.

**A API escuta em `0.0.0.0` por padrão.** [revisão] Combinado com a ausência de
autenticação, que a SPEC §12 coloca fora de escopo, qualquer máquina na mesma rede tem
acesso completo ao CRUD. Confirmado respondendo pelo IP de LAN. O padrão continua aberto
porque é o que faz o `docker compose` funcionar sem configuração extra; quem publicar
precisa definir `HOST=127.0.0.1` e colocar um proxy na frente.

**O log grava os parâmetros da consulta quando o banco falha.** [revisão] O
`DrizzleQueryError` carrega `query` e `params`, e o serializador do pino os emite. A
lista de `redact` cobre a chave da WeatherAPI e os cabeçalhos de autenticação, mas não
`params` — então uma indisponibilidade do banco transforma o log num repositório
secundário de nome, email e telefone em claro. A resposta ao cliente continua correta e
genérica.

**`/weather` não coalesce chamadas em voo.** [revisão] N requisições simultâneas para a
mesma cidade fria produzem N chamadas à origem: medido, 50 de 50 com `hit:false`. O
cache protege repetição sequencial, não pico de concorrência, e um `404` da origem nunca
é memorizado. Sem limite de taxa, um cliente esgota a cota gratuita variando o nome da
cidade.

**Origem climática lenta no corpo vira `502`, não `504`.** [revisão] O tempo limite
protege a requisição inteira e o servidor não trava, mas quando o aborto ocorre durante
a leitura do corpo o erro é classificado como indisponibilidade em vez de tempo
esgotado. O tempo gasto é o mesmo; só o diagnóstico muda.

**Interromper a importação não cancela a gravação.** [revisão] Com o processo morto por
`kill -9` durante o merge, o backend do PostgreSQL continua e **commita**; a staging fica
para trás. Quem abortou não recebe saída nem código de retorno e acredita que nada foi
gravado. A execução seguinte se recupera do órfão — o `TRUNCATE` faz seu trabalho,
verificado.

**Ordenar ou paginar durante o debounce da busca é desfeito.** [revisão] O temporizador
de 300 ms captura os filtros do instante em que a tecla foi digitada; qualquer outro
filtro alterado nesse intervalo é sobrescrito quando ele dispara. Quem digita uma busca e
clica numa coluna vê a ordenação ser aplicada e voltar sozinha, sem mensagem. É perda de
atualização entre duas escritas concorrentes no mesmo estado, e a URL — que a SPEC define
como fonte de verdade — termina num estado que ninguém pediu.

**Página fora da faixa mostra "nenhum usuário cadastrado" e esconde a paginação.**
[revisão] A API responde `200` com `data: []` para páginas além do fim, e a tela não
distingue isso de base vazia. Como os controles de paginação estão sob a mesma condição,
some também o caminho de volta: só editando a URL. Acontece ao excluir o último registro
da última página, ou ao abrir um link antigo. Encontrado de forma independente por duas
frentes.

**`?page=1e21` na URL leva a uma tela de erro.** [revisão] `Number.isInteger(1e21)` é
verdadeiro, então o guarda aceita; `String(1e21)` produz `"1e+21"`, que a API rejeita com
`400`. O arquivo promete por escrito que valor inválido cai no padrão em vez de virar
tela de erro — promessa que vale para `abc` e `-5`, mas não para o que sobrevive ao
`isInteger`.

**A confirmação de exclusão toma o foco e não o devolve.** [revisão] Ao cancelar, o botão
focado deixa de existir e o foco volta para o `<body>`; depois de excluir, a listagem
monta na mesma situação. Quem navega por teclado perde a posição no meio do fluxo —
exatamente o percurso que o critério S14 cobre. É a motivação concreta da tarefa de
redesenho registrada em `tasks/todo.md` (`TASK-OPT-04`): primitivas acessíveis prontas
resolvem isso por construção, enquanto a implementação à mão resolve caso a caso.

**A escala completa não foi carregada.** O padrão importa 500 mil linhas para que a
avaliação seja rápida. As medições acima projetam ~2 minutos para os 10 milhões, mas a
carga completa em si e a construção dos índices GIN sobre 1,6 milhão de registros não
foram cronometradas.

**Ordenação ascendente por data não usa índice.** O índice composto cobre
`created_at DESC, id ASC`, que é o padrão da listagem. A direção ascendente exigiria um
segundo índice, o que não se justifica com o padrão sendo decrescente.

**`OFFSET` profundo cresce linearmente.** Aos 67 ms na página 5.000 ainda é aceitável,
mas a `keyset pagination` seria a solução para volumes maiores. A troca foi
descartada conscientemente: mudá-la quebraria contrato, interface e testes já
estabelecidos.

**Cache de clima apenas em memória.** Reiniciar a API o esvazia, e múltiplas instâncias
não o compartilhariam. O enunciado aceita explicitamente essa simplificação.

**Consultas simultâneas à mesma cidade não são agrupadas.** Duas requisições paralelas
para uma cidade sem cache disparam duas chamadas à origem. Em um cenário de cota
apertada valeria agrupá-las.

**O parser de CSV divide por vírgula**, sem interpretar aspas. O dataset foi
inspecionado e não as contém — as 10 milhões de linhas têm exatamente quatro campos —
e a divisão simples é bem mais rápida nesse volume. A limitação é tratada de forma
explícita: linha com aspas ou com número de campos diferente de quatro é **rejeitada
com motivo**, nunca interpretada pela metade.

**Vulnerabilidade moderada em dependência de desenvolvimento.** O `drizzle-kit` depende
transitivamente de uma versão antiga do `esbuild`
([GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)). A falha
afeta o servidor de desenvolvimento do esbuild, que o `drizzle-kit` nunca sobe; é
dependência de desenvolvimento e não vai para produção; e como o SQL gerado está
versionado, quem avalia o projeto nem precisa executá-lo. `npm audit fix --force`
rebaixaria para uma versão que provavelmente perderia a geração de índice funcional e
GIN.

**Versões diferentes de TypeScript entre os apps** (5.9 na API, 6.0 no frontend). Cada
cadeia de ferramentas suporta uma; é consequência esperada de manter os pacotes
independentes.

**Sem autenticação**, conforme o enunciado determina.

## Integração contínua

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) roda a cada push na `main` e em
cada pull request:

| Etapa | O que faz |
|---|---|
| **API** | `typecheck`, `lint` e testes com cobertura, com PostgreSQL efêmero via Testcontainers |
| **Frontend** | `typecheck`, `lint`, testes com cobertura e o `build`, que carrega a guarda do `bundleType` |
| **Publicar** | Chama o Deploy Hook dos dois serviços do Render |

**A publicação depende da verificação.** É a diferença em relação ao deploy automático da
plataforma, que publicaria a cada push passando ou não nos testes. O passo de publicação
só roda em push na `main` — nunca a partir de um pull request, que colocaria código não
revisado no ar.

As URLs dos hooks são segredos do repositório (`RENDER_DEPLOY_HOOK_API` e
`RENDER_DEPLOY_HOOK_WEB`). Se algum faltar, o workflow **falha com mensagem clara**: sem
essa checagem, o `curl` receberia uma URL vazia e o job passaria em verde sem publicar
nada, que é o pior desfecho possível para um passo de publicação.

**O primeiro retorno veio na primeira execução.** Ela falhou no lint da API, apontando
dois arquivos `.mjs` que a configuração do ESLint não cobria. Eu havia criado esses
scripts e rodado typecheck, build e as suítes — mas não o lint. O erro estava na máquina
desde então, e só apareceu quando alguém verificou tudo de uma vez.

## Deploy de demonstração

Diferencial opcional: o enunciado declara que **não é necessário publicar a aplicação**.
O [`render.yaml`](./render.yaml) na raiz descreve os três recursos — Postgres 16, a API
como Web Service e o frontend como Static Site — para que a publicação seja revisável
como o resto do projeto, em vez de depender de cliques lembrados de memória.

### A ordem importa, e não é arbitrária

A API precisa da origem do frontend para o `CORS_ORIGIN`. O frontend precisa da URL da
API em **tempo de build**, porque `VITE_API_URL` é embutida no pacote e não lida em
execução. Uma das duas sempre existe antes da outra, então as duas variáveis ficam como
preenchimento manual no painel e a ordem é esta:

```
1. Criar o Blueprint a partir do repositório
   → o Render lê o render.yaml e cria os três recursos

2. Preencher WEATHER_API_KEY no serviço ideas-hub-api
   → é segredo; nunca entra em arquivo versionado

3. Primeiro deploy do ideas-hub-web (falha ao chamar a API — esperado)
   → o que importa é a URL que ele ganha

4. CORS_ORIGIN no ideas-hub-api = URL do ideas-hub-web
   VITE_API_URL no ideas-hub-web = URL do ideas-hub-api

5. Redeploy dos dois
```

Sem o passo 5 o frontend continua com a URL antiga embutida: reconstruir é a única forma
de trocar uma variável `VITE_*`.

### Carga de dados

O CSV de 935 MB não sobe para lugar nenhum. A demonstração é carregada da máquina local
apontando para o banco hospedado:

```bash
cd apps/api
DATABASE_URL="<connection string do Render>" npm run import -- --limit=50000
```

Use a **External Database URL** do painel, não a interna: a interna só resolve dentro da
rede do Render. Ela vem com `?sslmode=require`, e a versão do `pg` usada aqui trata esse
modo como `verify-full`, ou seja, valida a cadeia do certificado. Os certificados do
Render são de CA pública e passam. Se em algum ambiente a validação falhar, o diagnóstico
é `self-signed certificate in certificate chain`, e a saída é trocar para
`?sslmode=no-verify` **apenas nessa execução de importação** — nunca na variável do
serviço, porque aí a API passaria a aceitar qualquer certificado.

50 mil linhas produzem cerca de 22 mil usuários, o suficiente para exercitar busca,
ordenação e paginação. **O volume completo não cabe no plano gratuito:** o banco local
com 220.873 usuários ocupa 179 MB, dos quais **120 MB são os índices GIN de trigrama** —
contra 0,5 GB de limite, é folga pequena demais para uma demonstração.

### Quatro coisas que só a plataforma revelou

Os quatro comandos foram ensaiados localmente antes de publicar, e mesmo assim:

1. **`preDeployCommand` não existe no plano gratuito.** O blueprint foi recusado na
   validação com "pre-deploy command is not supported for free tier services". As
   migrations passaram para o `startCommand`, encadeadas com `&&` — o servidor continua
   não subindo com o schema desatualizado.
2. **`NODE_ENV=production` faz o `npm ci` pular as `devDependencies`.** A variável que a
   aplicação precisa quebra o próprio build: 99 pacotes instalados em vez de 454, e o
   deploy falha com `TS7016: Could not find a declaration file for module
   'pg-copy-streams'`. Resolvido com `--include=dev` no comando e `NPM_CONFIG_INCLUDE=dev`
   na variável de ambiente.
3. **O Render não atualiza o comando de build de um serviço já criado.** O campo fica
   bloqueado por ser gerenciado pelo blueprint e mantém o valor do momento da criação;
   dois syncs não mudaram nada. É por isso que a correção acima precisa existir também
   como variável de ambiente, que continua editável.
4. **Conectar o provedor Git depois não religa o que já existe.** Criado a partir da URL
   do repositório público, o blueprint não recebe aviso de push. Instalar o app do
   Render no GitHub — com escopo restrito a este repositório, e não à conta inteira —
   **não resolveu**: um push real depois da instalação não disparou deploy nenhum, e o
   botão que religaria o blueprint está desabilitado. O `Auto-Deploy` do serviço sempre
   esteve em "On Commit"; o que falta é o Render saber dos pushes.

   A saída foi o **Deploy Hook** de cada serviço, chamado pela
   [esteira de verificação](#integração-contínua) — que acabou sendo melhor que o deploy
   automático, porque condiciona a publicação aos testes passarem.

### O que esperar do plano gratuito

- **O serviço hiberna após inatividade.** O primeiro acesso de quem for avaliar leva
  dezenas de segundos para responder. Não é defeito da aplicação, e sem este aviso é
  lido como um.
- **O Postgres gratuito do Render expira.** Um link de demonstração tem prazo de
  validade; o repositório não.

### O que foi verificado antes de publicar

Os quatro comandos do blueprint foram ensaiados a partir de um clone limpo, contra um
banco descartável, com as mesmas variáveis que a plataforma define:

| Etapa | Resultado |
|---|---|
| `npm ci && npm run build` (API) | `dist/` com as 2 migrations e o journal |
| `npm run db:migrate:dist` | schema aplicado: `pg_trgm`, 5 índices, 6 colunas |
| `npm start` | `/health` 200, `/users` 200, `/docs` 200, log em JSON com `reqId` |
| `npm ci && npm run build` (web) | URL de produção embutida, `localhost` ausente, React de produção |

A chave da WeatherAPI foi conferida ausente da resposta de `/weather/:city`.

## Com mais tempo

Em ordem de valor percebido:

1. **Executar e medir a carga completa dos 10 milhões**, publicando tempo real,
   memória e duração da construção dos índices.
2. **Pipeline de integração contínua** rodando lint, typecheck, testes e cobertura a
   cada push.
3. **Teste ponta a ponta com Playwright** sobre um fluxo crítico, com banco, API e
   interface reais.
4. **Redesenho da interface sobre primitivas acessíveis**, provavelmente Radix UI — e
   possivelmente shadcn/ui, que é um gerador sobre Radix e Tailwind, não uma dependência.
   A motivação não é estética: é substituir a acessibilidade de interação escrita à mão,
   onde a revisão já encontrou o foco não sendo devolvido na confirmação de exclusão.
   A decisão em aberto é se o ganho justifica trazer Tailwind para um projeto com 624
   linhas de CSS próprio e paleta já validada. Detalhado em `TASK-OPT-04`.
5. **Agrupamento de consultas simultâneas** ao serviço de clima.
6. **Importação retomável**, registrando a última linha processada para continuar de
   onde parou em caso de interrupção.
7. **Índice de ordenação ascendente**, caso a telemetria mostre uso relevante.

## Documentação do processo

O projeto foi desenvolvido com **Spec-Driven Development**. Os artefatos ficam
versionados e o histórico de commits distingue as fases:

| Arquivo | Conteúdo |
|---|---|
| [`SPEC.md`](./SPEC.md) | Objetivo, premissas, contrato da API, modelo de dados, estratégia de testes e 16 critérios de sucesso verificáveis |
| [`CAPABILITY_MAP.md`](./CAPABILITY_MAP.md) | Doze capacidades com dependências e ordem de construção |
| [`tasks/plan.md`](./tasks/plan.md) | Nove marcos com riscos e checkpoints |
| [`tasks/todo.md`](./tasks/todo.md) | Tarefas com critério de aceite, verificação e o commit que as implementou |
| **[`AI_USAGE.md`](./AI_USAGE.md)** | **Registro do uso crítico de IA**, com matriz de rastreabilidade |
| [`docs/enunciado.md`](./docs/enunciado.md) | Enunciado original, versionado como referência dos requisitos |

Os commits usam prefixos que identificam a fase: `spec:`, `plan:`, `tasks:`, `feat:`,
`test:`, `refactor:`, `docs:`.
