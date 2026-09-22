# SPEC

Especificação da aplicação de consulta e gerenciamento de usuários com integração
climática. Este documento precede o código e é atualizado sempre que uma decisão muda.

## 1. Objetivo

Entregar uma aplicação fullstack executável localmente que permita:

- gerenciar usuários (criar, listar com busca/ordenação/paginação, detalhar, editar, remover);
- consultar o clima atual de uma cidade e sua variação de temperatura ao longo do dia;
- importar de forma reproduzível um dataset de origem em CSV.

O critério de sucesso global é uma aplicação que **roda com instruções claras**, tem os
fluxos obrigatórios corretos e é transparente sobre seus limites.

## 2. Premissas e interpretações

Registradas conforme o enunciado pede em caso de ambiguidade.

| # | Ponto ambíguo | Interpretação adotada |
|---|---|---|
| P1 | O arquivo é anunciado como `users.csv.gz` | O arquivo real é um **tar gzipado** (`users.csv.tgz`) contendo `users.csv`. `gunzip` isolado não basta; a documentação instrui `tar -xzf`. |
| P2 | O CSV traz uma coluna `phone` não citada no schema | O enunciado diz "no mínimo" esses campos. `phone` é importado como campo opcional e exposto na API e na UI. Descartar dado da origem sem motivo técnico seria perda gratuita. |
| P3 | "Tratar emails duplicados" não define qual registro vence | Vence a **primeira ocorrência no arquivo**. As duplicatas têm IDs e nomes diferentes entre si, então a escolha precisa ser determinística e documentada. |
| P4 | Unicidade de email não especifica sensibilidade a caixa | Tratada como **case-insensitive**: `Contato@X.com` e `contato@x.com` são o mesmo usuário. |
| P5 | "Variação de temperatura ao longo do dia" não define granularidade | Série **horária** do dia corrente, obtida em chamada única à WeatherAPI. |
| P6 | Volume esperado da importação não é definido | O padrão importa 500.000 linhas para que a avaliação seja rápida; `--limit=0` processa o arquivo completo. O tempo da carga completa é medido e documentado no README. |
| P7 | A busca de cidade da WeatherAPI é aproximada | Verificado contra a API real: `"sao pualo"` devolve "Sao Sao, Chad" e `"12345"` devolve "Schenectady, USA" (interpretado como CEP). O `404` só ocorre quando nada casa. Como não há forma confiável de distinguir acerto de aproximação, a interface **sempre exibe a cidade, região e país resolvidos em destaque**, para que o erro de digitação seja visível a quem consultou. |

## 3. Dataset de origem

Levantado por inspeção direta do arquivo antes de qualquer decisão de modelagem.

| Métrica | Valor |
|---|---|
| Arquivo comprimido | 393 MB (tar + gzip) |
| CSV descomprimido | 935 MB |
| Linhas de dados | 10.000.000 |
| Colunas | `id, name, email, phone` |
| Emails distintos | 1.598.726 |
| Linhas descartadas por email duplicado | 8.401.274 (84%) |
| IDs duplicados | 0 |
| Campos vazios / emails malformados / UUIDs inválidos | 0 |
| Colisões de email apenas por caixa | 0 |
| Tamanho máximo: `name` / `email` / `phone` | 31 / 36 / 18 caracteres |

Consequências diretas para o projeto:

- **Streaming é obrigatório.** 935 MB não cabem confortavelmente em memória.
- **`COPY` em vez de `INSERT` linha a linha.** Medido nesta máquina com 10 mil linhas
  reais: `INSERT` sequencial faz 4.752 linhas/s e `COPY` faz 84.752 linhas/s — **17,8×
  mais rápido**, o que projeta ~35 minutos contra ~2 minutos para o arquivo completo.
  A estimativa inicial desta seção dizia "~1.000 inserções/s, levariam horas"; era um
  chute, e está substituída pela medição.
