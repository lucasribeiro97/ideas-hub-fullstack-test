# Tarefas

Decomposição de [`plan.md`](./plan.md) em unidades concluíveis e verificáveis.
Cada tarefa referencia os critérios de sucesso de [`../SPEC.md`](../SPEC.md) §13.

**Estado:** ⬜ pendente · 🟡 em andamento · ✅ concluída · ⛔ cortada

Nenhum código é escrito sem uma tarefa correspondente aqui. Se durante a implementação
surgir necessidade não prevista, a tarefa é criada antes do código, e mudança de
requisito atualiza a SPEC ou o plano primeiro.

---

## M0 — Fundação

### TASK-INFRA-01 — PostgreSQL via docker compose
- **Estado:** ✅
- **Aceite:** `docker-compose.yml` sobe PostgreSQL 16 com volume nomeado, porta e
  credenciais vindas de variáveis com padrão de desenvolvimento.
- **Verificação:** `docker compose up -d` seguido de `docker compose ps` mostra o
  serviço saudável; `psql` conecta.
- **Critérios:** S1 · **Commit:** `6449c27`

### TASK-INFRA-02 — Esqueleto da API
- **Estado:** ✅
- **Aceite:** `apps/api` com TypeScript `strict`, Fastify, rota `/health` respondendo
  `200`, scripts `dev`, `build`, `typecheck` e `lint`.
- **Verificação:** `npm run dev` e `curl localhost:3000/health`; `npm run typecheck` limpo.
- **Critérios:** S1 · **Commit:** `6449c27`

### TASK-INFRA-03 — Validação de variáveis de ambiente
- **Estado:** ✅
- **Aceite:** schema Zod cobrindo as variáveis da §9 da SPEC; a aplicação encerra com
  mensagem clara na inicialização se algo faltar ou for inválido, em vez de falhar na
  primeira requisição. Nenhum `process.env` acessado fora desse módulo.
- **Verificação:** subir sem `WEATHER_API_KEY` produz erro explícito e código de saída
  diferente de zero.
- **Critérios:** S8 · **Commit:** `6449c27`

### TASK-INFRA-04 — Logs estruturados com request-id
- **Estado:** ✅
- **Aceite:** pino configurado; toda requisição loga com identificador correlacionando
  entrada e saída; o identificador volta em cabeçalho de resposta. Nenhum log inclui a
  chave da API de clima.
- **Verificação:** duas requisições concorrentes produzem identificadores distintos e
  rastreáveis na saída.
- **Critérios:** S8 · **Commit:** `6449c27`

### TASK-INFRA-05 — Esqueleto do frontend
- **Estado:** ✅
- **Aceite:** `apps/web` com Vite, React, TypeScript `strict`, React Router e TanStack
  Query instalados e montados; tela inicial renderiza.
- **Verificação:** `npm run dev` serve a aplicação; `npm run typecheck` limpo.
- **Critérios:** — · **Commit:** `6449c27`

### TASK-INFRA-06 — Vitest e thresholds de cobertura
- **Estado:** ✅
- **Aceite:** Vitest nos dois apps com script `test` e `test:coverage`. Thresholds
  conforme §8 da SPEC: 90% de linhas e branches em `modules/**` e no script de
  importação; global medido sem gate; exclusões aplicadas exatamente como listadas.
- **Verificação:** `npm run test:coverage` executa e **falha** se um arquivo de
  `modules/` for adicionado sem teste — verificado propositalmente uma vez.
- **Critérios:** S16 · **Commit:** `6449c27`

### TASK-INFRA-07 — `.env.example` e higiene de segredos
- **Estado:** ✅
- **Aceite:** `.env.example` com todas as chaves e nenhum valor real; `.env` ignorado
  desde o commit inicial.
- **Verificação:** `git log -p -- .env` vazio; `git check-ignore -v .env` confirma.
- **Critérios:** S8 · **Commit:** `6449c27`

---

## M1 — Esquema e índices

### TASK-DB-01 — Schema `users` e migration inicial
- **Estado:** ✅
- **Aceite:** tabela conforme §7 da SPEC, com `phone` nulável e timestamps com timezone.
- **Verificação:** migration aplica em base vazia sem erro.
- **Critérios:** S1 · **Commit:** `4e80b2f`

### TASK-DB-02 — Unicidade de email sem distinção de caixa
- **Estado:** ✅
- **Aceite:** índice único funcional em `lower(email)`. SQL escrito à mão na migration
  se o `drizzle-kit` não gerar (risco R1). O valor gravado preserva a caixa da origem.
