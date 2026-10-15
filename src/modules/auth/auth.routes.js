import { Router } from 'express';
import { z } from 'zod';
import { login } from './auth.service.js';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
});

export function authRoutes(db) {
  const router = Router();

  router.post('/login', (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    res.json(login(db, email, password));
  });

  return router;
}