- **A deduplicação é a maior parte do trabalho**, não um caso de borda: 84% das linhas
  são descartadas.
- **O arquivo está estruturalmente íntegro.** A validação de registros inválidos existe
  por robustez, não porque o dataset atual a exercite — e isso é dito explicitamente
  para não sugerir uma cobertura que os dados não comprovam.

O diretório `data/` é versionado como ignorado; o dataset nunca entra no repositório.

## 4. Stack e justificativas

| Camada | Escolha | Por quê |
|---|---|---|
| Runtime | Node.js 22 + TypeScript | Exigido pelo enunciado |
| HTTP | Fastify | Validação por schema, OpenAPI derivada do schema e logs estruturados com request-id já integrados — menos código de cola para requisitos explícitos |
| Dados | Drizzle ORM + drizzle-kit | Tipagem real, SQL previsível e acesso direto ao `pg` para o `COPY` da importação, sem cliente paralelo |
| Banco | PostgreSQL 16 | Exigido pelo enunciado |
| Validação | Zod | Compartilhada entre corpo, query, env e geração do contrato |
| Frontend | Vite + React + TypeScript | Exigido; Vite pelo setup enxuto |
| Rotas | React Router | `useSearchParams` resolve o requisito de filtros na URL |
| Dados no front | TanStack Query | Estados de carregamento/erro, cache e cancelamento de requisições obsoletas de fábrica |
| Gráfico | Recharts | API declarativa, integra bem com React e é suficiente para uma série horária |
| Testes | Vitest + Testcontainers + Testing Library + MSW | Ver §8 |
| Clima | WeatherAPI.com | Uma única chamada devolve condição atual e série horária; chave gratuita sem cartão |

**Monorepo com pastas independentes.** `apps/api` e `apps/web` têm `package.json` e
ciclo de instalação próprios, sem workspace. Os artefatos de especificação exigidos são
de raiz e o histórico de commits precisa ser único para a rastreabilidade — dois
repositórios quebrariam ambos. Não há workspace porque um pacote compartilhado não se
justifica neste escopo.

## 5. Estrutura do projeto

```
.
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── db/          # schema, migrations, conexão
│   │   │   ├── modules/     # users, weather (rotas + serviços + schemas)
│   │   │   ├── scripts/     # importação do CSV
│   │   │   └── lib/         # env, erros, logger
│   │   └── tests/
│   └── web/
│       ├── src/
│       │   ├── pages/       # lista, detalhe, formulário, clima
│       │   ├── components/
│       │   ├── api/         # cliente HTTP e tipos do contrato
│       │   └── hooks/
│       └── tests/
├── tasks/                   # plan.md e todo.md
├── docs/                    # enunciado original
└── docker-compose.yml       # PostgreSQL
```

## 6. Contrato da API

Formato de erro único para toda a API:

```json
{ "error": { "code": "USER_EMAIL_TAKEN", "message": "Já existe um usuário com este email." } }
```

