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
- **Verificação:** ✅ **Completa.** Com 220.875 registros reais importados, o planner
  escolhe `Bitmap Index Scan` nos dois índices GIN **espontaneamente**, sem
  `enable_seqscan=off`. Verificado em `f23e16b`.
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
- **Estado:** ✅
- **Aceite:** `200` para existente, `404` para inexistente, `400` para id que não é UUID.
- **Verificação:** testes dos três casos. `404` e `400` precisam ser distinguíveis.
- **Critérios:** S6 · **Commit:** `d20c4f5`

### TASK-API-05 — `GET /users` com busca, ordenação e paginação
- **Estado:** ✅
- **Aceite:** parâmetros e resposta exatamente como a §6 da SPEC. `search` casa parcial
  e sem distinção de caixa em `name` **ou** `email`. `perPage` limitado a 100. `meta`
  com `page`, `perPage`, `total` e `totalPages`.
- **Verificação:** testes cobrindo busca por trecho do meio da palavra, ordenação nos
  dois sentidos, página além do fim devolvendo lista vazia com `meta` coerente, e
  `perPage` acima do limite sendo rejeitado.
- **Critérios:** S5 · **Commit:** `761017d`

### TASK-API-06 — `PATCH /users/:id`
- **Estado:** ✅
- **Aceite:** atualização parcial; `404` para inexistente; `409` ao trocar para email já
  usado por outro usuário; atualizar para o próprio email **não** conflita;
  `updated_at` muda.
- **Verificação:** testes dos quatro casos, incluindo o de não conflitar consigo mesmo.
- **Critérios:** S4, S6 · **Commit:** `bcf8bf8`

### TASK-API-07 — `DELETE /users/:id`
- **Estado:** ✅
- **Aceite:** `204` ao remover, `404` para inexistente. Remoção definitiva, sem soft delete.
- **Verificação:** testes dos dois casos; busca posterior devolve `404`.
- **Critérios:** S6 · **Commit:** `b05d640`

---

## M3 — Integração climática

### TASK-WEATHER-01 — Cliente da WeatherAPI
- **Estado:** ✅
- **Aceite:** chamada única ao endpoint de forecast com timeout explícito; resposta
  convertida para o contrato próprio da §6, sem vazar a forma da API externa.
- **Verificação:** teste com resposta simulada confirma o formato traduzido.
- **Critérios:** S7 · **Commit:** `1cd6440`

### TASK-WEATHER-02 — Cache com TTL e `stale-if-error`
- **Estado:** ✅
- **Aceite:** mapa em memória por cidade normalizada, TTL configurável com padrão de
  10 minutos. Falha da origem com entrada expirada em mãos devolve o dado antigo com
  `stale: true` em vez de erro.
- **Verificação:** teste comprova reaproveitamento dentro do TTL (uma chamada à origem),
  expiração após o TTL e resposta `stale` quando a origem falha.
- **Critérios:** S9 · **Commit:** `958a3ed`

> **Ordem invertida com a TASK-WEATHER-04.** O aceite desta tarefa exige provar que
> `404`, `504`, `429` e `502` chegam intactos ao cliente HTTP, o que só é verificável
> através da rota. Testar o mapeamento sem ela verificaria apenas o `httpStatus` das
> classes de erro, evidência mais fraca do que a tarefa pede. A rota é implementada
> primeiro; nenhuma das duas sai do escopo.

### TASK-WEATHER-03 — Tratamento das falhas externas
- **Estado:** ✅
- **Aceite:** mapeamento conforme §6: `404` cidade inexistente, `504` timeout, `429`
  rate limit, `502` indisponibilidade. A chave nunca aparece em resposta nem em log.
- **Verificação:** testes com MSW para os quatro modos. **A API real não é chamada em
  teste algum.**
- **Critérios:** S7, S8 · **Commit:** `82e54ad`

### TASK-WEATHER-04 — Rota `GET /weather/:city`
- **Estado:** ✅
- **Aceite:** rota validando o parâmetro e compondo cliente, cache e tradução de erro.
- **Verificação:** requisição real a uma cidade válida devolve o contrato completo com
  série horária não vazia.
