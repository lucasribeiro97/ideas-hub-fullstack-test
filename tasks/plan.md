# Plano técnico

Ordem de implementação, riscos e checkpoints de validação.
Deriva de [`../SPEC.md`](../SPEC.md) e [`../CAPABILITY_MAP.md`](../CAPABILITY_MAP.md).

## 1. Princípios que ordenam este plano

1. **Aplicação executável o quanto antes.** O enunciado diz que uma entrega incompleta
   mas executável vale mais que uma extensa e instável. A cada marco o projeto roda.
2. **Risco caro primeiro, volume caro depois.** Dependência externa (clima) e modelagem
   são resolvidas cedo; a carga de 10M linhas vem depois do schema estável, para não
   descobrir erro de modelagem após uma execução longa.
3. **Verificação junto da implementação.** Cada marco tem comando de verificação
   objetivo. Teste não é etapa final.
4. **Opcional só depois do obrigatório verde.** E2E é o último item e o primeiro corte.

Os tempos são relativos (H+0 = início da implementação), não horário de relógio. Somam
~13h de trabalho efetivo dentro da janela de 24h, deixando folga para imprevisto,
revisão e documentação.

## 2. Marcos

### M0 — Fundação · C1 · ~1h30

Esqueleto dos dois apps e infraestrutura de verificação.

- `docker-compose.yml` com PostgreSQL 16 e volume nomeado;
- `apps/api`: TypeScript strict, Fastify, pino com request-id, validação de env por Zod;
- `apps/web`: Vite + React + TypeScript strict;
- Vitest configurado nos dois apps, **já com os thresholds de cobertura da §8 da SPEC**;
- `.env.example` com as chaves e sem valores.

O request-id e os logs estruturados (C10) entram aqui, não no fim: no Fastify são
configuração, e adiar não economiza nada.

> **Checkpoint M0** — `docker compose up -d` sobe o banco; `npm run dev` responde em
> `/health`; `npm run test:coverage` executa e falha corretamente se o threshold não for
> atingido. Verifica o início de S1.

---

### M1 — Esquema e índices · C2 · ~1h

- schema `users` em Drizzle conforme §7 da SPEC;
- migration inicial com `CREATE EXTENSION pg_trgm`;
- índice único funcional em `lower(email)`;
- índices GIN trigram em `name` e `email`;
- índice btree em `created_at DESC`.

Índice funcional e GIN provavelmente não são gerados pelo `drizzle-kit` a partir do
schema — ver risco R1. A migration recebe o SQL desses índices escrito à mão.

> **Checkpoint M1** — migration aplica em base vazia; inserir o mesmo email com caixa
> diferente é rejeitado pelo banco; `\d users` no psql mostra os quatro índices.
> Fecha **S1**, prova a base de **S4**.

---

### M2 — API de usuários · C4 · ~3h

Núcleo do que é avaliado. Implementado endpoint a endpoint, com teste junto.

1. camada de erros de domínio e tradução única para HTTP (§6 da SPEC);
2. `POST /users` — inclui conflito de email;
3. `GET /users/:id` — inclui id inexistente e id malformado;
4. `GET /users` — busca, ordenação, paginação e metadados;
5. `PATCH /users/:id`;
6. `DELETE /users/:id`.

A listagem vem depois dos endpoints simples porque é a mais complexa e se beneficia do
ambiente de teste já estabelecido pelos anteriores.

> **Checkpoint M2** — suíte de integração verde contra Postgres real; cobertura de
> `modules/users` ≥ 90%. Fecha **S4**, **S5**, **S6**.

---

### M3 — Integração climática · C5 · ~2h

Independente de M1/M2. Posicionado antes da importação porque é a única dependência
externa e concentra risco fora do nosso controle.

