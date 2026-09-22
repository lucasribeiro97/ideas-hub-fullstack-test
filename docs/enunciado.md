# Teste Prático — Fullstack Developer com IA Assistida

## Contexto

Você deverá desenvolver uma aplicação fullstack para consulta e gerenciamento de usuários, com integração a um serviço externo de informações climáticas.

O objetivo não é apenas verificar se a aplicação funciona, mas avaliar sua capacidade de usar IA como ferramenta de desenvolvimento com senso crítico: decompor o problema, fornecer contexto, revisar sugestões, detectar erros e validar a solução entregue.

O uso de uma ferramenta de IA durante o desenvolvimento é **obrigatório**. A escolha da ferramenta e do modelo é livre e não influencia a nota.

## Stack obrigatória

- **Backend:** Node.js com TypeScript
- **Banco de dados:** PostgreSQL
- **Frontend:** React com TypeScript
- **Comunicação:** API REST em JSON

Frameworks e bibliotecas são livres. Explique no `README.md` as escolhas que considerar relevantes.

## Prazo de entrega

O prazo total para entrega é de **24 horas**, contado a partir do envio deste teste ao candidato.

Não esperamos que todo o período seja dedicado exclusivamente ao desenvolvimento. Organize o tempo como considerar adequado. Se não for possível concluir tudo, priorize uma aplicação executável, indique claramente o que ficou pendente e descreva como completaria a solução. A capacidade de priorizar e comunicar trade-offs também faz parte da avaliação.

## Como a IA deve ser utilizada

Você pode usar IA para planejamento, implementação, criação de testes, revisão, depuração e documentação. Esperamos, porém, que você mantenha responsabilidade integral pelo resultado.

O projeto deve ser desenvolvido com **Spec-Driven Development**. Antes de implementar, transforme o enunciado em especificações e critérios de aceite verificáveis. Use a IA para ajudar a esclarecer, revisar e executar essas especificações — não apenas para gerar código diretamente.

Siga o fluxo abaixo:

1. **Specify:** explicite premissas, requisitos, limites e critérios de sucesso.
2. **Plan:** defina componentes, dependências, riscos e ordem de implementação.
3. **Tasks:** decomponha o plano em tarefas pequenas, cada uma com aceite e forma de verificação.
4. **Implement:** execute uma tarefa por vez e valide o resultado antes de avançar.

### Artefatos obrigatórios de especificação

Mantenha no repositório, no mínimo:

- `CAPABILITY_MAP.md`: capacidades principais do sistema, responsabilidades, dependências e ordem de construção;
- `SPEC.md`: objetivo, stack, comandos, estrutura do projeto, convenções, estratégia de testes, limites, critérios de sucesso e questões em aberto;
- `tasks/plan.md`: plano técnico, ordem de implementação, riscos e checkpoints de validação;
- `tasks/todo.md`: tarefas ordenadas, com critérios de aceite, forma de verificação e estado atual;
- `AI_USAGE.md`: registro do uso crítico da IA e da evolução das especificações.

Esses artefatos podem ser concisos. Eles devem ser criados antes do código correspondente, permanecer versionados e ser atualizados quando uma decisão ou requisito mudar. O histórico de commits deve permitir distinguir especificação, planejamento e implementação.

Não implemente algo que não esteja associado a um critério de sucesso ou tarefa registrada. Se descobrir uma mudança necessária durante a implementação, atualize primeiro a especificação ou o plano e registre a decisão.

Durante o desenvolvimento:

- divida o trabalho em etapas verificáveis;
- forneça à IA contexto e critérios de aceite claros;
- revise todo código incorporado ao projeto;
- execute testes e verificações em vez de confiar apenas na resposta da IA;
- corrija ou rejeite sugestões inadequadas;
- não envie credenciais, dados pessoais ou outros conteúdos sensíveis à ferramenta;
- mantenha commits que permitam compreender a evolução da solução.

Não avaliaremos quantidade, tamanho ou sofisticação dos prompts. Avaliaremos o resultado, o raciocínio e a capacidade de verificar o trabalho assistido.

### Registro obrigatório do uso de IA

Inclua na raiz do projeto um arquivo `AI_USAGE.md` contendo:

- ferramentas e modelos utilizados;
- skills, agentes especializados, comandos reutilizáveis ou workflows utilizados, informando o nome exato e sua origem quando disponível;
- em quais etapas a IA foi utilizada;
- uma seção para cada fase — `Specify`, `Plan`, `Tasks` e `Implement` — explicando como a IA apoiou o trabalho;
- de dois a quatro exemplos representativos de instruções fornecidas à IA, com um breve resumo da resposta — não é necessário copiar conversas completas;
- ao menos uma sugestão da IA que você corrigiu, adaptou ou rejeitou, explicando o motivo;
- ao menos uma mudança feita em uma especificação, plano ou tarefa antes de alterar o código correspondente;
- referência entre requisitos relevantes, tarefas, commits e verificações, podendo usar uma tabela simples de rastreabilidade;
- como você validou o código produzido ou sugerido;
- limitações percebidas e tarefas em que preferiu não usar IA.