- **Verificação:** inserir `a@x.com` e depois `A@X.com` é rejeitado pelo banco;
  `\d users` mostra o índice funcional.
- **Critérios:** S4 · **Commit:** `4e80b2f`

### TASK-DB-03 — Índices de busca e ordenação
- **Estado:** ✅
- **Aceite:** `CREATE EXTENSION pg_trgm`; índices GIN trigram em `name` e `email`;
  btree em `created_at DESC`.
- **Verificação:** `EXPLAIN` de um `ILIKE '%termo%'` usa o índice GIN e não varredura
  sequencial. **Parcial:** com `enable_seqscan=off` o plano usa `Bitmap Index Scan` nos
  dois índices GIN, provando que são utilizáveis. A escolha espontânea do planner só é
  verificável com volume, no M4.
- **Critérios:** S5 · **Commit:** `4e80b2f`

---

## M2 — API de usuários

### TASK-API-01 — Ambiente de teste de integração
- **Estado:** ✅
- **Aceite:** Testcontainers sobe Postgres efêmero, aplica migrations e oferece limpeza
  entre casos. Um container por suíte, não por arquivo (risco R4).
- **Verificação:** suíte de exemplo conecta, cria e lê um registro.
- **Critérios:** S4 · **Commit:** `abd8535`

### TASK-API-02 — Erros de domínio e tradução para HTTP
- **Estado:** ✅
- **Aceite:** erros tipados traduzidos para HTTP em um único ponto, no formato da §6.
  Nenhuma resposta expõe stack trace, SQL ou mensagem de driver.
- **Verificação:** teste força erro de banco e confirma que o corpo da resposta não
  contém texto do driver.
- **Critérios:** S6 · **Commit:** `968f5b0`

### TASK-API-03 — `POST /users`
- **Estado:** ✅
- **Aceite:** `201` com o usuário criado; `409` para email já existente, inclusive com
  caixa diferente; `422` para corpo inválido. `phone` opcional.
- **Verificação:** testes de integração dos três casos.
- **Critérios:** S4 · **Commit:** `28f5fa7`

### TASK-API-04 — `GET /users/:id`
- **Estado:** ⬜
- **Aceite:** `200` para existente, `404` para inexistente, `400` para id que não é UUID.
- **Verificação:** testes dos três casos. `404` e `400` precisam ser distinguíveis.
- **Critérios:** S6 · **Commit:** —

### TASK-API-05 — `GET /users` com busca, ordenação e paginação
- **Estado:** ⬜
- **Aceite:** parâmetros e resposta exatamente como a §6 da SPEC. `search` casa parcial
  e sem distinção de caixa em `name` **ou** `email`. `perPage` limitado a 100. `meta`
  com `page`, `perPage`, `total` e `totalPages`.
- **Verificação:** testes cobrindo busca por trecho do meio da palavra, ordenação nos
  dois sentidos, página além do fim devolvendo lista vazia com `meta` coerente, e
  `perPage` acima do limite sendo rejeitado.
- **Critérios:** S5 · **Commit:** —

### TASK-API-06 — `PATCH /users/:id`
- **Estado:** ⬜
- **Aceite:** atualização parcial; `404` para inexistente; `409` ao trocar para email já
  usado por outro usuário; atualizar para o próprio email **não** conflita;
  `updated_at` muda.
- **Verificação:** testes dos quatro casos, incluindo o de não conflitar consigo mesmo.
- **Critérios:** S4, S6 · **Commit:** —

### TASK-API-07 — `DELETE /users/:id`
- **Estado:** ⬜
- **Aceite:** `204` ao remover, `404` para inexistente. Remoção definitiva, sem soft delete.
- **Verificação:** testes dos dois casos; busca posterior devolve `404`.
- **Critérios:** S6 · **Commit:** —

---

## M3 — Integração climática

### TASK-WEATHER-01 — Cliente da WeatherAPI
- **Estado:** ⬜
- **Aceite:** chamada única ao endpoint de forecast com timeout explícito; resposta
  convertida para o contrato próprio da §6, sem vazar a forma da API externa.
- **Verificação:** teste com resposta simulada confirma o formato traduzido.
- **Critérios:** S7 · **Commit:** —