1. cliente HTTP com timeout explícito;
2. tradução da resposta externa para o contrato próprio da §6;
3. cache em memória com TTL e política stale-if-error;
4. mapeamento de falhas: 404, 429, 5xx, timeout;
5. testes com a origem simulada por MSW — **a API real não é chamada em teste**.

> **Checkpoint M3** — os quatro modos de falha testados; reaproveitamento dentro do TTL
> comprovado; resposta expirada servida com `stale: true` quando a origem falha; a chave
> não aparece em nenhuma resposta. Fecha **S7**, **S8**, **S9**.

---

### M4 — Importação em massa · C3 · ~2h30

A etapa mais longa de executar e a de maior risco de performance.

1. parser em streaming com numeração de linha (necessária para o desempate P3 e para
   reportar a linha de registros rejeitados);
2. validação por registro, acumulando motivos de rejeição;
3. `COPY` para tabela de staging sem constraints;
4. `INSERT … SELECT DISTINCT ON (lower(email)) … ORDER BY lower(email), line_no
   ON CONFLICT DO NOTHING` — o `line_no` no `ORDER BY` é o que torna
   "primeira ocorrência vence" determinístico;
5. relatório final: lidos, importados, descartados por duplicidade, rejeitados;
6. flag `--limit`, padrão 500.000, `0` para o arquivo completo.

Ordem de execução deliberada: **importar antes de construir os índices GIN**. Manter
índice trigram atualizado durante a carga é muito mais caro que construí-lo uma vez ao
final.

> **Checkpoint M4** — CSV pequeno com duplicatas e defeitos propositais produz o
> relatório esperado; duas execuções sobre o mesmo arquivo geram o mesmo conjunto;
> carga de 500k medida. Fecha **S2**, **S3**.

---

### M5 — Frontend: usuários · C7 · ~3h

1. cliente da API e tipos do contrato;
2. layout base, rotas e navegação;
3. listagem com busca, ordenação e paginação — filtros em `useSearchParams`;
4. debounce na busca e cancelamento de requisição obsoleta;
5. estados de carregamento, lista vazia e erro;
6. formulário de cadastro e edição com validação e mensagens claras;
7. detalhe com editar e excluir;
8. passagem de acessibilidade: foco visível, navegação e submissão por teclado, rótulos.

A URL como fonte de verdade dos filtros é decidida no item 3 e não retrofitada depois —
mudar isso mais tarde exigiria reescrever o estado da tela.

> **Checkpoint M5** — recarregar a URL preserva busca, ordenação e página; a busca não
> dispara por tecla; fluxo completo utilizável só com teclado; teste de fluxo do
> frontend verde. Fecha **S11**, **S12**, **S13**, **S14**.

---

### M6 — Frontend: clima · C8 · ~1h30

Tela de busca por cidade, exibição de temperatura, umidade e condição, e gráfico Recharts
da série horária. Estados distintos para cidade inexistente e falha do serviço.

> **Checkpoint M6** — cidade válida renderiza o gráfico; cidade inexistente e origem
> indisponível produzem mensagens diferentes e compreensíveis.

---

### M7 — Contrato e documentação · C6 · ~1h30

- OpenAPI derivada dos schemas de validação, servida pelo Swagger UI;
- `README.md` completo: pré-requisitos, variáveis, migrations, extração do `.tgz`,
  importação, execução, testes, decisões, trade-offs e limitações;
- `AI_USAGE.md` com as seções por fase, exemplos, correções e a matriz de rastreabilidade.

O README é escrito ao final de propósito: descreve o que existe, não o que se pretendia.

> **Checkpoint M7** — setup do zero seguindo apenas o README, em diretório limpo.
> Fecha **S10**, **S15**.

---

### M8 — Opcionais · C11, C12 · ~2h, condicional

Nesta ordem, cada um só se o anterior estiver pronto e o obrigatório verde:

1. **Medição da carga completa** — executar os 10M uma vez, registrar tempo, linhas/s e
   memória no README. Já decidido; é o diferencial de menor custo marginal.
