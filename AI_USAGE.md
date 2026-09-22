# Registro do uso de IA

Como a IA foi usada no desenvolvimento deste projeto, o que foi aceito, o que foi
corrigido e como cada resultado foi verificado.

A premissa que orientou o trabalho: **a IA acelera a escrita, não substitui a
verificação**. Os achados mais relevantes deste projeto não vieram de o modelo
sugerir algo bom — vieram de rodar, medir e conferir o que ele produziu.

## Ferramenta e modelo

| Item | Valor |
|---|---|
| Ferramenta | Claude Code (CLI da Anthropic) |
| Modelo | Claude Opus 5, janela de 1 milhão de tokens |
| Modo de trabalho | Sessão conversacional única, tarefa a tarefa, com aprovação explícita antes de cada uma |

O trabalho foi conduzido com a IA executando comandos no terminal, no banco e no
navegador, sempre com o resultado visível — não em modo de sugestão de código.

## Skills e recursos utilizados

O Claude Code oferece **skills**: instruções empacotadas que o modelo carrega antes de
executar certos tipos de tarefa. Duas foram usadas, ambas distribuídas com a
ferramenta.

| Skill / origem | Objetivo | Motivo da escolha | Fase | Artefatos influenciados | Decisão | Validação |
|---|---|---|---|---|---|---|
| `dataviz` / embutida no Claude Code | Procedimento para construir visualizações: escolha da forma, papel da cor, validação de paleta, especificação de marcas, camada de interação e acessibilidade | Carregada antes de escrever o gráfico de temperatura, conforme a própria skill determina. O valor concreto foi transformar "escolher uma cor bonita" em verificação executável | Implement (TASK-WEB-11) | `TemperatureChart.tsx`, tokens de gráfico no `index.css` | **Aceita, com um ajuste.** Segui a paleta de referência e as regras de marca. O intervalo do eixo Y foi ajustado depois de olhar o resultado — o padrão do Recharts começava em zero e espremia a variação | O script `validate_palette.js` da skill foi executado contra **as nossas superfícies**, não as do exemplo: aprovado em faixa de luminosidade, piso de croma e contraste nos modos claro e escuro |
| `claude-in-chrome` / embutida no Claude Code | Automação do navegador para abrir a aplicação, capturar telas e inspecionar o DOM | Necessária para cumprir o último passo da skill de visualização — "renderize e olhe" — e para verificar acessibilidade e responsividade em navegador real | Implement, Review | Verificação das telas de usuários e clima, e do Swagger UI | **Aceita, com limitação registrada.** O redimensionamento de janela não altera a viewport neste ambiente; após três tentativas, troquei a abordagem | A verificação de tela estreita passou a medir o comportamento real: com o contêiner reduzido a 358px, a tabela de 735px rolou dentro dele e a página não ganhou rolagem horizontal |

**Não instalei skills adicionais para cumprir o requisito.** O enunciado diz que a
quantidade não pontua e que usar muitas sem necessidade indica falta de foco. As duas
usadas foram carregadas porque a tarefa em mãos as pedia.

Recursos equivalentes também utilizados, nativos da ferramenta:

- **Execução de comandos no terminal** — foi o mecanismo central de verificação:
  testes, migrations, `EXPLAIN ANALYZE`, medições de tempo e memória.
- **Edição de arquivos com leitura obrigatória prévia** — impede sobrescrever algo que
  não foi lido.

## Em que etapas a IA foi utilizada

| Etapa | Uso |
|---|---|
| Inspeção do dataset | Análise das 10 milhões de linhas antes de qualquer decisão de modelagem |
| Specify | Redação da SPEC e do mapa de capacidades a partir de decisões que tomei |
| Plan | Marcos, riscos e checkpoints |
| Tasks | Decomposição em tarefas com critério de aceite |
| Implement | Escrita de código e testes, tarefa a tarefa |
| Review | Verificação em navegador, medições, testes de instalação do zero |
| Documentação | README, OpenAPI e este registro |

---

## Specify

**O que a IA fez.** Transformou as decisões que tomei em `SPEC.md` e
`CAPABILITY_MAP.md`: premissas numeradas, contrato da API, modelo de dados com
justificativa por índice, estratégia de testes, limites e 16 critérios de sucesso
verificáveis.

**O que eu decidi.** As escolhas de fundo foram minhas, feitas antes de a IA escrever:
monorepo com pastas independentes, Drizzle em vez de Prisma, Fastify em vez de Express,
importação com limite configurável, desempate de duplicatas pela primeira ocorrência,
unicidade de email sem distinção de caixa, WeatherAPI, e o nível de cobertura exigido.