### TASK-WEATHER-02 — Cache com TTL e `stale-if-error`
- **Estado:** ⬜
- **Aceite:** mapa em memória por cidade normalizada, TTL configurável com padrão de
  10 minutos. Falha da origem com entrada expirada em mãos devolve o dado antigo com
  `stale: true` em vez de erro.
- **Verificação:** teste comprova reaproveitamento dentro do TTL (uma chamada à origem),
  expiração após o TTL e resposta `stale` quando a origem falha.
- **Critérios:** S9 · **Commit:** —

### TASK-WEATHER-03 — Tratamento das falhas externas
- **Estado:** ⬜
- **Aceite:** mapeamento conforme §6: `404` cidade inexistente, `504` timeout, `429`
  rate limit, `502` indisponibilidade. A chave nunca aparece em resposta nem em log.
- **Verificação:** testes com MSW para os quatro modos. **A API real não é chamada em
  teste algum.**
- **Critérios:** S7, S8 · **Commit:** —

### TASK-WEATHER-04 — Rota `GET /weather/:city`
- **Estado:** ⬜
- **Aceite:** rota validando o parâmetro e compondo cliente, cache e tradução de erro.
- **Verificação:** requisição real a uma cidade válida devolve o contrato completo com
  série horária não vazia.
- **Critérios:** S7 · **Commit:** —

---

## M4 — Importação em massa

### TASK-IMPORT-01 — Parser em streaming com numeração de linha
- **Estado:** ⬜
- **Aceite:** leitura em streaming sem carregar o arquivo em memória; cada registro
  carrega seu número de linha; validação por registro acumulando motivo de rejeição.
- **Verificação:** importar um arquivo grande mantém uso de memória estável — observado
  durante a execução de 500k.
- **Critérios:** S3 · **Commit:** —

### TASK-IMPORT-02 — Carga para tabela de staging via `COPY`
- **Estado:** ⬜
- **Aceite:** staging sem constraints recebendo os registros válidos por `COPY`,
  incluindo o número de linha.
- **Verificação:** contagem na staging bate com o número de registros válidos lidos.
- **Critérios:** S2 · **Commit:** —

### TASK-IMPORT-03 — Deduplicação determinística
- **Estado:** ⬜
- **Aceite:** `INSERT … SELECT DISTINCT ON (lower(email)) … ORDER BY lower(email),
  line_no ON CONFLICT DO NOTHING`. Vence a primeira ocorrência no arquivo (premissa P3).
  Reexecutar não duplica nem altera o resultado.
- **Verificação:** fixture com o mesmo email em três linhas e nomes diferentes importa
  o nome da **primeira**; segunda execução não altera contagem nem conteúdo.
- **Critérios:** S2 · **Commit:** —

### TASK-IMPORT-04 — Relatório e flag `--limit`
- **Estado:** ⬜
- **Aceite:** saída com lidos, importados, descartados por duplicidade e rejeitados por
  invalidez, com os números fechando. `--limit` com padrão 500.000 e `0` para o arquivo
  completo. Rejeitados identificados pelo número da linha.
- **Verificação:** `lidos == importados + duplicados + rejeitados` em fixture e na carga
  de 500k.
- **Critérios:** S3 · **Commit:** —

### TASK-IMPORT-05 — Testes da importação
- **Estado:** ⬜
- **Aceite:** fixture pequena com duplicatas e defeitos propositais — email vazio,
  formato inválido, coluna faltando, UUID inválido. O dataset real não exercita esses
  caminhos (SPEC §3), então são cobertos aqui.
- **Verificação:** `npm test -- import` verde; cobertura do script ≥ 90%.
- **Critérios:** S2, S3, S16 · **Commit:** —

---

## M5 — Frontend: usuários

### TASK-WEB-01 — Cliente da API e tipos do contrato
- **Estado:** ⬜
- **Aceite:** módulo único de acesso à API com tipos correspondentes ao contrato da §6
  e tratamento uniforme de erro.
- **Verificação:** `npm run typecheck` limpo.
- **Critérios:** — · **Commit:** —

### TASK-WEB-02 — Layout, rotas e navegação
- **Estado:** ⬜
- **Aceite:** rotas navegáveis para listagem, detalhe, cadastro, edição e clima.
  Navegação por URL direta funciona em todas.
- **Verificação:** abrir cada rota diretamente no navegador renderiza a tela correta.
- **Critérios:** S11 · **Commit:** —

