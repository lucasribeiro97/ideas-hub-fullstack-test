import type { FastifyInstance } from 'fastify'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { jsonSchemaTransform } from 'fastify-type-provider-zod'

export const DOCS_ROUTE = '/docs'

/**
 * Documentação OpenAPI (TASK-DOC-01).
 *
 * O contrato é derivado dos mesmos schemas Zod que validam as requisições, e
 * não escrito à parte. A diferença importa: documentação mantida em paralelo
 * ao código envelhece em silêncio — aqui, mudar a validação muda a
 * documentação na mesma edição, e é impossível que divirjam.
 */
export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Ideas Hub — API de usuários e clima',
        version: '0.1.0',
        description: [
          'Gerenciamento de usuários e consulta climática.',
          '',
          'Todos os erros seguem o mesmo envelope `{ error: { code, message, details? } }`.',
          'O `code` é estável e é por ele que o cliente decide o que exibir —',
          'a `message` pode mudar de redação sem aviso.',
          '',
          'Sem autenticação: está fora do escopo deste projeto.',
        ].join('\n'),
      },
      tags: [
        { name: 'users', description: 'Cadastro, busca e manutenção de usuários.' },
        { name: 'weather', description: 'Consulta climática com cache e tolerância a falha.' },
        { name: 'health', description: 'Sonda de disponibilidade do processo.' },
      ],
    },
    transform: jsonSchemaTransform,
  })

  await app.register(swaggerUi, {
    routePrefix: DOCS_ROUTE,
    uiConfig: {
      // Endpoints abertos por padrão: são seis, e exigir um clique para ver
      // cada um atrapalha mais do que organiza.
      docExpansion: 'list',
      deepLinking: true,
    },
  })
}
