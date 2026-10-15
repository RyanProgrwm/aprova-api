import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middlewares/auth.js';
import {
  cancelOrder,
  createOrder,
  decideOrder,
  getOrder,
  listAwaitingApproval,
  listOrders,
  submitOrder,
} from './orders.service.js';

const itemSchema = z.object({
  description: z.string().trim().min(1).max(200),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
});

const createOrderSchema = z.object({
  supplier: z.string().trim().min(2).max(120),
  items: z.array(itemSchema).min(1).max(100),
});

const listSchema = z.object({
  status: z.enum(['draft', 'pending', 'approved', 'rejected', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const approveSchema = z.object({
  comment: z.string().trim().max(500).optional(),
});

// reprovação sem justificativa não ajuda ninguém a corrigir o pedido
const rejectSchema = z.object({
  comment: z.string().trim().min(3, 'informe o motivo da reprovação').max(500),
});

const idSchema = z.coerce.number().int().positive();

export function orderRoutes(db) {
  const router = Router();
  router.use(authenticate(db));

  router.get('/', (req, res) => {
    res.json(listOrders(db, req.user, listSchema.parse(req.query)));
  });

  router.get('/awaiting-my-approval', authorize('approver'), (req, res) => {
    res.json(listAwaitingApproval(db, req.user));
  });

  router.post('/', (req, res) => {
    res.status(201).json(createOrder(db, req.user, createOrderSchema.parse(req.body)));
  });

  router.get('/:id', (req, res) => {
    res.json(getOrder(db, req.user, idSchema.parse(req.params.id)));
  });

  router.post('/:id/submit', (req, res) => {
    res.json(submitOrder(db, req.user, idSchema.parse(req.params.id)));
  });

  router.post('/:id/cancel', (req, res) => {
    res.json(cancelOrder(db, req.user, idSchema.parse(req.params.id)));
  });

  router.post('/:id/approve', (req, res) => {
    const { comment } = approveSchema.parse(req.body ?? {});
    res.json(decideOrder(db, req.user, idSchema.parse(req.params.id), { decision: 'approved', comment }));
  });

  router.post('/:id/reject', (req, res) => {
    const { comment } = rejectSchema.parse(req.body ?? {});
    res.json(decideOrder(db, req.user, idSchema.parse(req.params.id), { decision: 'rejected', comment }));
  });

  return router;
}
