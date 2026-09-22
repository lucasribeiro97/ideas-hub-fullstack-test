# CAPABILITY_MAP

Capacidades do sistema, suas responsabilidades, dependências e ordem de construção.
Cada capacidade é entregável e verificável de forma isolada.

## Visão geral

```
C1 Infraestrutura de dados
      │
      ├──> C2 Persistência de usuários
      │          │
      │          ├──> C3 Importação em massa (CSV)
      │          └──> C4 API de usuários ──┐
      │                                     ├──> C6 Contrato documentado
      └──> C5 Integração climática ────────┘
                                            │
                    ┌───────────────────────┴───────────┐
                    │                                   │
             C7 Front: usuários                  C8 Front: clima
                    │                                   │
                    └──────────> C9 Testes <────────────┘
                                     │
                          C10 Observabilidade · C11 CI · C12 E2E
```

## Capacidades

### C1 — Infraestrutura de dados

**Responsabilidade:** disponibilizar um PostgreSQL reproduzível e um mecanismo de
migrations versionadas.

- `docker compose` com Postgres (obrigatório pelo enunciado);
- migrations via `drizzle-kit`, aplicáveis por comando único;
- validação de variáveis de ambiente na inicialização.

**Depende de:** nada. É a base de tudo.
**Verificação:** `docker compose up -d` seguido do comando de migration cria o schema
em um banco vazio, sem passos manuais.

---

### C2 — Persistência de usuários

**Responsabilidade:** modelar a tabela `users` e os índices que sustentam busca,
ordenação e unicidade.

- campos: `id` (UUID, PK), `name`, `email`, `phone` (opcional), `created_at`, `updated_at`;
- índice único funcional em `lower(email)`;
- índices GIN/`pg_trgm` para busca parcial em `name` e `email`;
- índice para a ordenação padrão da listagem.

**Depende de:** C1.
**Verificação:** migration aplicada; tentativa de inserir email repetido (em qualquer
caixa) é rejeitada pelo banco.

---

### C3 — Importação em massa do CSV

**Responsabilidade:** carregar o dataset de origem de forma reproduzível, tratando
registros inválidos e emails duplicados de maneira explícita.

- leitura em streaming (o arquivo descomprimido tem ~935 MB / 10M linhas);
- `COPY` para tabela de staging, deduplicação no banco;
- regra de desempate determinística: primeira ocorrência no arquivo vence;
- relatório final: lidos, importados, descartados por duplicidade, rejeitados por invalidez;
- `--limit` configurável para permitir execução rápida na avaliação.

**Depende de:** C2.
**Verificação:** duas execuções sobre o mesmo arquivo produzem exatamente o mesmo
conjunto de usuários; os números do relatório fecham com o total de linhas lidas.

---

### C4 — API de usuários

**Responsabilidade:** expor o CRUD e a listagem com busca, ordenação e paginação.

- `POST /users`, `GET /users`, `GET /users/:id`, `PUT /users/:id`, `DELETE /users/:id`;
- filtro parcial por nome e email, ordenação e paginação com metadados;
- validação de body, params e query por schema;
- formato de erro consistente, sem vazar detalhes internos.

**Depende de:** C2.
**Verificação:** testes de integração contra Postgres real cobrindo criação, email
duplicado, id inexistente, id malformado, filtros e paginação.

---

### C5 — Integração climática

**Responsabilidade:** consultar a API externa e converter a resposta para um contrato
próprio e estável.

- `GET /weather/:city`;
- cliente HTTP com timeout explícito;
- cache em memória com expiração, servindo dado expirado quando a origem falha;
- tradução de falhas externas (cidade inexistente, rate limit, indisponibilidade)
  para erros próprios;
- chave de API nunca exposta ao navegador nem versionada.

**Depende de:** C1 (apenas validação de env). Independente de C2/C3 — pode ser
construída em paralelo.
**Verificação:** testes com a API externa simulada cobrindo sucesso, timeout, 404 e
erro 5xx; inspeção de que a resposta ao cliente não contém a chave.

---

### C6 — Contrato documentado

**Responsabilidade:** publicar a documentação OpenAPI derivada dos schemas de validação.

**Depende de:** C4 e C5.
**Verificação:** a UI do Swagger lista todos os endpoints e os exemplos respondem
corretamente contra a API em execução.

---

### C7 — Frontend: usuários

**Responsabilidade:** listagem com busca/ordenação/paginação, cadastro, edição e detalhe.

- filtros refletidos na URL (recarregar ou compartilhar preserva o contexto);
- busca sem disparar requisição a cada tecla;
- estados de carregamento, lista vazia e erro;
- formulários com validação e mensagens claras;
- navegável por teclado e responsivo.

**Depende de:** C4.
**Verificação:** fluxo manual completo + teste automatizado de um fluxo relevante.

---

### C8 — Frontend: clima

**Responsabilidade:** busca por cidade com exibição de temperatura, umidade, condição
atual e gráfico de variação ao longo do dia.

**Depende de:** C5.
**Verificação:** cidade válida renderiza o gráfico; cidade inexistente e falha da API
exibem mensagens distintas e compreensíveis.

---

### C9 — Testes

**Responsabilidade:** cobrir os fluxos e regras mais importantes com cenários relevantes.

Mínimo exigido: criação de usuário e rejeição de email duplicado; filtros e paginação;
falha da API climática; um fluxo do frontend.

**Depende de:** C4, C5, C7, C8.
**Verificação:** suíte executável por comando único e verde.

---

### C10 — Observabilidade *(opcional)*

Logs estruturados com identificador de requisição.
**Depende de:** C4.

---

### C11 — Integração contínua *(opcional)*

Pipeline executando lint, typecheck e testes a cada push.
**Depende de:** C9.

---

### C12 — Teste ponta a ponta *(opcional, último)*

Um fluxo crítico exercitado no navegador com banco, API e frontend reais.
**Depende de:** todo o escopo obrigatório concluído e verde. Primeiro item a ser
cortado caso o prazo aperte.

## Ordem de construção

A ordem abaixo prioriza ter uma aplicação executável o quanto antes e adiar o que é
caro ou opcional.

| # | Capacidade | Motivo da posição |
|---|---|---|
| 1 | C1 Infraestrutura | Nada funciona sem banco e migrations |
| 2 | C2 Persistência | Define o contrato de dados que a API e a importação consomem |
| 3 | C4 API de usuários | Entrega o núcleo avaliado; destrava o frontend |
| 4 | C5 Integração climática | Independente do banco; isola o risco da dependência externa cedo |
| 5 | C3 Importação | Depende de C2 estável; é a etapa mais longa de executar |
| 6 | C7 Front: usuários | Consome C4, já verificada |
| 7 | C8 Front: clima | Consome C5, já verificada |
| 8 | C6 Contrato | Documenta endpoints já estabilizados, evitando retrabalho |
| 9 | C9 Testes | Escritos junto de cada capacidade; consolidados aqui |
| 10 | C10–C12 Opcionais | Só após o escopo obrigatório estar fechado |

C3 vem depois de C4 deliberadamente: a importação é a etapa mais demorada de rodar e
depende do schema estar estável. Subir a API antes evita descobrir um problema de
modelagem só depois de uma carga longa.
