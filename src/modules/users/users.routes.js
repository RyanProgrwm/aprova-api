import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { createUser, listUsers } from './users.service.js';

const createUserSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).max(72),
    role: z.enum(['requester', 'approver', 'admin']),
    approvalLevel: z.number().int().min(1).max(3).optional(),
  })
  .refine((data) => data.role !== 'approver' || data.approvalLevel, {
    message: 'aprovador precisa de approvalLevel entre 1 e 3',
    path: ['approvalLevel'],
  });

export function userRoutes(db) {
  const router = Router();
  router.use(authenticate(db));

  router.get('/me', (req, res) => {
    res.json(req.user);
  });

  router.get('/', authorize('admin'), (req, res) => {
    res.json(listUsers(db));
  });

  router.post('/', authorize('admin'), (req, res) => {
    const user = createUser(db, createUserSchema.parse(req.body));
    res.status(201).json(user);
  });

  return router;
}
