import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { orderOf, setup } from './helpers.js';

describe('pedidos de compra', () => {
  let ctx;
  before(() => {
    ctx = setup();
  });

  // cria o pedido como solicitante e já envia para aprovação
  async function pendingOrder(totalCents, who = 'ana') {
    const created = await ctx.as(who).post('/orders', orderOf(totalCents));
    const submitted = await ctx.as(who).post(`/orders/${created.body.id}/submit`);
    assert.equal(submitted.body.status, 'pending');
    return submitted.body;
  }

  it('cria pedido em rascunho calculando o total em centavos', async () => {
    const res = await ctx.as('ana').post('/orders', {
      supplier: 'Tech Distribuidora',
      items: [
        { description: 'notebook', quantity: 2, unitPriceCents: 450000 },
        { description: 'mouse', quantity: 3, unitPriceCents: 8990 },
      ],
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'draft');
    assert.equal(res.body.totalCents, 2 * 450000 + 3 * 8990);
    assert.equal(res.body.requiredLevels, 2);
    assert.equal(res.body.items.length, 2);
    assert.deepEqual(res.body.history.map((e) => e.event), ['created']);
  });

  it('recusa pedido sem itens e preço com centavos quebrados', async () => {
    const semItens = await ctx.as('ana').post('/orders', { supplier: 'Fornecedor', items: [] });
    assert.equal(semItens.status, 400);

    const precoQuebrado = await ctx.as('ana').post('/orders', {
      supplier: 'Fornecedor',
      items: [{ description: 'item', quantity: 1, unitPriceCents: 10.5 }],
    });
    assert.equal(precoQuebrado.status, 400);
    assert.equal(precoQuebrado.body.details[0].field, 'items.0.unitPriceCents');
  });

  it('aprova em 1 nível pedido de até R$ 5.000,00', async () => {
    const order = await pendingOrder(500_000);
    const res = await ctx.as('bruno').post(`/orders/${order.id}/approve`, { comment: 'ok' });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'approved');
    assert.equal(res.body.approvals[0].approver.name, 'Bruno');
  });

  it('pedido de 2 níveis só fecha depois da segunda aprovação', async () => {
    const order = await pendingOrder(1_000_000);

    const nivel1 = await ctx.as('bruno').post(`/orders/${order.id}/approve`);
    assert.equal(nivel1.body.status, 'pending');

    const nivel2 = await ctx.as('carla').post(`/orders/${order.id}/approve`);
    assert.equal(nivel2.body.status, 'approved');
    assert.deepEqual(nivel2.body.approvals.map((a) => a.level), [1, 2]);
    assert.deepEqual(
      nivel2.body.history.map((e) => e.event),
      ['created', 'submitted', 'level_approved', 'level_approved', 'approved'],
    );
  });

  it('aprovador de nível 1 não aprova a etapa 2', async () => {
    const order = await pendingOrder(1_000_000);
    await ctx.as('bruno').post(`/orders/${order.id}/approve`);

    const res = await ctx.as('beto').post(`/orders/${order.id}/approve`);
    assert.equal(res.status, 403);
    assert.match(res.body.error, /nível 2/);
  });

  it('o mesmo aprovador não decide duas etapas', async () => {
    const order = await pendingOrder(1_000_000);
    await ctx.as('carla').post(`/orders/${order.id}/approve`);

    const res = await ctx.as('carla').post(`/orders/${order.id}/approve`);
    assert.equal(res.status, 403);
  });

  it('aprovador não aprova o próprio pedido', async () => {
    const order = await pendingOrder(100_000, 'carla');
    const res = await ctx.as('carla').post(`/orders/${order.id}/approve`);
    assert.equal(res.status, 403);
  });

  it('solicitante não consegue aprovar', async () => {
    const order = await pendingOrder(100_000);
    const res = await ctx.as('ana').post(`/orders/${order.id}/approve`);
    assert.equal(res.status, 403);
    assert.match(res.body.error, /apenas aprovadores/);
  });

  it('reprovação exige motivo e encerra o pedido', async () => {
    const order = await pendingOrder(100_000);

    const semMotivo = await ctx.as('bruno').post(`/orders/${order.id}/reject`);
    assert.equal(semMotivo.status, 400);

    const res = await ctx.as('bruno').post(`/orders/${order.id}/reject`, { comment: 'fora do orçamento' });
    assert.equal(res.body.status, 'rejected');

    const depois = await ctx.as('carla').post(`/orders/${order.id}/approve`);
    assert.equal(depois.status, 409);
  });

  it('não aprova pedido ainda em rascunho', async () => {
    const created = await ctx.as('ana').post('/orders', orderOf(100_000));
    const res = await ctx.as('bruno').post(`/orders/${created.body.id}/approve`);
    assert.equal(res.status, 409);
  });

  it('cancela pedido pendente e não deixa enviar de novo', async () => {
    const order = await pendingOrder(100_000);

    const res = await ctx.as('ana').post(`/orders/${order.id}/cancel`);
    assert.equal(res.body.status, 'cancelled');

    const reenvio = await ctx.as('ana').post(`/orders/${order.id}/submit`);
    assert.equal(reenvio.status, 409);
  });

  it('solicitante não enxerga pedido de outro solicitante', async () => {
    const order = await pendingOrder(100_000, 'ana');

    const res = await ctx.as('rita').get(`/orders/${order.id}`);
    assert.equal(res.status, 404);

    const lista = await ctx.as('rita').get('/orders');
    assert.ok(lista.body.data.every((o) => o.requesterId === ctx.users.rita.id));
  });

  it('fila do aprovador traz só o que ele pode decidir', async () => {
    const umNivel = await pendingOrder(100_000);
    const doisNiveis = await pendingOrder(1_000_000);
    await ctx.as('bruno').post(`/orders/${doisNiveis.id}/approve`);

    const filaBeto = await ctx.as('beto').get('/orders/awaiting-my-approval');
    const idsBeto = filaBeto.body.map((o) => o.id);
    assert.ok(idsBeto.includes(umNivel.id));
    assert.ok(!idsBeto.includes(doisNiveis.id), 'etapa 2 exige nível 2');

    const filaCarla = await ctx.as('carla').get('/orders/awaiting-my-approval');
    assert.ok(filaCarla.body.map((o) => o.id).includes(doisNiveis.id));
  });

  it('filtra e pagina a listagem', async () => {
    const res = await ctx.as('admin').get('/orders?status=approved&page=1&pageSize=1');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.pageSize, 1);
    assert.ok(res.body.total >= 2);
    assert.ok(res.body.data.every((o) => o.status === 'approved'));
  });

  it('id inválido na rota devolve 400', async () => {
    const res = await ctx.as('ana').get('/orders/abc');
    assert.equal(res.status, 400);
  });
});