2. **CI no GitHub Actions** — lint, typecheck, testes e cobertura por push.
3. **E2E com Playwright** — um fluxo crítico ponta a ponta.

> **Checkpoint M8** — badge de CI verde no repositório; número da carga completa
> publicado no README.

## 3. Riscos

| # | Risco | Prob. | Impacto | Mitigação | Detectado em |
|---|---|---|---|---|---|
| R1 | `drizzle-kit` não gerar índice funcional nem GIN a partir do schema | Alta | Baixo | Escrever o SQL desses índices à mão na migration; validar com `\d users` | M1 |
| R2 | Índices GIN demorarem muito para construir sobre 1,6M linhas | Média | Médio | Construir após a importação, nunca durante; medir e registrar (Q3) | M4 |
| R3 | `COUNT` exato com filtro passar de 1s | Média | Médio | Medir após a carga. Se inviável, registrar como limitação conhecida — **não** trocar a estratégia de paginação no fim do prazo | M4 |
| R4 | Testcontainers lento ou instável | Média | Médio | Reaproveitar um container por suíte em vez de um por arquivo; em CI, cair para serviço Postgres do runner (Q4) | M0 |
| R5 | Carga completa estourar memória ou disco | Baixa | Alto | Streaming do início; validar com 500k antes de tentar 10M; `COPY` não acumula em memória | M4 |
| R6 | Rate limit da WeatherAPI durante o desenvolvimento | Baixa | Baixo | Testes nunca chamam a API real; cache de 10min reduz chamadas manuais | M3 |
| R7 | Threshold de 90% empurrar para testes rasos | Média | Médio | Gate restrito a `modules/**` e importação; revisar se cada teste afirma comportamento, não só executa linha | M2 |
| R8 | Prazo de 24h apertar | Média | Alto | Ordem de corte explícita na §5; marcos entregam software executável a cada passo | Contínuo |

R3 merece destaque: a tentação natural ao descobrir lentidão seria migrar para keyset
pagination. **Isso não será feito dentro do prazo.** Trocar a estratégia de paginação no
fim quebra o contrato já documentado, a UI e os testes. A limitação medida é registrada.

## 4. Checkpoints de validação

Nenhum marco é considerado concluído sem o comando correspondente passando.

| Marco | Comando de verificação | Critérios fechados |
|---|---|---|
| M0 | `docker compose up -d` · `npm run test:coverage` | início de S1 |
| M1 | `npm run db:migrate` em base vazia · `\d users` | S1 |
| M2 | `npm test` em `apps/api` | S4, S5, S6 |
| M3 | `npm test` em `apps/api` | S7, S8, S9 |
| M4 | `npm run import -- --file=fixture.csv` · reexecução | S2, S3 |
| M5 | `npm test` em `apps/web` · verificação manual de teclado | S11–S14 |
| M6 | verificação manual das três situações da tela | — |
| M7 | setup do zero em diretório limpo seguindo o README | S10, S15 |
| M8 | pipeline de CI verde | — |
| Global | `npm run test:coverage` nos dois apps | S16 |

## 5. Ordem de corte

Se o prazo apertar, o corte segue esta ordem, sempre **documentando no README o que
ficou de fora e como seria concluído** — o enunciado avalia a comunicação do trade-off:

1. E2E com Playwright (C12);
2. Pipeline de CI (C11);
3. Medição da carga completa de 10M — mantendo a importação de 500k funcional;
4. Polimento visual do frontend.

**Nunca cortados**, por serem escopo obrigatório: CRUD completo, listagem com busca e
paginação, integração climática com tratamento de falha, importação reproduzível, os
quatro cenários de teste exigidos e o README executável.

## 6. Rastreabilidade

A tabela requisito → tarefa → commit → verificação é mantida em
[`todo.md`](./todo.md) durante a execução e consolidada no `AI_USAGE.md` ao final.
