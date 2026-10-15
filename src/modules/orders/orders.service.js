import { AppError } from '../../errors.js';
import { transaction } from '../../db.js';
import { assertCanDecide, requiredLevels } from './approval-rules.js';

function toOrder(row) {
  return {
    id: row.id,
    requesterId: row.requester_id,
    supplier: row.supplier,
    status: row.status,
    totalCents: row.total_cents,
    requiredLevels: row.required_levels,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function logEvent(db, orderId, userId, event, detail = null) {
  db.prepare('insert into order_events (order_id, user_id, event, detail) values (?, ?, ?, ?)')
    .run(orderId, userId, event, detail);
}

function setStatus(db, orderId, status) {
  db.prepare("update orders set status = ?, updated_at = datetime('now') where id = ?").run(status, orderId);
}

function loadOrder(db, user, id) {
  const row = db.prepare('select * from orders where id = ?').get(id);

  // solicitante só enxerga os próprios pedidos; devolve 404 para não revelar que o pedido existe
  if (!row || (user.role === 'requester' && row.requester_id !== user.id)) {
    throw new AppError(404, 'pedido não encontrado');
  }
  return toOrder(row);
}

function assertOwner(order, user) {
  if (order.requesterId !== user.id) {
    throw new AppError(403, 'apenas quem solicitou pode alterar o pedido');
  }
}

export function getOrder(db, user, id) {
  const order = loadOrder(db, user, id);

  const items = db
    .prepare('select id, description, quantity, unit_price_cents from order_items where order_id = ? order by id')
    .all(id)
    .map((row) => ({
      id: row.id,
      description: row.description,
      quantity: row.quantity,
      unitPriceCents: row.unit_price_cents,
      subtotalCents: row.quantity * row.unit_price_cents,
    }));

  const approvals = db
    .prepare(`
      select a.level, a.decision, a.comment, a.created_at, u.id as approver_id, u.name as approver_name
        from approvals a
        join users u on u.id = a.approver_id
       where a.order_id = ?
       order by a.level`)
    .all(id)
    .map((row) => ({
      level: row.level,
      decision: row.decision,
      comment: row.comment,
      approver: { id: row.approver_id, name: row.approver_name },
      createdAt: row.created_at,
    }));

  const history = db
    .prepare(`
      select e.event, e.detail, e.created_at, u.name as user_name
        from order_events e
        join users u on u.id = e.user_id
       where e.order_id = ?
       order by e.id`)
    .all(id)
    .map((row) => ({ event: row.event, detail: row.detail, user: row.user_name, createdAt: row.created_at }));

  return { ...order, items, approvals, history };
}

export function listOrders(db, user, { status, page, pageSize }) {
  const where = [];
  const params = [];

  if (user.role === 'requester') {
    where.push('requester_id = ?');
    params.push(user.id);
  }
  if (status) {
    where.push('status = ?');
    params.push(status);
  }

  const clause = where.length ? `where ${where.join(' and ')}` : '';
  const { total } = db.prepare(`select count(*) as total from orders ${clause}`).get(...params);
  const rows = db
    .prepare(`select * from orders ${clause} order by id desc limit ? offset ?`)
    .all(...params, pageSize, (page - 1) * pageSize);

  return { data: rows.map(toOrder), page, pageSize, total };
}

// fila do aprovador: pedidos pendentes cuja próxima etapa ele pode decidir
export function listAwaitingApproval(db, user) {
  return db
    .prepare(`
      select o.*
        from orders o
       where o.status = 'pending'
         and o.requester_id <> ?
         and (select count(*) from approvals a where a.order_id = o.id) + 1 <= ?
         and not exists (select 1 from approvals a where a.order_id = o.id and a.approver_id = ?)
       order by o.created_at, o.id`)
    .all(user.id, user.approvalLevel ?? 0, user.id)
    .map(toOrder);
}

export function createOrder(db, user, { supplier, items }) {
  const totalCents = items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);

  const orderId = transaction(db, () => {
    const { lastInsertRowid } = db
      .prepare('insert into orders (requester_id, supplier, total_cents, required_levels) values (?, ?, ?, ?)')
      .run(user.id, supplier, totalCents, requiredLevels(totalCents));
    const id = Number(lastInsertRowid);

    const insertItem = db.prepare(
      'insert into order_items (order_id, description, quantity, unit_price_cents) values (?, ?, ?, ?)',
    );
    for (const item of items) insertItem.run(id, item.description, item.quantity, item.unitPriceCents);

    logEvent(db, id, user.id, 'created');
    return id;
  });

  return getOrder(db, user, orderId);
}

export function submitOrder(db, user, id) {
  const order = loadOrder(db, user, id);
  assertOwner(order, user);
  if (order.status !== 'draft') {
    throw new AppError(409, `só pedido em rascunho pode ser enviado para aprovação (status atual: ${order.status})`);
  }

  transaction(db, () => {
    setStatus(db, id, 'pending');
    logEvent(db, id, user.id, 'submitted');
  });
  return getOrder(db, user, id);
}

export function cancelOrder(db, user, id) {
  const order = loadOrder(db, user, id);
  assertOwner(order, user);
  if (!['draft', 'pending'].includes(order.status)) {
    throw new AppError(409, `pedido ${order.status} não pode ser cancelado`);
  }

  transaction(db, () => {
    setStatus(db, id, 'cancelled');
    logEvent(db, id, user.id, 'cancelled');
  });
  return getOrder(db, user, id);
}

export function decideOrder(db, user, id, { decision, comment }) {
  const order = loadOrder(db, user, id);
  const approvals = db
    .prepare('select approver_id as approverId from approvals where order_id = ?')
    .all(id);
  const level = assertCanDecide({ order, approver: user, approvals });

  transaction(db, () => {
    db.prepare('insert into approvals (order_id, approver_id, level, decision, comment) values (?, ?, ?, ?, ?)')
      .run(id, user.id, level, decision, comment ?? null);

    if (decision === 'rejected') {
      setStatus(db, id, 'rejected');
      logEvent(db, id, user.id, 'rejected', `nível ${level}: ${comment}`);
      return;
    }

    logEvent(db, id, user.id, 'level_approved', `nível ${level} de ${order.requiredLevels}`);
    if (level === order.requiredLevels) {
      setStatus(db, id, 'approved');
      logEvent(db, id, user.id, 'approved');
    }
  });

  return getOrder(db, user, id);
}
