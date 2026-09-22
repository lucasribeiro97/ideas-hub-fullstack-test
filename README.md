# Ideas Hub — Teste Prático Fullstack

Aplicação fullstack para consulta e gerenciamento de usuários, com integração a um
serviço externo de informações climáticas.

**Node.js 22 + TypeScript + Fastify + PostgreSQL 16** no backend,
**React 19 + TypeScript + Vite** no frontend.

- 315 testes na API, 226 no frontend
- 220.875 usuários importados do CSV de origem, a partir de 500 mil linhas
- Contrato documentado em OpenAPI, servido pelo Swagger UI

## Índice

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
- [Com mais tempo](#com-mais-tempo)
- [Documentação do processo](#documentação-do-processo)

> A sequência abaixo foi executada do zero num diretório limpo, a partir de um clone
> novo, antes desta entrega. Os 553 testes passam numa instalação virgem.

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
| `HOST` | `0.0.0.0` | Interface de escuta |
| `LOG_LEVEL` | `info` | Nível do log estruturado |
| `CORS_ORIGIN` | `http://localhost:5173` | Origem autorizada a chamar a API |
| **`WEATHER_API_KEY`** | — | **Obrigatória.** Chave da WeatherAPI |
| `WEATHER_API_BASE_URL` | `https://api.weatherapi.com/v1` | Endereço da origem |
| `WEATHER_CACHE_TTL_SECONDS` | `600` | Expiração do cache de clima |
| `WEATHER_TIMEOUT_MS` | `5000` | Tempo limite da chamada externa |
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
cd apps/api && npm test    # 315 testes
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

## Com mais tempo

Em ordem de valor percebido:

1. **Executar e medir a carga completa dos 10 milhões**, publicando tempo real,
   memória e duração da construção dos índices.
2. **Pipeline de integração contínua** rodando lint, typecheck, testes e cobertura a
   cada push.
3. **Teste ponta a ponta com Playwright** sobre um fluxo crítico, com banco, API e
   interface reais.
4. **Agrupamento de consultas simultâneas** ao serviço de clima.
5. **Importação retomável**, registrando a última linha processada para continuar de
   onde parou em caso de interrupção.
6. **Índice de ordenação ascendente**, caso a telemetria mostre uso relevante.

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