- **Critérios:** S7 · **Commit:** `82e54ad`

---

## M4 — Importação em massa

### TASK-IMPORT-01 — Parser em streaming com numeração de linha
- **Estado:** ✅
- **Aceite:** leitura em streaming sem carregar o arquivo em memória; cada registro
  carrega seu número de linha; validação por registro acumulando motivo de rejeição.
- **Verificação:** importar um arquivo grande mantém uso de memória estável — observado
  durante a execução de 500k.
- **Critérios:** S3 · **Commit:** `43fa84a`

### TASK-IMPORT-02 — Carga para tabela de staging via `COPY`
- **Estado:** ✅
- **Aceite:** staging sem constraints recebendo os registros válidos por `COPY`,
  incluindo o número de linha.
- **Verificação:** contagem na staging bate com o número de registros válidos lidos.
- **Critérios:** S2 · **Commit:** `cba066d`

### TASK-IMPORT-03 — Deduplicação determinística
- **Estado:** ✅
- **Aceite:** `INSERT … SELECT DISTINCT ON (lower(email)) … ORDER BY lower(email),
  line_no ON CONFLICT DO NOTHING`. Vence a primeira ocorrência no arquivo (premissa P3).
  Reexecutar não duplica nem altera o resultado.
- **Verificação:** fixture com o mesmo email em três linhas e nomes diferentes importa
  o nome da **primeira**; segunda execução não altera contagem nem conteúdo.
- **Critérios:** S2 · **Commit:** `f23e16b`

### TASK-IMPORT-04 — Relatório e flag `--limit`
- **Estado:** ✅
- **Aceite:** saída com lidos, importados, descartados por duplicidade e rejeitados por
  invalidez, com os números fechando. `--limit` com padrão 500.000 e `0` para o arquivo
  completo. Rejeitados identificados pelo número da linha.
- **Verificação:** `lidos == importados + duplicados + rejeitados` em fixture e na carga
  de 500k.
- **Critérios:** S3 · **Commit:** `a0bc095`

### TASK-IMPORT-05 — Testes da importação
- **Estado:** ✅
- **Aceite:** fixture pequena com duplicatas e defeitos propositais — email vazio,
  formato inválido, coluna faltando, UUID inválido. O dataset real não exercita esses
  caminhos (SPEC §3), então são cobertos aqui.
- **Verificação:** `npm test -- import` verde; cobertura do script ≥ 90%.
- **Critérios:** S2, S3, S16 · **Commit:** `a0bc095`

---

## M5 — Frontend: usuários

### TASK-WEB-01 — Cliente da API e tipos do contrato
- **Estado:** ✅
- **Aceite:** módulo único de acesso à API com tipos correspondentes ao contrato da §6
  e tratamento uniforme de erro.
- **Verificação:** `npm run typecheck` limpo.
- **Critérios:** — · **Commit:** `ed57616`

### TASK-WEB-02 — Layout, rotas e navegação
- **Estado:** ✅
- **Aceite:** rotas navegáveis para listagem, detalhe, cadastro, edição e clima.
  Navegação por URL direta funciona em todas.
- **Verificação:** abrir cada rota diretamente no navegador renderiza a tela correta.
- **Critérios:** S11 · **Commit:** `07de471`

### TASK-WEB-03 — Listagem com filtros na URL
- **Estado:** ✅
- **Aceite:** busca, ordenação, página e itens por página vivem em `useSearchParams` e
  são a fonte de verdade da tela. Recarregar ou compartilhar a URL preserva o contexto.
- **Verificação:** aplicar filtros, copiar a URL, abrir em aba nova e obter o mesmo
  resultado.
- **Critérios:** S11 · **Commit:** `8c3d710`

### TASK-WEB-04 — Debounce e cancelamento de requisições obsoletas
- **Estado:** ✅
- **Aceite:** digitar não dispara uma requisição por tecla; respostas de buscas
  superadas não sobrescrevem o resultado atual.
