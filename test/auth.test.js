import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import request from 'supertest';
import { setup } from './helpers.js';

describe('autenticação e usuários', () => {
  let ctx;
  before(() => {
    ctx = setup();
  });

  it('faz login e devolve token e usuário', async () => {
    const res = await request(ctx.app)
      .post('/auth/login')
      .send({ email: 'ANA@teste.dev', password: ctx.password });

    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.email, 'ana@teste.dev');
    assert.equal(res.body.user.passwordHash, undefined);
  });

  it('recusa senha errada com 401', async () => {
    const res = await request(ctx.app)
      .post('/auth/login')
      .send({ email: 'ana@teste.dev', password: 'errada' });
    assert.equal(res.status, 401);
  });

  it('recusa rota protegida sem token', async () => {
    const res = await request(ctx.app).get('/orders');
    assert.equal(res.status, 401);
  });

  it('recusa token adulterado', async () => {
    const res = await request(ctx.app).get('/orders').set('Authorization', 'Bearer abc.def.ghi');
    assert.equal(res.status, 401);
  });

  it('admin cadastra aprovador', async () => {
    const res = await ctx.as('admin').post('/users', {
      name: 'Nova Aprovadora',
      email: 'nova@teste.dev',
      password: 'senha12345',
      role: 'approver',
      approvalLevel: 3,
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.approvalLevel, 3);
  });

  it('exige approvalLevel ao cadastrar aprovador', async () => {
    const res = await ctx.as('admin').post('/users', {
      name: 'Sem Nível',
      email: 'semnivel@teste.dev',
      password: 'senha12345',
      role: 'approver',
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.details[0].field, 'approvalLevel');
  });

  it('recusa e-mail duplicado com 409', async () => {
    const res = await ctx.as('admin').post('/users', {
      name: 'Ana de Novo',
      email: 'ana@teste.dev',
      password: 'senha12345',
      role: 'requester',
    });
    assert.equal(res.status, 409);
  });

  it('só admin cadastra usuário', async () => {
    const res = await ctx.as('ana').post('/users', {});
    assert.equal(res.status, 403);
  });
});
