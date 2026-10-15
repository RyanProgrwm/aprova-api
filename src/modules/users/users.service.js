import bcrypt from 'bcryptjs';
import { AppError } from '../../errors.js';

function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    approvalLevel: row.approval_level,
    createdAt: row.created_at,
  };
}

export function createUser(db, { name, email, password, role, approvalLevel }) {
  const exists = db.prepare('select 1 from users where email = ?').get(email);
  if (exists) throw new AppError(409, 'e-mail já cadastrado');

  const passwordHash = bcrypt.hashSync(password, 10);
  const { lastInsertRowid } = db
    .prepare('insert into users (name, email, password_hash, role, approval_level) values (?, ?, ?, ?, ?)')
    .run(name, email, passwordHash, role, role === 'approver' ? approvalLevel : null);

  return findUserById(db, Number(lastInsertRowid));
}

export function findUserById(db, id) {
  return toUser(db.prepare('select * from users where id = ?').get(id));
}

export function listUsers(db) {
  return db.prepare('select * from users order by id').all().map(toUser);
}

export function verifyCredentials(db, email, password) {
  const row = db.prepare('select * from users where email = ?').get(email);

  // mesma mensagem para e-mail inexistente e senha errada, para não revelar quais e-mails existem
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    throw new AppError(401, 'e-mail ou senha incorretos');
  }
  return toUser(row);
}