- **Verificação:** digitar rapidamente e observar na aba de rede que as requisições
  intermediárias foram canceladas e a última vence.
- **Critérios:** S12 · **Commit:** `6266f2f`

### TASK-WEB-05 — Estados de carregamento, vazio e erro
- **Estado:** ✅
- **Aceite:** os três estados presentes e visualmente distintos na listagem. Lista vazia
  por filtro diz algo diferente de lista vazia por base sem dados.
- **Verificação:** provocar cada estado manualmente, inclusive derrubando a API.
- **Critérios:** S13 · **Commit:** `2a454d1`

### TASK-WEB-06 — Formulário de cadastro e edição
- **Estado:** ✅
- **Aceite:** validação no cliente antes do envio; erro `409` do servidor exibido no
  campo de email, não como mensagem genérica; envio bloqueado durante a requisição.
- **Verificação:** tentar cadastrar email existente mostra a mensagem no campo correto.
- **Critérios:** S13 · **Commit:** `8674d6c`

### TASK-WEB-07 — Tela de detalhe com editar e excluir
- **Estado:** ✅
- **Aceite:** exibe todos os campos incluindo `phone`; excluir pede confirmação em
  elemento da própria interface — **não** `window.confirm` — e redireciona para a
  listagem preservando os filtros anteriores.
- **Verificação:** excluir a partir de uma listagem filtrada retorna à mesma listagem
  filtrada.
- **Critérios:** S11, S13 · **Commit:** `dd855d5`

### TASK-WEB-08 — Acessibilidade e responsividade
- **Estado:** ✅
- **Aceite:** fluxo completo operável por teclado com foco visível; campos com rótulo
  associado; erros anunciáveis por leitor de tela; layout utilizável em largura de
  telefone.
- **Verificação:** percorrer cadastro, busca, edição e exclusão sem tocar no mouse;
  inspecionar em viewport estreito.
- **Critérios:** S14 · **Commit:** `6d23891`

### TASK-WEB-09 — Teste de fluxo do frontend
- **Estado:** ✅
- **Aceite:** teste com Testing Library e MSW cobrindo buscar, paginar e abrir um
  usuário, afirmando comportamento observável — não apenas que renderizou.
- **Verificação:** `npm test` em `apps/web` verde.
- **Critérios:** S5, S13 · **Commit:** `fb718e4`

---

## M6 — Frontend: clima

### TASK-WEB-10 — Tela de clima
- **Estado:** ✅
- **Aceite:** busca por cidade exibindo temperatura, umidade e condição atual. Cidade
  inexistente e falha do serviço produzem mensagens distintas. Dado servido de cache
  expirado é sinalizado ao usuário. **A cidade, região e país resolvidos aparecem em
  destaque** (premissa P7): a origem faz busca aproximada, e sem isso um erro de
  digitação devolve outra cidade sem que ninguém perceba.
- **Verificação:** testar cidade válida, cidade inventada e API indisponível.
- **Critérios:** S13 · **Commit:** `6f8820a`

### TASK-WEB-11 — Gráfico de variação de temperatura
- **Estado:** ✅
- **Aceite:** gráfico Recharts da série horária, com eixos rotulados e responsivo.
- **Verificação:** renderiza para uma cidade válida e se adapta a viewport estreito.
- **Critérios:** — · **Commit:** `f5c3c57`

---

## M7 — Contrato e documentação

### TASK-DOC-01 — OpenAPI e Swagger UI
- **Estado:** ✅
- **Aceite:** documentação derivada dos schemas de validação, cobrindo todos os
  endpoints com exemplos e códigos de erro.
- **Verificação:** a UI lista os seis endpoints e um exemplo executado responde
  corretamente.
- **Critérios:** S10 · **Commit:** `914baf6`

### TASK-DOC-02 — README completo
- **Estado:** ✅
- **Aceite:** pré-requisitos, variáveis sem valores secretos, migrations, **extração do
  `.tgz` com `tar -xzf`** (premissa P1), importação, execução, testes, decisões
  técnicas, trade-offs, limitações e link para `AI_USAGE.md`.