Erros de validação acrescentam `details`, listando cada campo rejeitado. Sem isso o
frontend só consegue exibir uma mensagem genérica no topo do formulário, em vez de
apontar o campo com problema — o que o requisito de "mensagens claras" (§13 S13) pede:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados inválidos.",
    "details": [{ "field": "email", "message": "email inválido" }]
  }
}
```

`details` descreve **a requisição de quem chamou**, não o estado interno do servidor:
nome de campo e motivo, nunca nome de tabela, SQL ou caminho de arquivo.

### Catálogo de códigos

| Código | HTTP | Quando |
|---|---:|---|
| `VALIDATION_ERROR` | 422 | Corpo bem formado, mas semanticamente inválido |
| `INVALID_PARAM` | 400 | Parâmetro de rota ou de query malformado (ex.: id que não é UUID) |
| `USER_NOT_FOUND` | 404 | Usuário inexistente |
| `USER_EMAIL_TAKEN` | 409 | Email já usado por outro usuário |
| `ROUTE_NOT_FOUND` | 404 | Rota inexistente |
| `INTERNAL_ERROR` | 500 | Qualquer falha não prevista |
| `WEATHER_CITY_NOT_FOUND` | 404 | Cidade não encontrada na origem |
| `WEATHER_TIMEOUT` | 504 | Origem excedeu o tempo limite |
| `WEATHER_RATE_LIMITED` | 429 | Cota da origem esgotada |
| `WEATHER_UPSTREAM_ERROR` | 502 | Origem indisponível ou resposta inesperada |

A separação entre `400` e `422` é deliberada: `400` indica requisição malformada no
endereçamento (rota ou query), `422` indica corpo bem formado que não satisfaz as
regras. Isso permite ao frontend distinguir "link quebrado" de "formulário a corrigir".

Nenhuma resposta de erro expõe stack trace, SQL ou mensagem de driver. Em `500`, o
cliente recebe mensagem genérica e o detalhe real vai apenas para o log, correlacionado
pelo `x-request-id` devolvido no cabeçalho.

### Usuários

| Método | Rota | Regras |
|---|---|---|
| `POST` | `/users` | `201` com o usuário criado. `409` se o email já existe (comparação sem distinguir caixa). `422` se o corpo é inválido. |
| `GET` | `/users` | `200` com itens e metadados de paginação. |
| `GET` | `/users/:id` | `200`, `404` se inexistente, `400` se o id não é UUID. |
| `PATCH` | `/users/:id` | `200`, `404`, `409` em conflito de email, `422` em corpo inválido. |
| `DELETE` | `/users/:id` | `204`, `404` se inexistente. |

`GET /users` aceita:

| Parâmetro | Regra |
|---|---|
| `search` | busca parcial e sem distinção de caixa em `name` **ou** `email` |
| `page` | inteiro ≥ 1, padrão `1` |
| `perPage` | inteiro entre 1 e 100, padrão `20` |
| `sort` | `name`, `email` ou `createdAt`, padrão `createdAt` |
| `order` | `asc` ou `desc`, padrão `desc` |

Resposta:

```json
{
  "data": [ { "id": "…", "name": "…", "email": "…", "phone": "…",
              "createdAt": "…", "updatedAt": "…" } ],
  "meta": { "page": 1, "perPage": 20, "total": 1598726, "totalPages": 79937 }
}
```

`perPage` é limitado a 100 porque `OFFSET` profundo e `COUNT` sobre 1,6M de linhas são
caros; o limite mantém a latência previsível.

### Clima

`GET /weather/:city` devolve contrato próprio, desacoplado da forma da API externa:

```json
{
  "city": "São Paulo",
  "country": "Brazil",
  "current": { "temperatureC": 24.1, "humidity": 65,
               "condition": "Parcialmente nublado", "observedAt": "…" },
  "hourly": [ { "time": "…", "temperatureC": 19.8 } ],
  "cache": { "hit": true, "stale": false, "fetchedAt": "…" }
}
```

| Situação | Resposta |
|---|---|
| Cidade inexistente | `404 WEATHER_CITY_NOT_FOUND` |
| Timeout da origem | `504 WEATHER_TIMEOUT`, ou dado expirado com `stale: true` se houver cache |
| Rate limit da origem | `429 WEATHER_RATE_LIMITED`, mesma regra de cache expirado |
| Origem indisponível | `502 WEATHER_UPSTREAM_ERROR`, mesma regra de cache expirado |

**Limitação conhecida da origem (P7):** a WeatherAPI faz correspondência
aproximada de nome de cidade. Um erro de digitação raramente produz `404` —
mais frequentemente devolve `200` com uma localidade diferente. Por isso a
resposta inclui `city`, `region` e `country` resolvidos: são o único meio de
quem consulta perceber que recebeu outra cidade.

**Cache:** mapa em memória por cidade normalizada, TTL de 10 minutos. Em falha da
origem, uma entrada expirada é servida com `stale: true` em vez de propagar o erro —
resolve cache e indisponibilidade na mesma peça. O TTL é configurável por variável de
ambiente.

## 7. Modelo de dados

```
users
  id          uuid        PK
  name        text        NOT NULL
  email       text        NOT NULL
  phone       text        NULL
  created_at  timestamptz NOT NULL DEFAULT now()
  updated_at  timestamptz NOT NULL DEFAULT now()