Remova informações pessoais, credenciais e dados sensíveis desse registro.

### Registro das skills

Para cada skill utilizada, informe:

- nome exato e, quando aplicável, pacote, plugin ou origem;
- objetivo e motivo da escolha;
- fase em que foi usada: `Specify`, `Plan`, `Tasks`, `Implement` ou `Review`;
- artefatos ou partes do código influenciados;
- recomendações aceitas, adaptadas ou rejeitadas;
- como o resultado foi validado.

Caso sua ferramenta não ofereça o conceito de skill, declare isso e registre os recursos equivalentes utilizados, como agentes especializados, regras, templates, comandos ou workflows. Não é necessário instalar skills apenas para cumprir este requisito.

A quantidade de skills não será pontuada. O uso de muitas skills sem necessidade pode indicar falta de foco; avaliaremos a adequação da escolha e o controle sobre o resultado.

Use, por exemplo:

| Skill/origem | Objetivo | Fase | Influência no projeto | Decisão do candidato | Validação |
|---|---|---|---|---|---|
| `spec-driven-development` / pacote ou ferramenta | Estruturar requisitos e critérios | Specify | `SPEC.md` e `tasks/plan.md` | Adaptei os critérios X; rejeitei Y | Revisão da spec e rastreabilidade |

O formato é livre, mas recomendamos incluir uma tabela como esta:

| Fase | Objetivo | Como a IA foi orientada | Decisão tomada | Artefato alterado | Como foi verificado |
|---|---|---|---|---|---|
| Specify | Ex.: definir paginação | Resumo do contexto e da instrução | O que foi aceito, alterado ou rejeitado | `SPEC.md` | Critério revisado antes da implementação |
| Plan |  |  |  | `tasks/plan.md` |  |
| Tasks |  |  |  | `tasks/todo.md` |  |
| Implement |  |  |  | Código/testes | Comando ou evidência objetiva |

Inclua também uma pequena matriz de rastreabilidade para os requisitos mais importantes:

| Requisito/critério | Tarefa | Implementação/commit | Verificação |
|---|---|---|---|
| Ex.: rejeitar email duplicado | `TASK-DB-03` | hash ou referência do commit | teste de integração correspondente |

## Escopo obrigatório

### 1. Banco de dados

Crie uma tabela de usuários com, no mínimo, os seguintes campos:

| Campo | Tipo/Regra |
|---|---|
| `id` | UUID, chave primária |
| `name` | Texto, obrigatório |
| `email` | Texto, obrigatório e único |
| `created_at` | Data e hora de criação |
| `updated_at` | Data e hora da última atualização |

Requisitos:

- Use migrations para criar e alterar o schema.
- Crie um processo reproduzível de importação dos dados do arquivo [users.csv.gz](https://drive.google.com/file/d/1U7yhUrDGMvyKG1hldlVyboKpZN3xFq-p/view?usp=sharing).
- A importação deve lidar de forma explícita com registros inválidos e emails duplicados.
- Inclua os índices que considerar necessários e justifique decisões que não sejam óbvias.

### 2. API

Implemente os seguintes endpoints:

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/users` | Cadastrar um usuário |
| `GET` | `/users` | Listar e pesquisar usuários |
| `GET` | `/users/:id` | Buscar um usuário pelo ID |
| `PUT` ou `PATCH` | `/users/:id` | Atualizar um usuário |
| `DELETE` | `/users/:id` | Remover um usuário |
| `GET` | `/weather/:city` | Consultar o clima de uma cidade |

#### Listagem de usuários

O endpoint `GET /users` deve oferecer:

- filtro parcial por nome e email;
- paginação;
- ordenação por ao menos um campo;
- metadados suficientes para o frontend controlar a paginação.

#### Comportamento esperado da API

- Valide parâmetros, corpo das requisições e variáveis de ambiente.
- Use códigos HTTP coerentes.
- Retorne erros em um formato consistente, sem expor detalhes internos.
- Trate corretamente casos como usuário inexistente, email duplicado e identificador inválido.
- Documente o contrato da API com OpenAPI/Swagger ou uma alternativa equivalente.

### 3. Integração climática

O endpoint `GET /weather/:city` deve consultar uma API pública de clima, como WeatherAPI ou OpenWeather.

Requisitos:

- A chave da API não pode ser enviada ao navegador nem versionada no repositório.
- Trate timeout, cidade inexistente, limite de requisições e indisponibilidade do serviço externo.
- Converta a resposta externa para um contrato próprio e estável antes de retorná-la ao frontend.
- Implemente cache com expiração e documente a estratégia adotada. Uma solução em memória é suficiente para o teste.

### 4. Frontend

Crie uma aplicação React com as seguintes experiências:

- **Lista de usuários:** pesquisa por nome/email, ordenação e paginação.
- **Cadastro e edição:** formulário com validação e mensagens claras.
- **Detalhes do usuário:** visualização dos dados e possibilidade de editar ou excluir.
- **Clima:** busca por cidade e exibição de temperatura, umidade, condição atual e variação de temperatura ao longo do dia.

Requisitos:

- Use rotas navegáveis para as telas principais.
- Represente estados de carregamento, lista vazia e erro.
- Evite disparar uma requisição a cada tecla digitada na busca.
- Mantenha os filtros relevantes na URL para que a página possa ser recarregada ou compartilhada sem perder o contexto.
- A interface deve ser responsiva e utilizável por teclado.
- Use uma biblioteca de gráficos de sua escolha para a variação da temperatura.

Não é necessário criar um design sofisticado. Priorizamos clareza, consistência e boa experiência de uso.

### 5. Testes

Inclua testes automatizados que cubram os fluxos e regras mais importantes, incluindo ao menos:

- criação de usuário e rejeição de email duplicado;
- filtros e paginação da listagem;
- tratamento de falha da API climática;
- um fluxo relevante do frontend.

Não há meta obrigatória de cobertura. Avaliaremos a qualidade e a relevância dos cenários escolhidos, não apenas uma porcentagem.

### 6. Execução e documentação

A aplicação deve poder ser executada localmente com instruções claras.

Inclua no `README.md`:

- pré-requisitos e passos para executar backend, frontend, banco e testes;
- exemplo das variáveis de ambiente necessárias, sem valores secretos;
- como executar migrations e importar o CSV;
- decisões técnicas, simplificações e trade-offs;
- limitações conhecidas e o que você faria a seguir com mais tempo;
- link para o arquivo `AI_USAGE.md`.

Fornecer `docker compose` para o PostgreSQL é obrigatório. Executar toda a solução por containers é opcional.

## Restrições e expectativas

- Não implemente autenticação: ela está fora do escopo deste teste.
- Não é necessário publicar a aplicação na internet.
- Não é necessário usar Kubernetes, microsserviços, filas ou infraestrutura de nuvem.
- Evite abstrações sem uso concreto. Preferimos uma solução simples, consistente e bem explicada.
- Caso algum requisito seja ambíguo, registre sua interpretação e prossiga com uma decisão razoável.

## Critérios de avaliação

| Critério | Peso | O que será observado |
|---|---:|---|
| Funcionalidade e aderência | 15% | Fluxos obrigatórios completos e comportamento correto |
| Backend e dados | 15% | Modelagem, migrations, consultas, contrato e organização |
| Frontend e UX | 15% | Componentização, estado, formulários, responsividade e acessibilidade |
| Qualidade e manutenção | 15% | Clareza, coesão, tipagem, simplicidade e tratamento de erros |
| Testes e validação | 15% | Relevância dos cenários e evidências de que sugestões da IA foram verificadas |
| Uso crítico de IA | 12% | Contexto fornecido, escolha consciente de skills/workflows, revisão, correção e consciência das limitações |
| Spec-Driven Development | 8% | Qualidade e evolução das specs, rastreabilidade e aderência ao fluxo Specify → Plan → Tasks → Implement |
| Documentação e decisões | 5% | Facilidade de execução, trade-offs e comunicação técnica |

Uma entrega incompleta, mas executável, bem testada e transparente sobre seus limites pode ser melhor avaliada do que uma solução extensa e instável.

## Diferenciais opcionais

Os itens abaixo não compensam falhas no escopo obrigatório:

- teste ponta a ponta de um fluxo crítico;
- observabilidade básica, como logs estruturados e identificador de requisição;
- cancelamento de requisições obsoletas no frontend;
- otimização e medição do processo de importação para arquivos grandes;
- pipeline simples de integração contínua;
- deploy de demonstração.

## Entrega

Envie:

- link para um repositório Git acessível à equipe avaliadora, preferencialmente com histórico de commits; ou
- arquivo `.zip` contendo todo o código-fonte, caso o repositório não seja possível.

Não inclua `node_modules`, arquivos gerados, credenciais ou chaves de API.

## Conversa técnica

Após a entrega, poderá haver uma conversa curta sobre o teste. 