- **Verificação:** setup do zero em diretório limpo seguindo apenas o documento.
- **Critérios:** S15 · **Commit:** `f1b1065`

### TASK-DOC-03 — `AI_USAGE.md`
- **Estado:** ✅
- **Aceite:** ferramentas e modelos; recursos equivalentes a skills usados; seção por
  fase; exemplos de instruções com resumo da resposta; ao menos uma sugestão corrigida
  ou rejeitada; ao menos uma mudança de spec anterior ao código; matriz de
  rastreabilidade; como o código foi validado; limitações percebidas.
- **Verificação:** cada item do enunciado conferido um a um contra o arquivo.
- **Critérios:** — · **Commit:** `a150902`

---

## M8 — Opcionais *(condicionais, nesta ordem)*

### TASK-OPT-01 — Medição da carga completa
- **Estado:** ⬜
- **Aceite:** executar os 10M uma vez com `--limit=0`, registrando tempo total,
  linhas/segundo, memória e tempo de construção dos índices GIN. Publicado no README.
- **Verificação:** números reais da execução, não estimativa.
- **Critérios:** — · **Commit:** —

### TASK-OPT-02 — Pipeline de CI
- **Estado:** ⬜ absorvida por `TASK-DEPLOY-03`, que roda as mesmas verificações e
  ainda condiciona a publicação a elas
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

### TASK-DEPLOY-01 — Pacote de produção autossuficiente
- **Estado:** ✅
- **Motivação:** `npm run build` gera um `dist/` que **não consegue aplicar migrations**.
  O `tsc` compila `.ts` e não copia os `.sql` nem o `meta/_journal.json`, então
  `node dist/db/migrate.js` falha com `Can't find meta/_journal.json file`. Invisível
  localmente porque `npm run db:migrate` usa `tsx` sobre a árvore de fontes — e `tsx` é
  `devDependency`, logo nem esse comando sobrevive a um `npm ci --omit=dev`.
- **Aceite:**
  1. `node dist/db/migrate.js` aplica as migrations num banco vazio, sem `tsx` instalado.
  2. O `dist/` contém os arquivos de migration e o journal.
  3. O build falha se o `dist/` sair incompleto — o defeito não pode voltar em silêncio.
- **Verificação:** build limpo a partir de clone novo; `node dist/db/migrate.js` aplicou
  o schema num banco descartável (`pg_trgm`, 5 índices, 6 colunas); guarda provada
  reprovando com o `dist/` incompleto, código de saída 1.
- **Critérios:** S1, S15 · **Commit:** `592c633`

### TASK-DEPLOY-02 — Blueprint do Render versionado
- **Estado:** ✅
- **Aceite:**
  1. `render.yaml` na raiz descrevendo os três recursos: Postgres 16, a API como Web
     Service e o frontend como Static Site.
  2. Migrations aplicadas automaticamente antes de cada deploy.
  3. `GET /health` como health check da API.
  4. `NODE_ENV=production` definido **no ambiente da plataforma**, nunca em arquivo lido
     pelo Vite.
  5. Nenhum segredo versionado: a chave da WeatherAPI entra pelo painel.
  6. O README documenta a ordem de deploy e a carga de dados.
- **Dependência circular a resolver, não esconder.** A API precisa da origem do frontend
  para o `CORS_ORIGIN`, e o frontend precisa da URL da API em tempo de *build*, porque
  `VITE_API_URL` é embutida no pacote. Uma das duas sempre existe antes da outra. O
  blueprint deixa as duas como preenchimento manual, com a ordem documentada, em vez de
  fingir automação que a plataforma não oferece.
- **Carga de dados:** o CSV de 935 MB não sobe para lugar nenhum. A demonstração usa um
  subconjunto importado da máquina local apontando `DATABASE_URL` para o banco
  hospedado. O banco atual, com 220.873 usuários, ocupa 179 MB — dos quais **120 MB são
  os índices GIN de trigrama** —, o que é apertado para o plano gratuito de 0,5 GB.