**O que mudou por minha intervenção.** A primeira versão da SPEC dizia *"não há meta de
cobertura percentual"* — a IA havia reproduzido o texto do enunciado sem avaliar o
trade-off. Eu discordei e pedi 90%. O resultado foi um meio-termo que eu aceitei depois
do argumento dela: gate de 90% **apenas onde mora regra de negócio**, cobertura global
medida sem gate. O raciocínio está na §8 da SPEC, incluindo o ponto que me convenceu —
cobertura mede linha executada, não asserção feita, e pedir "chegue a 90%" a uma IA é
o caminho mais curto para testes rasos.

**Uma decisão minha que a IA questionou e eu mantive.** Pedi que os identificadores de
código fossem todos em inglês. A IA havia misturado os dois idiomas. Ela registrou a
convenção na SPEC §11 antes de refatorar, e o resultado ficou consistente.

## Plan

**O que a IA fez.** Nove marcos com escopo, tempo estimado e checkpoint objetivo; oito
riscos com probabilidade, impacto, mitigação e marco de detecção; ordem de corte
explícita.

**Decisão de ordenação que aceitei.** O plano colocou a integração climática **antes**
da importação, por concentrar a única dependência externa, e a importação depois do
schema estabilizado, por ser a etapa mais longa de executar. Aceitei: descobrir erro de
modelagem depois de uma carga de 10 milhões de linhas seria caro.

**Decisão antecipada que se mostrou acertada.** O risco R3 previa que o `COUNT` com
filtro pudesse ficar proibitivo. O plano registrou, antes de qualquer medição, que
**não migraríamos para keyset pagination dentro do prazo** — a limitação seria
documentada. Medido depois com 220.875 registros: 64 ms. O risco não se materializou, e
a decisão tomada com a cabeça fria evitou uma reescrita apressada.

## Tasks

**O que a IA fez.** 43 tarefas com critério de aceite, forma de verificação, critérios
da SPEC atendidos e espaço para o commit — mais a matriz de rastreabilidade.

**Granularidade que eu escolhi.** A IA ofereceu três níveis. Escolhi o médio: unidade
concluível em 20 a 40 minutos, com os casos listados dentro do aceite. O argumento que
pesou foi dela: um `todo.md` fino demais fica desatualizado, e o enunciado pede "estado
atual" — inconsistência ali é pior que granularidade grossa.

**Mudança de ordem registrada antes de executar.** As tarefas de clima 03 e 04 foram
invertidas, porque provar que `404`, `504`, `429` e `502` chegam ao cliente exige a rota
existir. A inversão foi registrada em commit próprio (`94b118e`) antes da
implementação.

## Implement

**Modo de trabalho.** Uma tarefa por vez, com verificação antes de avançar. Cada
implementação terminou em: `typecheck`, `lint`, suíte de testes, e — quando havia o que
observar — execução real contra a API, o banco ou o navegador.

**O padrão que se repetiu.** O gate de cobertura disparou **seis vezes**, e em todas
apontou **código sobrando, não teste faltando**: fallbacks para casos impossíveis e uma
função declarada e nunca usada. Todos eram código que a IA havia escrito por hábito
defensivo. A métrica funcionou como detector de excesso.

---

## Exemplos de instruções e o que resultou

### 1. Inspeção do dataset antes de decidir a modelagem

> *"Coloquei o arquivo users.csv.gz na pasta, queria uma forma de visualizar o conteúdo
> dele, você consegue visualizar?"*

**Resposta.** A IA descobriu que o arquivo não é um gzip simples, e sim um **tar
gzipado** — `gunzip` isolado não o abre. Descomprimiu (935 MB, 10 milhões de linhas) e
fez uma passada completa medindo integridade: zero campos vazios, zero emails
malformados, zero UUIDs inválidos. E o achado decisivo: **apenas 1.598.726 emails
distintos**, ou seja, 84% das linhas são duplicatas — e duplicatas **conflitantes**, com
nomes e IDs diferentes para o mesmo email.

**Efeito no projeto.** Mudou a natureza da tarefa de importação: o trabalho principal
passou a ser a deduplicação determinística, não a inserção. Também revelou a coluna
`phone`, ausente do schema exigido, e gerou as premissas P1, P2 e P3 da SPEC.

### 2. Escolha de estrutura de repositório

