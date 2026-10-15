import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';
import { openapi } from './docs/openapi.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { orderRoutes } from './modules/orders/orders.routes.js';
import { userRoutes } from './modules/users/users.routes.js';

// mensagens de validação em português
z.config(z.locales.pt());

export function createApp({ db }) {
  const app = express();

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/auth', authRoutes(db));
  app.use('/users', userRoutes(db));
  app.use('/orders', orderRoutes(db));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