- **Verificação:** os quatro comandos do blueprint foram ensaiados a partir de um clone
  limpo, contra banco descartável e com as variáveis que a plataforma define: build da
  API, migration, `npm start` respondendo `/health`, `/users` e `/docs` com log em JSON,
  e build do frontend com a URL de produção embutida e `localhost` ausente. A chave da
  WeatherAPI foi conferida ausente da resposta de `/weather/:city`.
  **Publicado e verificado no ar:** listagem com 41.259 usuários e 2.063 páginas; busca
  com 8 teclas gerando 1 requisição; ordenação e paginação refletidas na URL; validação
  do formulário sem tocar na rede; cadastro e edição em `POST 201` + `PATCH 200`, sem
  busca redundante; email duplicado com caixa trocada em `409` no campo certo; exclusão
  em `DELETE 204` sem requisição órfã; clima com temperatura, umidade, condição e gráfico
  traçado. Os três defeitos encontrados no uso manual não reapareceram — o do CORS foi
  exercitado numa condição mais exigente que a original, entre dois domínios distintos.
  Quatro restrições da plataforma que nenhum ensaio local revelaria estão no README.
- **Critérios:** — · **Commit:** `592c633`
- **Nota:** diferencial opcional do enunciado ("deploy de demonstração"), que declara
  explicitamente não ser necessário publicar. O plano gratuito do Render hiberna o
  serviço após inatividade, então o primeiro acesso de quem avaliar será lento — o
  README precisa avisar, senão a lentidão é lida como defeito.

### TASK-DEPLOY-03 — Publicação automática com verificação antes
- **Estado:** ⬜
- **Motivação:** o blueprint foi criado a partir da URL do repositório público, e instalar
  o app do Render no GitHub depois **não religa** um recurso existente — verificado com um
  push real, que não disparou deploy nenhum. Recriar o blueprint resolveria, mas mudaria
  as URLs já publicadas no README.
- **Decisão:** usar o Deploy Hook de cada serviço, chamado por um workflow do GitHub
  Actions. O efeito prático é o do deploy automático, **com uma diferença que importa: a
  publicação só acontece se lint, typecheck e testes passarem.** O deploy automático do
  Render publicaria de qualquer jeito.
- **Aceite:**
  1. `push` na `main` roda lint, typecheck e testes dos dois aplicativos.
  2. O frontend também passa pelo `build`, que inclui a guarda do `bundleType`.
  3. A publicação só roda se tudo acima passar, e só em `push` na `main` — nunca em
     pull request.
  4. As URLs dos hooks são segredos do repositório, nunca versionadas.
  5. Se um segredo faltar, o workflow **falha com mensagem clara** em vez de fingir que
     publicou.
- **Verificação:** execução verde visível no repositório, seguida de deploy novo nos dois
  serviços sem ninguém apertar nada; e uma execução vermelha provando que a publicação
  não acontece com teste quebrado.
- **Critérios:** — · **Commit:** —
- **Nota:** cobre também o diferencial de integração contínua do enunciado, que estava
  registrado como `TASK-OPT-02`.

### TASK-OPT-04 — Redesenho da interface, possivelmente com shadcn/ui
- **Estado:** ⬜
- **Motivação:** não é estética. O enunciado diz que design sofisticado não é valorizado
  e pede clareza e consistência, o que a interface atual entrega — axe sem violações em
  dez estados de tela, 14 tokens de cor, paleta validada contra as nossas superfícies. O que
  motiva é a **acessibilidade de interação feita à mão**: a revisão encontrou a
  confirmação de exclusão tomando o foco e não devolvendo, e esse é o tipo de defeito que
  reaparece a cada componente novo. Primitivas prontas resolvem por construção o que a
  implementação à mão resolve caso a caso.
