import { z } from 'zod'

/**
 * Formato de erro da API (SPEC §6), para a documentação.
 *
 * Declarado aqui, e não repetido em cada rota, para que o contrato documentado
 * não possa divergir entre endpoints — era o risco de descrever o envelope
 * separadamente em seis lugares.
 */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string().meta({ description: 'Código estável do catálogo da §6.' }),
    message: z.string().meta({ description: 'Mensagem destinada a quem consome a API.' }),
    details: z
      .array(z.object({ field: z.string(), message: z.string() }))
      .optional()
      .meta({ description: 'Presente apenas em erros de validação.' }),
  }),
})

/** Respostas de erro comuns a qualquer rota com parâmetro na URL. */
export const commonErrorResponses = {
  400: errorResponseSchema.meta({ description: 'Parâmetro de rota ou query malformado.' }),
  500: errorResponseSchema.meta({ description: 'Falha não prevista.' }),
}

export const notFoundResponse = {
  404: errorResponseSchema.meta({ description: 'Usuário inexistente.' }),
}

export const validationResponse = {
  422: errorResponseSchema.meta({ description: 'Corpo bem formado que viola as regras.' }),
}

export const conflictResponse = {
  409: errorResponseSchema.meta({ description: 'Email já usado por outro usuário.' }),
}

/**
 * Resposta 204, que por definição não tem corpo.
 *
 * Precisa ser declarada mesmo assim: sem ela, o provedor de tipos não conhece
 * o status de sucesso da rota e passa a exigir um corpo no `send()`.
 */
export const noContentResponse = {
  204: z.void().meta({ description: 'Removido com sucesso. Sem corpo.' }),
}