### TASK-WEB-03 — Listagem com filtros na URL
- **Estado:** ⬜
- **Aceite:** busca, ordenação, página e itens por página vivem em `useSearchParams` e
  são a fonte de verdade da tela. Recarregar ou compartilhar a URL preserva o contexto.
- **Verificação:** aplicar filtros, copiar a URL, abrir em aba nova e obter o mesmo
  resultado.
- **Critérios:** S11 · **Commit:** —

### TASK-WEB-04 — Debounce e cancelamento de requisições obsoletas
- **Estado:** ⬜
- **Aceite:** digitar não dispara uma requisição por tecla; respostas de buscas
  superadas não sobrescrevem o resultado atual.
- **Verificação:** digitar rapidamente e observar na aba de rede que as requisições
  intermediárias foram canceladas e a última vence.
- **Critérios:** S12 · **Commit:** —

### TASK-WEB-05 — Estados de carregamento, vazio e erro
- **Estado:** ⬜
- **Aceite:** os três estados presentes e visualmente distintos na listagem. Lista vazia
  por filtro diz algo diferente de lista vazia por base sem dados.
- **Verificação:** provocar cada estado manualmente, inclusive derrubando a API.
- **Critérios:** S13 · **Commit:** —

### TASK-WEB-06 — Formulário de cadastro e edição
- **Estado:** ⬜
- **Aceite:** validação no cliente antes do envio; erro `409` do servidor exibido no
  campo de email, não como mensagem genérica; envio bloqueado durante a requisição.
- **Verificação:** tentar cadastrar email existente mostra a mensagem no campo correto.
- **Critérios:** S13 · **Commit:** —

### TASK-WEB-07 — Tela de detalhe com editar e excluir
- **Estado:** ⬜
- **Aceite:** exibe todos os campos incluindo `phone`; excluir pede confirmação em
  elemento da própria interface — **não** `window.confirm` — e redireciona para a
  listagem preservando os filtros anteriores.
- **Verificação:** excluir a partir de uma listagem filtrada retorna à mesma listagem
  filtrada.
- **Critérios:** S11, S13 · **Commit:** —

### TASK-WEB-08 — Acessibilidade e responsividade
- **Estado:** ⬜
- **Aceite:** fluxo completo operável por teclado com foco visível; campos com rótulo
  associado; erros anunciáveis por leitor de tela; layout utilizável em largura de
  telefone.
- **Verificação:** percorrer cadastro, busca, edição e exclusão sem tocar no mouse;
  inspecionar em viewport estreito.
- **Critérios:** S14 · **Commit:** —

### TASK-WEB-09 — Teste de fluxo do frontend
- **Estado:** ⬜
- **Aceite:** teste com Testing Library e MSW cobrindo buscar, paginar e abrir um
  usuário, afirmando comportamento observável — não apenas que renderizou.
- **Verificação:** `npm test` em `apps/web` verde.
- **Critérios:** S5, S13 · **Commit:** —

---

## M6 — Frontend: clima

### TASK-WEB-10 — Tela de clima
- **Estado:** ⬜
- **Aceite:** busca por cidade exibindo temperatura, umidade e condição atual. Cidade
  inexistente e falha do serviço produzem mensagens distintas. Dado servido de cache
  expirado é sinalizado ao usuário.
- **Verificação:** testar cidade válida, cidade inventada e API indisponível.
- **Critérios:** S13 · **Commit:** —

### TASK-WEB-11 — Gráfico de variação de temperatura
- **Estado:** ⬜
- **Aceite:** gráfico Recharts da série horária, com eixos rotulados e responsivo.
- **Verificação:** renderiza para uma cidade válida e se adapta a viewport estreito.
- **Critérios:** — · **Commit:** —

---

## M7 — Contrato e documentação

### TASK-DOC-01 — OpenAPI e Swagger UI
- **Estado:** ⬜
- **Aceite:** documentação derivada dos schemas de validação, cobrindo todos os
  endpoints com exemplos e códigos de erro.
- **Verificação:** a UI lista os seis endpoints e um exemplo executado responde
  corretamente.
- **Critérios:** S10 · **Commit:** —

### TASK-DOC-02 — README completo
- **Estado:** ⬜
- **Aceite:** pré-requisitos, variáveis sem valores secretos, migrations, **extração do
  `.tgz` com `tar -xzf`** (premissa P1), importação, execução, testes, decisões
  técnicas, trade-offs, limitações e link para `AI_USAGE.md`.