- **Aceite:**
  1. O fluxo de exclusão devolve o foco ao elemento de origem ao cancelar, e o move para
     o conteúdo principal após excluir.
  2. Diálogo, seleção e campos de formulário usam primitivas com semântica e teclado
     garantidos, em vez de `div` com `role` escrito à mão.
  3. Zero violações do axe nos dez estados de tela — o patamar atual não pode regredir.
  4. A paleta do gráfico continua sendo a validada; o redesenho não pode reintroduzir
     cor não verificada.
  5. Nenhum componente entra sem uso concreto: o enunciado pede para evitar abstração sem
     uso, e uma biblioteca de componentes é o convite mais fácil para isso.
- **Decisão em aberto — adotar Tailwind ou não.** shadcn/ui **não é dependência**: é um
  gerador que copia o código-fonte do componente para o repositório, sobre Radix UI e
  Tailwind CSS. Adotá-lo significa trazer Tailwind para um projeto que hoje tem 624
  linhas de CSS próprio e legível, com tokens que a skill de visualização validou. O
  ganho está em Radix, não em Tailwind. Duas saídas a avaliar antes de decidir:
  - **Radix UI puro**, estilizado com o CSS que já existe — ganha as primitivas sem
    trocar o sistema de estilo;
  - **shadcn/ui completo**, aceitando Tailwind e reescrevendo o `index.css`.
  A segunda só se justifica se o número de componentes crescer o bastante para o CSS
  próprio virar custo. Hoje são treze.
- **Verificação:** axe sem violações; os percursos por teclado de `accessibility.test.tsx`
  passando sem alteração; caso novo afirmando que o foco volta ao elemento de origem ao
  cancelar a exclusão, escrito **antes** da mudança e reprovando com o código atual.
- **Critérios:** S13, S14 · **Commit:** —
- **Nota:** depende de decisão de escopo, não de tempo. Registrada como tarefa em aberto
  porque o fluxo exige que nada seja implementado sem tarefa — e porque a alternativa,
  descobrir o custo do Tailwind no meio da implementação, é o modo caro de decidir.

---

## Rastreabilidade — critérios × tarefas

## M9 — Revisão

Marco acrescentado após o M8. **Estas tarefas foram registradas depois do trabalho que
descrevem** — o enunciado pede o contrário, e a inversão está explicada no `AI_USAGE.md`.
Os commits citados são os reais e antecedem este registro.

### TASK-REV-01 — Auditoria do tráfego no navegador
- **Estado:** ✅
- **Aceite:** percorrer os fluxos da interface no Chrome comparando cada clique com o log
  da API; nenhuma requisição supérflua, órfã ou repetida; os únicos erros devem ser os
  legítimos do catálogo.
- **Verificação:** 14 fluxos percorridos; 17 requisições no total; os dois erros são o
  `409` de email duplicado e o `404` de cidade inexistente. Casos negativos conferidos:
  cinco teclas digitadas geram uma requisição, voltar à página 1 não gera nenhuma.
- **Critérios:** S11, S12 · **Commit:** `a224f54`

### TASK-REV-02 — Pacote de produção com o React correto
- **Estado:** ✅
- **Aceite:** `npm run build` não pode publicar o React de desenvolvimento; a verificação
  precisa ser automática e falhar com código 1.
- **Verificação:** `bundleType` declarado pelo próprio React lido a cada build; guarda
  provada reintroduzindo `NODE_ENV=development` no `.env`. Pacote de 920 KB para 672 KB.
- **Critérios:** S22 · **Commit:** `8e7a242`

### TASK-REV-03 — Agente revisor de código
- **Estado:** ✅
- **Aceite:** definição versionada, com ferramentas restritas à leitura e execução;
  exigência de reprodução por achado; decisões já documentadas na SPEC declaradas para
  não virarem ruído.
- **Verificação:** rodado em seis frentes paralelas; 41 achados relatados, 37 distintos,
  todos com reprodução. Quatro deles encontrados por duas frentes independentes.
- **Critérios:** — · **Commit:** `87c9e4b`

