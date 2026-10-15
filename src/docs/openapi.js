const errorResponse = (description) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

const orderResponse = {
  description: 'pedido com itens, aprovações e histórico',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderDetail' } } },
};

const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer' } };

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Aprova API',
    version: '1.0.0',
    description:
      'pedidos de compra com fluxo de aprovação em níveis por faixa de valor. ' +
      'faça login em /auth/login, copie o token e clique em "Authorize".',
  },
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'string' } } },
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          email: { type: 'string' },
          role: { type: 'string', enum: ['requester', 'approver', 'admin'] },
          approvalLevel: { type: 'integer', nullable: true, minimum: 1, maximum: 3 },
        },
      },
      ItemInput: {
        type: 'object',
        required: ['description', 'quantity', 'unitPriceCents'],
        properties: {
          description: { type: 'string', example: 'notebook 14"' },
          quantity: { type: 'integer', minimum: 1, example: 2 },
          unitPriceCents: { type: 'integer', minimum: 0, example: 450000, description: 'preço em centavos' },
        },
      },
      Order: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          requesterId: { type: 'integer' },
          supplier: { type: 'string' },
          status: { type: 'string', enum: ['draft', 'pending', 'approved', 'rejected', 'cancelled'] },
          totalCents: { type: 'integer' },
          requiredLevels: { type: 'integer' },
          createdAt: { type: 'string' },
          updatedAt: { type: 'string' },
        },
      },
      OrderDetail: {
        allOf: [
          { $ref: '#/components/schemas/Order' },
          {
            type: 'object',
            properties: {
              items: { type: 'array', items: { type: 'object' } },
              approvals: { type: 'array', items: { type: 'object' } },
              history: { type: 'array', items: { type: 'object' } },
            },
          },
        ],
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': {
      get: { tags: ['infra'], summary: 'verifica se a api está no ar', security: [], responses: { 200: { description: 'ok' } } },
    },
    '/auth/login': {
      post: {
        tags: ['auth'],
        summary: 'autentica e devolve o token jwt',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', example: 'ana@aprova.dev' },
                  password: { type: 'string', example: 'senha12345' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'token e usuário' }, 401: errorResponse('credenciais inválidas') },
      },
    },
    '/users/me': {
      get: { tags: ['users'], summary: 'usuário autenticado', responses: { 200: { description: 'usuário' } } },
    },
    '/users': {
      get: { tags: ['users'], summary: 'lista usuários (admin)', responses: { 200: { description: 'usuários' } } },
      post: {
        tags: ['users'],
        summary: 'cadastra usuário (admin)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password', 'role'],
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string' },
                  password: { type: 'string', minLength: 8 },
                  role: { type: 'string', enum: ['requester', 'approver', 'admin'] },
                  approvalLevel: { type: 'integer', minimum: 1, maximum: 3 },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'usuário criado' }, 409: errorResponse('e-mail já cadastrado') },
      },
    },
    '/orders': {
      get: {
        tags: ['orders'],
        summary: 'lista pedidos (solicitante vê só os próprios)',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { 200: { description: 'página de pedidos' } },
      },
      post: {
        tags: ['orders'],
        summary: 'cria pedido em rascunho',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['supplier', 'items'],
                properties: {
                  supplier: { type: 'string', example: 'tech distribuidora ltda' },
                  items: { type: 'array', items: { $ref: '#/components/schemas/ItemInput' } },
                },
              },
            },
          },
        },
        responses: { 201: orderResponse, 400: errorResponse('dados inválidos') },
      },
    },
    '/orders/awaiting-my-approval': {
      get: { tags: ['orders'], summary: 'fila do aprovador logado', responses: { 200: { description: 'pedidos' } } },
    },
    '/orders/{id}': {
      get: { tags: ['orders'], summary: 'detalhe do pedido', parameters: [idParam], responses: { 200: orderResponse, 404: errorResponse('não encontrado') } },
    },
    '/orders/{id}/submit': {
      post: { tags: ['orders'], summary: 'envia o rascunho para aprovação', parameters: [idParam], responses: { 200: orderResponse, 409: errorResponse('status não permite') } },
    },
    '/orders/{id}/cancel': {
      post: { tags: ['orders'], summary: 'cancela pedido em rascunho ou pendente', parameters: [idParam], responses: { 200: orderResponse, 409: errorResponse('status não permite') } },
    },
    '/orders/{id}/approve': {
      post: {
        tags: ['orders'],
        summary: 'aprova a próxima etapa',
        parameters: [idParam],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { comment: { type: 'string' } } } } } },
        responses: { 200: orderResponse, 403: errorResponse('sem alçada ou segregação de funções'), 409: errorResponse('pedido não está pendente') },
      },
    },
    '/orders/{id}/reject': {
      post: {
        tags: ['orders'],
        summary: 'reprova o pedido (motivo obrigatório)',
        parameters: [idParam],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['comment'], properties: { comment: { type: 'string' } } } } },
        },
        responses: { 200: orderResponse, 400: errorResponse('motivo não informado'), 403: errorResponse('sem alçada') },
      },
    },
  },
};
