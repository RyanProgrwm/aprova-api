import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// valores monetários ficam em centavos (inteiro) para não sofrer com arredondamento de float
const schema = `
  create table if not exists users (
    id             integer primary key autoincrement,
    name           text    not null,
    email          text    not null unique,
    password_hash  text    not null,
    role           text    not null check (role in ('requester', 'approver', 'admin')),
    approval_level integer check (approval_level between 1 and 3),
    created_at     text    not null default (datetime('now'))
  );

  create table if not exists orders (
    id              integer primary key autoincrement,
    requester_id    integer not null references users (id),
    supplier        text    not null,
    status          text    not null default 'draft'
                    check (status in ('draft', 'pending', 'approved', 'rejected', 'cancelled')),
    total_cents     integer not null check (total_cents >= 0),
    required_levels integer not null check (required_levels between 1 and 3),
    created_at      text    not null default (datetime('now')),
    updated_at      text    not null default (datetime('now'))
  );

  create table if not exists order_items (
    id               integer primary key autoincrement,
    order_id         integer not null references orders (id) on delete cascade,
    description      text    not null,
    quantity         integer not null check (quantity > 0),
    unit_price_cents integer not null check (unit_price_cents >= 0)
  );

  create table if not exists approvals (
    id          integer primary key autoincrement,
    order_id    integer not null references orders (id) on delete cascade,
    approver_id integer not null references users (id),
    level       integer not null,
    decision    text    not null check (decision in ('approved', 'rejected')),
    comment     text,
    created_at  text    not null default (datetime('now')),
    unique (order_id, level),
    unique (order_id, approver_id)
  );

  create table if not exists order_events (
    id         integer primary key autoincrement,
    order_id   integer not null references orders (id) on delete cascade,
    user_id    integer not null references users (id),
    event      text    not null,
    detail     text,
    created_at text    not null default (datetime('now'))
  );

  create index if not exists ix_orders_status on orders (status);
  create index if not exists ix_orders_requester on orders (requester_id);
`;

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  const db = new DatabaseSync(path);
  db.exec('pragma foreign_keys = on;');
  db.exec(schema);
  return db;
}

// executa fn dentro de uma transação; qualquer erro desfaz tudo
export function transaction(db, fn) {
  db.exec('begin');
  try {
    const result = fn();
    db.exec('commit');
    return result;
  } catch (error) {
    db.exec('rollback');
    throw error;
  }
}