### TASK-REV-04 — Falha de conexão não derruba o processo
- **Estado:** ✅
- **Aceite:** erro em conexão ociosa do pool precisa chegar a um ouvinte, não virar
  exceção não capturada; o pool deve continuar atendendo depois.
- **Verificação:** conexão derrubada por `pg_terminate_backend`; sem o ouvinte o processo
  morria. Três casos, um deles afirmando sobre a fábrica e não sobre o teste.
- **Critérios:** S17 · **Commit:** `badc88c`

### TASK-REV-05 — Nenhuma requisição pede trabalho ilimitado
- **Estado:** ✅
- **Aceite:** `page` com teto no contrato publicado; tempo limite de consulta na conexão
  da API, sem afetar a importação.
- **Verificação:** `page=9007199254740991` passava e agora é `400`; teto presente no
  OpenAPI; `SHOW statement_timeout` na conexão da API e `0` na da importação.
- **Critérios:** S18 · **Commit:** `badc88c`

### TASK-REV-06 — Linha defeituosa não derruba a importação
- **Estado:** ✅
- **Aceite:** caractere de controle rejeitado com motivo na validação, antes do `COPY`;
  mesma regra aplicada à API, devolvendo `400`/`422` em vez de `500`.
- **Verificação:** byte NUL rejeitado com número de linha e trecho; as demais linhas
  gravadas; contagens fechando. Acentuação, ideogramas e emoji continuam aceitos.
- **Critérios:** S3, S19 · **Commit:** `badc88c`

### TASK-REV-07 — Importações simultâneas não se corrompem
- **Estado:** ✅
- **Aceite:** a segunda execução é recusada com erro reconhecível; o lock é devolvido
  inclusive quando a importação falha.
- **Verificação:** duas execuções concorrentes, uma conclui e a outra é recusada. Sem o
  lock, o erro era `relation "users_import_staging" does not exist`. Lock consultivo, que
  o Postgres libera sozinho quando a conexão cai.
- **Critérios:** S2, S20 · **Commit:** `badc88c`

### TASK-REV-08 — Cota da origem climática distinguível de indisponibilidade
- **Estado:** ✅
- **Aceite:** classificar pelo código do corpo, não pelo status; alinhar os simuladores
  de teste aos status que a origem realmente usa.
- **Verificação:** `403` com `code: 2007` vira `429`; `2008` e `2009` continuam `502`.
  Com o simulador corrigido e o código antigo: `expected 502 to be 429`.
- **Critérios:** S7 · **Commit:** `badc88c`

### TASK-REV-09 — Exceção de render não apaga a aplicação
- **Estado:** ✅
- **Aceite:** limite de erro em volta do conteúdo da rota, preservando a navegação; erro
  registrado, não engolido; trocar de tela limpa o estado de falha.
- **Verificação:** data inválida vinda da API; sem o limite, 5 dos 6 casos reprovam e o
  corpo da página fica vazio.
- **Critérios:** S13, S21 · **Commit:** `badc88c`

### TASK-REV-10 — A suíte do frontend exercita o que diz exercitar
- **Estado:** ✅
- **Aceite:** nenhum teste pode falar com a API real; as rotas com identificador precisam
  afirmar sobre a tela de destino, não sobre a de carregamento; o gráfico precisa ser
  exercitado.
- **Verificação:** `apiServer.listen` instalado onde a aplicação inteira é montada; as
  duas rotas passam a esperar pelo dado carregado; medição do contêiner fornecida ao
  jsdom. Remover o gráfico reprovava 0 casos e agora reprova 6.
- **Critérios:** S5, S13 · **Commit:** `badc88c`

Os commits são preenchidos conforme cada tarefa é concluída.