> *"queria ver qual seria melhor forma de disponibilizar o projeto no github, por
> exemplo se fazemos um monolito (...) na minha opinião por se tratar de um teste
> técnico, deve ser melhor fazer um monorepo mesmo, mas quero sua opinião"*

**Resposta.** Concordou com o monorepo, mas com argumentos que eu não havia considerado:
os artefatos de especificação exigidos são de raiz, e o histórico de commits precisa ser
único para a rastreabilidade — dois repositórios quebrariam ambos. Recomendou pnpm
workspaces com pacote compartilhado; **eu recusei** e optei por pastas independentes,
sem workspace. A consequência aceita conscientemente é a duplicação dos tipos do
contrato, registrada na SPEC §4 e no README.

### 3. Mudança de contrato antes do código

> *(durante a TASK-API-02)*

A IA identificou que erros de validação precisavam informar **qual campo** falhou, e que
a §6 da SPEC só documentava `code` e `message`. Em vez de implementar e documentar
depois, atualizou a especificação primeiro, em commit próprio (`da28897`), acrescentando
o campo `details` e o catálogo completo de códigos. O código veio no commit seguinte
(`968f5b0`).

**Efeito.** Três tarefas depois, o formulário conseguiu marcar o campo de email no erro
`409` em vez de exibir aviso genérico — comportamento que o aceite da TASK-WEB-06
exigia.

### 4. Verificação da integração contra o serviço real

> *(durante a TASK-WEATHER-04)*

Consultando a WeatherAPI de verdade, a IA descobriu que ela faz **correspondência
aproximada**: `"sao pualo"` devolve `"Sao Sao, Chad"` com status `200`, e `"12345"`
devolve `"Schenectady, USA"`. O `404` só ocorre quando nada casa.

**Efeito.** Registrado como premissa P7 e propagado para o aceite da tela de clima:
cidade, região e país resolvidos aparecem em destaque. Sem isso, alguém leria "25°C,
tempestade de poeira" achando que é São Paulo. **Nenhum teste com servidor simulado
encontraria isso** — eu havia simulado o comportamento que supunha que a API tinha.

---

## Sugestões da IA que corrigi ou rejeitei

### Rejeitada: pnpm workspaces com pacote compartilhado

A IA recomendou workspace com `packages/shared` para os tipos do contrato. Rejeitei:
num teste de 24 horas, acrescenta risco de setup para o avaliador em troca de evitar uma
duplicação pequena e controlável. A duplicação é verificada pelos testes de contrato, que
usam os mesmos campos nos dois lados.

### Corrigida: ausência de meta de cobertura

A SPEC original dizia "não há meta de cobertura percentual", reproduzindo o enunciado sem
avaliar o trade-off. Exigi 90%. A IA argumentou contra o gate **global** com uma razão
que aceitei — cobertura mede linha executada, e pedir um número a uma IA produz testes
rasos — e o resultado foi o gate seletivo, que ao longo do projeto encontrou seis casos
de código desnecessário.

### Corrigida: mistura de idiomas nos identificadores

O código misturava `criarBanco` com `loadEnv`, às vezes na mesma expressão. Pedi inglês
em todos os identificadores. A IA registrou a convenção na SPEC §11 antes de refatorar
(`b76dc03` precede `5b5755d`).

### Corrigida pela própria IA, após medição: estimativa errada na SPEC

A SPEC afirmava que `INSERT` linha a linha faria "~1.000 inserções/s" e levaria "horas".
Ao medir, o número real foi **4.752 linhas/s**, projetando 35 minutos — não horas. A
estimativa foi substituída pela medição, com a correção registrada no commit `cba066d`.
Sem medir, o README teria publicado um número inventado.

### Corrigida pela própria IA: índice que não funcionava

O índice composto de ordenação foi criado, a migration aplicou com sucesso, e `\d users`
o mostrava presente — **mas o planner continuava ignorando**. O `.desc()` do Drizzle
emite `DESC NULLS LAST`, enquanto `ORDER BY created_at DESC` significa `NULLS FIRST`. A
divergência faz o índice ser descartado em silêncio. Só apareceu porque a medição foi
refeita **depois** de aplicar. Ganho após a correção: **29 ms → 0,33 ms**.

---

## Como o código foi validado

Nenhuma implementação foi aceita por parecer correta.