- **Verificação:** setup do zero em diretório limpo seguindo apenas o documento.
- **Critérios:** S15 · **Commit:** —

### TASK-DOC-03 — `AI_USAGE.md`
- **Estado:** ⬜
- **Aceite:** ferramentas e modelos; recursos equivalentes a skills usados; seção por
  fase; exemplos de instruções com resumo da resposta; ao menos uma sugestão corrigida
  ou rejeitada; ao menos uma mudança de spec anterior ao código; matriz de
  rastreabilidade; como o código foi validado; limitações percebidas.
- **Verificação:** cada item do enunciado conferido um a um contra o arquivo.
- **Critérios:** — · **Commit:** —

---

## M8 — Opcionais *(condicionais, nesta ordem)*

### TASK-OPT-01 — Medição da carga completa
- **Estado:** ⬜
- **Aceite:** executar os 10M uma vez com `--limit=0`, registrando tempo total,
  linhas/segundo, memória e tempo de construção dos índices GIN. Publicado no README.
- **Verificação:** números reais da execução, não estimativa.
- **Critérios:** — · **Commit:** —

### TASK-OPT-02 — Pipeline de CI
- **Estado:** ⬜
- **Aceite:** GitHub Actions com lint, typecheck, testes e cobertura por push. Se
  Testcontainers não funcionar no runner, cair para serviço Postgres do próprio Actions
  (risco R4, questão Q4).
- **Verificação:** execução verde visível no repositório.
- **Critérios:** — · **Commit:** —

### TASK-OPT-03 — Teste ponta a ponta
- **Estado:** ⬜
- **Aceite:** Playwright cobrindo um fluxo crítico: buscar usuário, editar e confirmar
  a alteração na listagem.
- **Verificação:** `npx playwright test` verde com banco, API e frontend reais.
- **Critérios:** — · **Commit:** —
- **Nota:** primeiro item da ordem de corte do plano §5.

---

## Rastreabilidade — critérios × tarefas

Os commits são preenchidos conforme cada tarefa é concluída.

| Critério | Tarefas | Commit | Verificação |
|---|---|---|---|
| S1 Banco e migrations | TASK-INFRA-01, TASK-INFRA-02, TASK-DB-01 | `6449c27`, `4e80b2f` | migration em base vazia + reexecução |
| S2 Importação reproduzível | TASK-IMPORT-02, TASK-IMPORT-03, TASK-IMPORT-05 | — | dupla execução idêntica |
| S3 Relatório de import | TASK-IMPORT-01, TASK-IMPORT-04, TASK-IMPORT-05 | — | os números fecham |
| S4 Email duplicado rejeitado | TASK-DB-02, TASK-API-03, TASK-API-06 | `4e80b2f`, `28f5fa7` | 409 na API, inclusive em caixa diferente |
| S5 Filtro, ordenação, paginação | TASK-DB-03, TASK-API-05, TASK-WEB-09 | `4e80b2f` (parcial) | GIN utilizável via EXPLAIN; falta API |
| S6 `404` vs `400` | TASK-API-02, TASK-API-04, TASK-API-07 | `968f5b0` (parcial) | 400/422/404/500 provados; faltam rotas reais |
| S7 Falha da API climática | TASK-WEATHER-01, TASK-WEATHER-03, TASK-WEATHER-04 | — | testes com MSW |
| S8 Chave não vaza | TASK-INFRA-03, TASK-INFRA-04, TASK-INFRA-07, TASK-WEATHER-03 | `6449c27` (parcial) | redact testado; falta M3 |
| S9 Cache expira e protege | TASK-WEATHER-02 | — | teste de TTL e stale |
| S10 Contrato documentado | TASK-DOC-01 | — | Swagger responde |
| S11 Filtros na URL | TASK-WEB-02, TASK-WEB-03, TASK-WEB-07 | — | recarga preserva contexto |
| S12 Busca sem disparo por tecla | TASK-WEB-04 | — | inspeção da aba de rede |
| S13 Carregando, vazio, erro | TASK-WEB-05, TASK-WEB-06, TASK-WEB-10 | — | provocação manual |
| S14 Utilizável por teclado | TASK-WEB-08 | — | percurso sem mouse |
| S15 Executável pelo README | TASK-DOC-02 | — | setup em diretório limpo |
| S16 Cobertura ≥ 90% no domínio | TASK-INFRA-06, TASK-IMPORT-05 | `6449c27` | gate provado falhando: exit 1 |