| Critério | Tarefas | Commit | Verificação |
|---|---|---|---|
| S1 Banco e migrations | TASK-INFRA-01, TASK-INFRA-02, TASK-DB-01 | `6449c27`, `4e80b2f` | migration em base vazia + reexecução |
| S2 Importação reproduzível | TASK-IMPORT-02, TASK-IMPORT-03, TASK-IMPORT-05 | `cba066d`, `f23e16b`, `a0bc095` | dupla execução: 0 inseridos, conjunto idêntico |
| S3 Relatório de import | TASK-IMPORT-01, TASK-IMPORT-04, TASK-IMPORT-05 | `43fa84a`, `a0bc095` | conferência automática a cada execução |
| S4 Email duplicado rejeitado | TASK-DB-02, TASK-API-03, TASK-API-06 | `4e80b2f`, `28f5fa7`, `bcf8bf8` | 409 no POST e no PATCH, inclusive em caixa diferente |
| S5 Filtro, ordenação, paginação | TASK-DB-03, TASK-API-05, TASK-WEB-09 | `4e80b2f`, `761017d`, `fb718e4` | API e percursos de ponta a ponta |
| S6 `404` vs `400` | TASK-API-02, TASK-API-04, TASK-API-07 | `968f5b0`, `d20c4f5` (parcial), `b05d640` | provado nos cinco endpoints de usuários |
| S7 Falha da API climática | TASK-WEATHER-01, TASK-WEATHER-03, TASK-WEATHER-04 | `1cd6440`, `82e54ad` | 6 modos de falha provados em HTTP |
| S8 Chave não vaza | TASK-INFRA-03, TASK-INFRA-04, TASK-INFRA-07, TASK-WEATHER-03 | `6449c27` (parcial), `82e54ad` | ausente de respostas, cabeçalhos e log real |
| S9 Cache expira e protege | TASK-WEATHER-02 | `958a3ed` | TTL, expiração e stale-if-error testados |
| S10 Contrato documentado | TASK-DOC-01 | `914baf6` | 6 endpoints no Swagger, exemplos executados conferem |
| S11 Filtros na URL | TASK-WEB-02, TASK-WEB-03, TASK-WEB-07 | `8c3d710`, `dd855d5` | ida e volta pela URL e retorno da exclusão |
| S12 Busca sem disparo por tecla | TASK-WEB-04 | `6266f2f` | abort verificado no sinal do servidor simulado |
| S13 Carregando, vazio, erro | TASK-WEB-05, TASK-WEB-06, TASK-WEB-10 | `2a454d1` (parcial) | listagem, formulário e detalhe cobertos |
| S14 Utilizável por teclado | TASK-WEB-08 | `6d23891` | axe sem violações nos 10 estados de tela + fluxos por teclado |
| S15 Executável pelo README | TASK-DOC-02 | `f1b1065` | clone novo em diretório limpo: 553 testes passam (606 após o M9) |
| S16 Cobertura ≥ 90% no domínio | TASK-INFRA-06, TASK-IMPORT-05 | `6449c27`, `a0bc095` | gate ativo em modules/** e scripts/** |
| S17 Conexão perdida não derruba o processo | TASK-REV-04 | `badc88c` | `pg_terminate_backend` na conexão ociosa; API continua atendendo |
| S18 Requisição não pede trabalho ilimitado | TASK-REV-05 | `badc88c` | teto de `page` no OpenAPI + tempo limite na conexão |
| S19 Linha defeituosa não derruba a importação | TASK-REV-06 | `badc88c` | NUL rejeitado com motivo; demais linhas gravadas |
| S20 Importações simultâneas não se corrompem | TASK-REV-07 | `badc88c` | segunda execução recusada com erro reconhecível |
| S21 Exceção de render não apaga a aplicação | TASK-REV-09 | `badc88c` | data inválida: alerta exibido, navegação preservada |
| S22 Pacote de produção com o React correto | TASK-REV-02 | `8e7a242` | `bundleType` verificado a cada build |
| Pacote compilado aplica migrations | TASK-DEPLOY-01 | `592c633` | `node dist/db/migrate.js` contra banco descartável, sem `tsx` |
| Infraestrutura versionada e publicada | TASK-DEPLOY-02 | `592c633`, `c42cce8`, `af6809f`, `a26222a` | aplicação no ar, com os fluxos percorridos no navegador |