```

| Índice | Justificativa |
|---|---|
| `UNIQUE (lower(email))` | Garante unicidade sem distinguir caixa preservando o valor original da origem. Funcional, sem depender de extensão. |
| `GIN (name gin_trgm_ops)` | `ILIKE '%termo%'` sobre 1,6M de linhas é varredura completa sem isso. Decisão não óbvia, exigindo `pg_trgm`. |
| `GIN (email gin_trgm_ops)` | Mesma razão, para busca parcial por email. |
| `BTREE (created_at DESC, id ASC)` | Sustenta a ordenação padrão da listagem **incluindo o desempate por `id`**. Ver nota abaixo: a versão de coluna única não servia. |

O índice único é funcional e não simples porque a decisão P4 exige comparação sem caixa,
e normalizar o valor gravado faria o banco divergir do arquivo de origem.

**Por que o índice de ordenação é composto.** A listagem ordena por
`created_at DESC, id ASC` — o `id` é o desempate que mantém a paginação estável quando
há timestamps repetidos. Um índice apenas em `created_at DESC` **não atende** essa
cláusula: o PostgreSQL descarta o índice e faz varredura sequencial com ordenação
completa. Medido sobre 220.875 registros:

| Consulta | `created_at DESC` | `created_at DESC, id ASC` |
|---|---:|---:|
| Primeira página | 29 ms (`Seq Scan` + `Sort`) | **0,14 ms** (`Index Scan`) |
| `OFFSET 100000` | 149 ms, ordenação em disco (22 MB) | **37 ms**, sem disco |

A ordenação **ascendente** por `created_at` continua exigindo ordenação, porque a
varredura reversa do índice produz `id` em ordem contrária à pedida. Cobrir as duas
direções exigiria um segundo índice, o que não se justifica: o padrão da listagem é
decrescente. Limitação registrada em vez de otimizada especulativamente.

## 8. Estratégia de testes

| Camada | Ferramenta | Escopo |
|---|---|---|
| Integração da API | Vitest + Testcontainers | Postgres real e efêmero, migrations aplicadas por execução |
| Clima | Vitest + MSW | API externa simulada: sucesso, timeout, 404, 5xx, rate limit |
| Importação | Vitest + Testcontainers | Arquivo pequeno com duplicatas e registros inválidos propositais |
| Frontend | Vitest + Testing Library + MSW | Fluxo de listagem com busca e paginação |
| E2E *(opcional)* | Playwright | Um fluxo crítico, apenas se o obrigatório estiver fechado |

Os cenários obrigatórios do enunciado são testados contra **Postgres real**, não contra
mocks: rejeição de email duplicado é comportamento de constraint, e simulá-la testaria
apenas o simulador.

### Cobertura

O enunciado não exige meta percentual e avalia a relevância dos cenários. Ainda assim
adotamos um threshold **seletivo**, porque cobertura é o instrumento mais eficiente para
detectar um caminho de código que nenhum teste executa — risco concreto num projeto com
filtros, ordenação, paginação e quatro modos de falha da API externa.

| Alvo | Política |
|---|---|
| `apps/api/src/modules/**` | Gate de **90%** (linhas e branches). Falha o build abaixo disso |
| `apps/api/src/scripts/import*` | Gate de **90%**. Regra de deduplicação e rejeição mora aqui |
| Cobertura global (api e web) | **Medida e publicada**, sem gate |

Excluídos do denominador, com o motivo:

| Excluído | Por quê |
|---|---|
| `src/db/migrations/**` | Schema versionado, verificado pela aplicação da migration em si |
| `drizzle.config.ts`, `vite.config.ts` | Configuração declarativa, sem lógica |
| `src/server.ts` (bootstrap) | Wiring de inicialização, exercitado indiretamente pelos testes de integração |
| `src/main.tsx`, providers do React | Montagem da árvore, sem regra de negócio |
| `src/scripts/import-users.ts` | Ponto de entrada do comando. **É testado**, por subprocesso: cinco casos cobrem relatório, `--help`, arquivo inexistente, opção inválida e ausência de `DATABASE_URL`, verificando saída e código de retorno. O coletor v8 instrumenta apenas o processo principal e não consegue atribuir essa execução, então o arquivo apareceria como 0% mesmo estando coberto — o oposto do que a métrica deveria comunicar |

A exclusão é listada aqui de forma explícita: exclusão documentada é decisão de escopo,
exclusão silenciosa é maquiagem de métrica.

**Limite consciente da métrica.** Cobertura mede linha executada, não asserção feita —
um teste que renderiza sem verificar nada cobre 100% do arquivo e não detecta regressão
alguma. Esse atalho é o caminho de menor resistência quando testes são gerados por IA.
Por isso o threshold vale apenas onde há regra de negócio, e a revisão dos testes
verifica se cada um afirma comportamento observável, não apenas se o código rodou. O
percentual é evidência de que a verificação existe, não prova de que ela é boa.

## 9. Variáveis de ambiente

Todas validadas na inicialização; a aplicação falha imediatamente se algo faltar ou for
inválido, em vez de quebrar na primeira requisição.

| Variável | Onde | Descrição |
|---|---|---|
| `DATABASE_URL` | api | Conexão com o PostgreSQL |
| `PORT` | api | Porta HTTP |
| `WEATHER_API_KEY` | api | Chave da WeatherAPI. **Nunca versionada nem enviada ao navegador** |
| `WEATHER_CACHE_TTL_SECONDS` | api | TTL do cache, padrão 600 |
| `WEATHER_TIMEOUT_MS` | api | Timeout da chamada externa, padrão 5000 |
| `VITE_API_URL` | web | URL base da API |

`.env.example` versionado com as chaves e sem valores reais. `.env` está no `.gitignore`
desde o commit inicial, de modo que não existe ponto no histórico em que a chave vaze.

## 10. Comandos

Consolidados no README ao final; a forma pretendida é:

| Ação | Comando |
|---|---|
| Subir o banco | `docker compose up -d` |
| Aplicar migrations | `npm run db:migrate` (em `apps/api`) |
| Extrair o CSV | `tar -xzf data/users.csv.tgz -C data/` |
| Importar | `npm run import -- --file=../../data/users.csv --limit=500000` |
| Rodar a API | `npm run dev` (em `apps/api`) |
| Rodar o front | `npm run dev` (em `apps/web`) |
| Testes | `npm test` (em cada app) |
| Testes com cobertura | `npm run test:coverage` (em cada app) |

## 11. Convenções

### Idioma

| O quê | Idioma | Por quê |
|---|---|---|
| Identificadores de código — funções, variáveis, parâmetros, tipos, arquivos, propriedades CSS | **Inglês** | Alinha com as bibliotecas e com o próprio `users`/`email`/`created_at` do schema. Misturar idiomas na mesma expressão (`criarBanco(databaseUrl)`) piora a leitura |
| Campos do contrato da API e do banco | Inglês | Já definidos assim na §6 e §7 |
| Comentários e descrições de teste | Português | São prosa dirigida a quem lê e avalia o projeto |
| Mensagens de erro ao usuário | Português | A interface é em português (§12) |
| Mensagens de commit e documentação | Português | Mesma razão |

A regra prática: **o que o compilador lê é inglês; o que uma pessoa lê é português.**

### Demais convenções

- Commits em português, no formato `tipo: descrição`, com fase identificável
  (`spec:`, `plan:`, `tasks:`, `feat:`, `test:`, `docs:`, `chore:`, `refactor:`).
- Nenhum código é escrito sem uma tarefa correspondente em `tasks/todo.md`.
- Mudança de requisito atualiza primeiro a especificação ou o plano, em commit próprio,
  antes do código.
- Erros de domínio são tipados e traduzidos para HTTP em um único ponto.
- Sem `any` implícito; `strict` habilitado nos dois apps.

## 12. Limites e não-objetivos

- **Sem autenticação** — explicitamente fora de escopo.
- Sem deploy, Kubernetes, filas ou microsserviços.
- Cache apenas em memória; reiniciar a API esvazia o cache, o que é aceito.
- Sem internacionalização; a interface é em português.
- Sem soft delete: `DELETE` remove o registro.
- A importação não é incremental nem retomável; reprocessa o arquivo do início.

## 13. Critérios de sucesso

Verificáveis, um a um.

| # | Critério | Como verificar |
|---|---|---|
| S1 | Banco sobe e migrations aplicam em base vazia | `docker compose up -d && npm run db:migrate` sem erro |
| S2 | Importação é reproduzível | Duas execuções sobre o mesmo arquivo produzem o mesmo conjunto de usuários |
| S3 | Importação relata duplicados e inválidos | Saída do comando exibe lidos, importados, duplicados e rejeitados, e os números fecham |
| S4 | Email duplicado é rejeitado | Teste de integração recebe `409` no segundo `POST` com o mesmo email, inclusive com caixa diferente |
| S5 | Listagem filtra, ordena e pagina | Teste de integração cobre `search`, `sort`, `order`, `page`, `perPage` e confere `meta` |
| S6 | Id inexistente e id malformado têm respostas distintas | `404` e `400`, verificados por teste |
| S7 | Falha da API climática é tratada | Testes com origem simulada cobrem timeout, `404`, `429` e `5xx` |
| S8 | Chave da API não vaza | Ausente do repositório e de qualquer resposta HTTP; front nunca chama a origem diretamente |
| S9 | Cache expira e protege contra falha | Teste comprova reaproveitamento dentro do TTL e resposta `stale` quando a origem falha |
| S10 | Contrato documentado | Swagger responde e lista todos os endpoints |
| S11 | Filtros sobrevivem a recarga | Recarregar a URL da listagem preserva busca, ordenação e página |
| S12 | Busca não dispara por tecla | Debounce verificado; requisições obsoletas canceladas |
| S13 | Estados de carregamento, vazio e erro | Presentes nas telas de usuários e clima |
| S14 | Utilizável por teclado | Navegação e submissão de formulário sem mouse |
| S15 | Executável a partir do README | Setup limpo seguindo apenas o documento |
| S16 | Cobertura de 90% na regra de negócio | `npm run test:coverage` falha se `modules/**` ou o script de importação ficarem abaixo de 90% de linhas e branches |

## 14. Questões em aberto

| # | Questão | Encaminhamento |
|---|---|---|
| Q1 | A carga completa de 10M cabe no tempo de avaliação? | Medir a execução completa uma vez e publicar o número no README; o padrão continua 500k |
| Q2 | `COUNT` exato com filtro sobre 1,6M pode passar de 1s | Medir após a importação. Se inviável, registrar como limitação conhecida em vez de trocar a estratégia no fim |
| Q3 | Construção dos índices GIN após a carga completa pode ser demorada | Medir; criar os índices depois da importação, não antes |
| Q4 | Testcontainers no runner de CI | Validar cedo; se falhar, a CI roda com serviço de Postgres do próprio GitHub Actions |

---

*Histórico de mudanças desta spec é rastreável pelos commits com prefixo `spec:`.*
