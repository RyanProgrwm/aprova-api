// popula o banco com usuários e pedidos de exemplo para testar a api na hora
import { config } from '../src/config.js';
import { openDatabase } from '../src/db.js';
import { createOrder, submitOrder } from '../src/modules/orders/orders.service.js';
import { createUser } from '../src/modules/users/users.service.js';

const db = openDatabase(config.databasePath);

const alreadySeeded = db.prepare('select 1 from users limit 1').get();
if (alreadySeeded) {
  console.log('o banco já tem dados; apague a pasta data/ para recriar do zero');
  process.exit(0);
}

const password = 'senha12345';
const users = [
  { name: 'Admin', email: 'admin@aprova.dev', role: 'admin' },
  { name: 'Ana Souza', email: 'ana@aprova.dev', role: 'requester' },
  { name: 'Bruno Lima', email: 'bruno@aprova.dev', role: 'approver', approvalLevel: 1 },
  { name: 'Carla Mendes', email: 'carla@aprova.dev', role: 'approver', approvalLevel: 2 },
  { name: 'Diego Rocha', email: 'diego@aprova.dev', role: 'approver', approvalLevel: 3 },
].map((user) => createUser(db, { ...user, password }));

const ana = users.find((user) => user.email === 'ana@aprova.dev');

createOrder(db, ana, {
  supplier: 'Papelaria Central',
  items: [{ description: 'resma de papel a4', quantity: 10, unitPriceCents: 2890 }],
});

const notebooks = createOrder(db, ana, {
  supplier: 'Tech Distribuidora',
  items: [
    { description: 'notebook 14"', quantity: 3, unitPriceCents: 450000 },
    { description: 'monitor 27"', quantity: 3, unitPriceCents: 159000 },
  ],
});
submitOrder(db, ana, notebooks.id);

console.log(`usuários criados (senha de todos: ${password}):`);
for (const user of users) {
  const level = user.approvalLevel ? ` nível ${user.approvalLevel}` : '';
  console.log(`  ${user.email.padEnd(20)} ${user.role}${level}`);
}
console.log('pedidos criados: 1 rascunho e 1 aguardando aprovação em 2 níveis');