| Mecanismo | O que verifica |
|---|---|
| **PostgreSQL real e efêmero** (Testcontainers) | Constraints, índice funcional, deduplicação e paginação contra o banco de verdade, com as mesmas migrations de produção |
| **Servidor simulado com falha em requisição não prevista** (MSW) | A WeatherAPI nunca é chamada em teste; qualquer requisição que escape para a rede falha a suíte |
| **`EXPLAIN ANALYZE`** | Uso efetivo dos índices, e não sua mera existência |
| **Medição de tempo e memória** | Streaming, `COPY` × `INSERT`, latência das consultas |
| **Execução repetida da suíte** | Encontrou três testes instáveis que uma execução só não revelaria |
| **Navegador real** | Telas, acessibilidade, gráfico e Swagger UI |
| **Instalação do zero em diretório limpo** | Encontrou dois bugs invisíveis no repositório de trabalho |
| **axe-core** | Zero violações de acessibilidade em oito telas |
| **Auditoria do tráfego no navegador** | O que cada tela pede à API, contado no log do servidor — encontrou três defeitos que a suíte não via |
| **Instrumentação do `fetch` na página** | O que o navegador dispara e cancela, que o log do servidor não registra — encontrou o quarto |
| **Inspeção do pacote gerado** | Que o `npm run build` publicava o React de desenvolvimento |

### Três achados que só a verificação produziu

**Testes instáveis.** Rodando a suíte repetidamente, três testes falharam de forma
intermitente: um dependia do estado deixado por outro arquivo, e dois tinham margens de
tempo apertadas demais. Uma execução só sempre passava.

**O `.gitignore` quebrava a suíte em qualquer clone.** A regra `*.csv`, criada para o
dataset de 935 MB, excluía também as fixtures dos testes. Localmente tudo passava;
**num clone novo, 32 testes falhavam** — exatamente o que o avaliador veria. Encontrado
ao instalar o projeto do zero seguindo apenas o README.

**Cancelamento de requisição que não funcionava.** A detecção usava
`instanceof DOMException`, e o tipo concreto do erro de abort varia entre ambientes. O
cancelamento virava erro visível na tela — o oposto do requisito.

### O limite mais caro que encontrei: verificar o resultado não é verificar o caminho

Os defeitos abaixo escaparam de 553 testes. Nenhum foi sorte: os três primeiros têm a
mesma causa, e a causa é minha.

**CORS bloqueando `PATCH` e `DELETE`.** O padrão do `@fastify/cors` libera apenas `GET`,
`HEAD` e `POST` — os "métodos simples" da especificação —, e o navegador barrava os
outros na verificação prévia, antes de a requisição sair. Encontrado por quem usou a
tela, não pela suíte: `app.inject()` entrega a requisição direto ao roteador e não
simula navegador nenhum. Corrigido declarando os métodos, e coberto por sete casos que
exercitam o `OPTIONS` de propósito (`tests/cors.test.ts`).

**Requisição órfã na exclusão.** Ao excluir, a tela de detalhe buscava o registro que
acabara de apagar e recebia `404`. Também encontrado no uso manual. Os testes existentes
não tinham como pegar: eles afirmavam que o usuário sumia da lista e que a navegação
acontecia — e as duas coisas aconteciam, com a requisição perdida no meio.

**Duas buscas para obter o dado que a resposta já trazia.** Ao salvar uma edição, eu
invalidava o cache do registro. Isso fazia a tela de edição buscar de novo e a de
detalhe buscar outra vez, enquanto a resposta do `PATCH` já continha exatamente o
registro gravado. Encontrado contando as requisições no log da API, fluxo a fluxo.
Corrigido escrevendo a resposta no cache (`setQueryData`) em vez de invalidá-lo.

A auditoria que fechou o assunto percorreu **14 fluxos no Chrome** — listagem, busca
digitada tecla a tecla, ordenação, paginação, cadastro válido e inválido, email
duplicado com caixa trocada, edição, exclusão e as quatro variações do clima —
comparando cada clique com o log do servidor. Resultado final: **17 requisições, e os
dois erros são os dois esperados** (`409` de email duplicado, `404` de cidade
inexistente). Confirmou também o que não devia acontecer: cinco teclas digitadas geram
uma requisição, voltar para a página 1 não gera nenhuma, e digitar uma cidade sem
enviar não consulta nada.

O que mudou na suíte: `tests/requestTraffic.test.tsx` passou a afirmar sobre o tráfego,
e não sobre a tela. É o único lugar onde uma requisição a mais é um defeito. Antes de
aceitar os quatro casos, reverti as duas correções e **confirmei que os quatro falham** —
um teste que nunca viu o defeito não prova que o pega.

### O defeito que a auditoria não pegou, e o que faltava para pegar

