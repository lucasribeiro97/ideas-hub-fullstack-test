# Ideas Hub — Teste Prático Fullstack

Aplicação fullstack para consulta e gerenciamento de usuários, com integração a um
serviço externo de informações climáticas.

> **Status:** em construção. Este README será preenchido conforme as fases do fluxo
> Specify → Plan → Tasks → Implement avançam.

## Estrutura do repositório

```
.
├── apps/
│   ├── api/    # Backend — Node.js + TypeScript + PostgreSQL
│   └── web/    # Frontend — React + TypeScript
├── tasks/      # Plano técnico e lista de tarefas
└── docs/       # Enunciado original do teste
```

Backend e frontend são projetos independentes, cada um com seu próprio
`package.json` e ciclo de instalação.

## Documentação

| Arquivo | Conteúdo |
|---|---|
| [`SPEC.md`](./SPEC.md) | Objetivo, stack, comandos, convenções, limites e critérios de sucesso |
| [`CAPABILITY_MAP.md`](./CAPABILITY_MAP.md) | Capacidades do sistema, responsabilidades e ordem de construção |
| [`tasks/plan.md`](./tasks/plan.md) | Plano técnico, riscos e checkpoints de validação |
| [`tasks/todo.md`](./tasks/todo.md) | Tarefas ordenadas, critérios de aceite e estado atual |
| [`AI_USAGE.md`](./AI_USAGE.md) | Registro do uso crítico de IA e rastreabilidade |

## Como executar

_A ser documentado: pré-requisitos, variáveis de ambiente, migrations, importação
do CSV, execução de backend, frontend e testes._
