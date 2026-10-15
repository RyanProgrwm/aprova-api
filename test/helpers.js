import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { createUser } from '../src/modules/users/users.service.js';

// cada suíte ganha um banco em memória isolado, com um usuário de cada perfil
export function setup() {
  const db = openDatabase(':memory:');
  const app = createApp({ db });
  const password = 'senha12345';

  const users = {
    admin: createUser(db, { name: 'Admin', email: 'admin@teste.dev', password, role: 'admin' }),
    ana: createUser(db, { name: 'Ana', email: 'ana@teste.dev', password, role: 'requester' }),
    rita: createUser(db, { name: 'Rita', email: 'rita@teste.dev', password, role: 'requester' }),
    bruno: createUser(db, { name: 'Bruno', email: 'bruno@teste.dev', password, role: 'approver', approvalLevel: 1 }),
    beto: createUser(db, { name: 'Beto', email: 'beto@teste.dev', password, role: 'approver', approvalLevel: 1 }),
    carla: createUser(db, { name: 'Carla', email: 'carla@teste.dev', password, role: 'approver', approvalLevel: 2 }),
  };

  // atalho: as('ana').post('/orders') já sai com o token da ana
  const as = (who) => {
    const auth = { Authorization: `Bearer ${signToken(users[who])}` };
    return {
      get: (url) => request(app).get(url).set(auth),
      post: (url, body = {}) => request(app).post(url).set(auth).send(body),
    };
  };

  return { app, db, users, password, as };
}

// pedido de um item só, com o total desejado em centavos
export function orderOf(totalCents) {
  return {
    supplier: 'Fornecedor Teste',
    items: [{ description: 'item', quantity: 1, unitPriceCents: totalCents }],
  };
}