Depois de tudo isso, ainda sobrava uma requisição cancelada por tela — visível no painel
de rede como um par "uma falha, uma sucesso" em cada ato. Eu não a tinha encontrado
porque **auditei pelo log do servidor**, e ela nunca chega lá: nasce e morre em 1ms, do
lado do navegador.

A investigação teve uma hipótese errada pelo caminho, e foi ela que levou à causa real.
Instrumentei o `fetch` da página e a pilha apontou `QueryObserver.onSubscribe` duas
vezes — assinatura do `StrictMode`, que monta cada componente duas vezes em
desenvolvimento de propósito. Desliguei o `StrictMode`: uma requisição só. Caso
encerrado, aparentemente — **em desenvolvimento isso é comportamento correto do React, e
o cancelamento limpo é justamente o que ele serve para revelar.**

Só que o mesmo par aparecia no pacote de produção, onde o `StrictMode` não faz nada.
Contradição. Fui verificar em que modo o React do pacote estava, e a resposta explicou
tudo:

> O `.env` da raiz definia `NODE_ENV=development`, escrito para a API. O
> `vite.config.ts` aponta o `envDir` para essa mesma raiz — decisão deliberada, um
> arquivo de configuração só para os dois lados. E **o Vite respeita `NODE_ENV` vindo de
> arquivo `.env`**. O `npm run build` vinha gerando um pacote com o React de
> desenvolvimento: **920 KB em vez de 672 KB**, com as verificações de dev ativas e o
> `StrictMode` montando cada tela duas vezes **no pacote publicado**.

A requisição duplicada era o sintoma visível; o defeito era o pacote de produção.

Corrigido tirando `NODE_ENV` do `.env` compartilhado — ela pertence ao processo, não a
um arquivo lido por duas ferramentas com regras diferentes. A API já assumia
`development` na ausência dela.

O que impede a regressão: `apps/web/scripts/check-build.mjs`, executado ao final de todo
`npm run build`. Ele lê o `bundleType` que o próprio React declara — `0` para produção,
`1` para desenvolvimento — e falha com código 1. Provei que ele reprova reintroduzindo a
variável no `.env`. Essa falha precisava de guarda automática porque **não se manifesta
como erro**: o pacote é gerado, a aplicação funciona, e a única pista é o tamanho.

Medido no navegador, com o pacote corrigido: selecionar um usuário passou de duas
requisições (uma cancelada em 1ms, uma bem-sucedida) para **uma**; excluir passou de três
para **duas** — o `DELETE` e a recarga da listagem.

O efeito colateral mais interessante foi um teste antigo cair: `leva ao detalhe do
usuário criado` esperava pelo título "Detalhes do usuário", que é o título das telas de
**carregando e de erro**. Ele afirmava ter chegado ao destino olhando para a tela de
espera, e teria continuado passando se a busca seguinte falhasse. Sem carregamento, não
havia mais tela de espera para encontrar. A asserção agora é o nome do usuário.

---

## Matriz de rastreabilidade

Requisitos mais importantes, do critério ao commit e à verificação.

