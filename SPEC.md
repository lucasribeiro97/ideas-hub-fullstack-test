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
- **`COPY` em vez de `INSERT` linha a linha.** A ~1.000 inserções/s, 10M de linhas
  levariam horas; `COPY` reduz a carga a minutos.
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

Nenhuma resposta de erro expõe stack trace, SQL ou mensagem de driver.

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
| `BTREE (created_at DESC)` | Sustenta a ordenação padrão da listagem. |

O índice único é funcional e não simples porque a decisão P4 exige comparação sem caixa,
e normalizar o valor gravado faria o banco divergir do arquivo de origem.

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

Não há meta de cobertura percentual. A prioridade é cobrir regras que, se quebradas,
produzem dado incorreto.

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

## 11. Convenções

- Commits em português, no formato `tipo: descrição`, com fase identificável
  (`spec:`, `plan:`, `tasks:`, `feat:`, `test:`, `docs:`, `chore:`).
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

## 14. Questões em aberto

| # | Questão | Encaminhamento |
|---|---|---|
| Q1 | A carga completa de 10M cabe no tempo de avaliação? | Medir a execução completa uma vez e publicar o número no README; o padrão continua 500k |
| Q2 | `COUNT` exato com filtro sobre 1,6M pode passar de 1s | Medir após a importação. Se inviável, registrar como limitação conhecida em vez de trocar a estratégia no fim |
| Q3 | Construção dos índices GIN após a carga completa pode ser demorada | Medir; criar os índices depois da importação, não antes |
| Q4 | Testcontainers no runner de CI | Validar cedo; se falhar, a CI roda com serviço de Postgres do próprio GitHub Actions |

---

*Histórico de mudanças desta spec é rastreável pelos commits com prefixo `spec:`.*
