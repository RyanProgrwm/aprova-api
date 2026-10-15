import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'rota não encontrada' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: 'dados inválidos',
      details: error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  if (error instanceof AppError) {
    return res.status(error.status).json({ error: error.message });
  }

  // corpo da requisição que não é json válido
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'json inválido no corpo da requisição' });
  }

  console.error(error);
  return res.status(500).json({ error: 'erro interno' });
}