| Requisito / critério | Tarefa | Commit | Verificação |
|---|---|---|---|
| Rejeitar email duplicado | `TASK-DB-02`, `TASK-API-03` | `4e80b2f`, `28f5fa7` | Constraint provada no banco; `409` na API inclusive com caixa diferente |
| Atualizar sem conflitar consigo mesmo | `TASK-API-06` | `bcf8bf8` | Três testes: mesmo email, só a caixa alterada, formulário reenviado inteiro |
| Filtro parcial, ordenação e paginação | `TASK-API-05` | `761017d` | 22 testes de integração; curingas do `LIKE` escapados; desempate determinístico |
| `404` distinto de `400` | `TASK-API-02`, `04`, `07` | `968f5b0`, `d20c4f5`, `b05d640` | Provado nos cinco endpoints, com id numérico, truncado e tentativa de injeção |
| Tratar falha da API climática | `TASK-WEATHER-01`, `03`, `04` | `1cd6440`, `82e54ad` | Seis modos de falha verificados no status HTTP que chega ao cliente |
| Chave da API não vaza | `TASK-INFRA-03`, `04`, `TASK-WEATHER-03` | `6449c27`, `82e54ad` | Ausente de respostas, cabeçalhos e **log real** escrito em fluxo de memória |
| Cache com expiração | `TASK-WEATHER-02` | `958a3ed` | TTL, expiração e `stale-if-error` com relógio injetado |
| Importação reproduzível | `TASK-IMPORT-02`, `03` | `cba066d`, `f23e16b` | Dupla execução: zero inseridos, conjunto idêntico |
| Registros inválidos explícitos | `TASK-IMPORT-01`, `04` | `43fa84a`, `a0bc095` | Conferência das contagens a cada execução; fixture com sete defeitos |
| Filtros na URL | `TASK-WEB-03`, `07` | `8c3d710`, `dd855d5` | Ida e volta pela URL; retorno após exclusão preserva a busca |
| Busca sem disparo por tecla | `TASK-WEB-04` | `6266f2f` | Abort verificado no sinal recebido pelo servidor simulado |
| Utilizável por teclado | `TASK-WEB-08` | `6d23891` | axe sem violações em sete telas; fluxos percorridos sem mouse |
| Fluxo do frontend | `TASK-WEB-09` | `fb718e4` | Nove percursos sobre API simulada com comportamento real |
| Tela não faz requisição supérflua nem órfã | — | `bde88c1`, `a224f54` | 14 fluxos percorridos no Chrome contra o log da API: 17 requisições, só os dois erros esperados |
| Contrato documentado | `TASK-DOC-01` | `914baf6` | Seis endpoints no Swagger; exemplos executados conferem |
| Executável pelo README | `TASK-DOC-02` | `f1b1065` | Clone novo em diretório limpo: 553 testes passam |
| Cobertura no domínio | `TASK-INFRA-06` | `6449c27` | Gate provado **falhando** de propósito, com código de saída 1 |

O histórico completo distingue as fases por prefixo: `spec:`, `plan:`, `tasks:`,
`feat:`, `test:`, `refactor:`, `docs:`, `fix:`.

---

## Limitações percebidas

**A IA escreve código defensivo em excesso.** Seis vezes o gate de cobertura apontou
proteções contra situações impossíveis: `?? 0` em contagens que sempre retornam linha,
guardas de narrowing inalcançáveis, uma função criada "para quando houver mais filtros"
que nunca foi usada. É código que parece cuidadoso e só adiciona superfície.

**Ela simula o comportamento que supõe, não o que existe.** Os testes da integração
climática foram escritos contra a WeatherAPI que a IA imaginava. A busca aproximada —
que devolve outra cidade com status `200` — só apareceu ao chamar o serviço real.

**Ela escreve testes que verificam a coisa errada.** Aconteceu quatro vezes: uma
asserção exigindo ausência da palavra "uuid" numa resposta cuja mensagem legítima a
contém; um teste de sincronia de URL usando `rerender` de um roteador que não navega;
uma verificação de `<meta viewport>` consultando o `document` do jsdom, que é um
documento em branco; e simuladores devolvendo sempre a página 1, fazendo a paginação
parecer quebrada. Em três desses casos, investigar a falha revelou algo real no código.

**Ela declara sucesso cedo demais.** A migration do índice composto "aplicou com
sucesso" e não teve efeito nenhum. Foi medir de novo depois de aplicar que revelou.

**Verificação superficial engana.** `curl` devolvendo `200` em `localhost:5173` me fez
concluir que o frontend estava no ar — era **outro projeto** ocupando a porta. Passei a
conferir o `<title>` do HTML.

## Onde preferi não usar IA

**Decisões de produto e de escopo.** Estrutura do repositório, stack, granularidade das
tarefas, nível de cobertura, quais diferenciais perseguir e o que cortar se o prazo
apertasse — todas foram minhas, com a IA apresentando trade-offs quando eu pedi.

**Aceitar sugestões sem verificação.** Nenhuma implementação entrou sem teste
executado, medição ou verificação em navegador. Os bugs mais sérios deste projeto — o
índice inerte, o `.gitignore` quebrando clones, o cancelamento que não cancelava —
passariam por revisão de código sem levantar suspeita.

**Interpretação do enunciado.** As sete premissas da SPEC registram interpretações
minhas sobre pontos ambíguos. Onde havia dúvida, escolhi e documentei, em vez de deixar
a IA decidir em silêncio.

---

## Documentos relacionados

- [`README.md`](./README.md) — execução, decisões e limitações
- [`SPEC.md`](./SPEC.md) — especificação e critérios de sucesso
- [`CAPABILITY_MAP.md`](./CAPABILITY_MAP.md) — capacidades e ordem de construção
- [`tasks/plan.md`](./tasks/plan.md) — marcos, riscos e checkpoints
- [`tasks/todo.md`](./tasks/todo.md) — tarefas com aceite, verificação e commit
