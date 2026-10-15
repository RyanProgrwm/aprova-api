import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertCanDecide, requiredLevels } from '../src/modules/orders/approval-rules.js';

describe('requiredLevels', () => {
  it('exige 1 nível até R$ 5.000,00, inclusive', () => {
    assert.equal(requiredLevels(0), 1);
    assert.equal(requiredLevels(500_000), 1);
  });

  it('exige 2 níveis acima de R$ 5.000,00 até R$ 50.000,00', () => {
    assert.equal(requiredLevels(500_001), 2);
    assert.equal(requiredLevels(5_000_000), 2);
  });

  it('exige 3 níveis acima de R$ 50.000,00', () => {
    assert.equal(requiredLevels(5_000_001), 3);
  });
});

describe('assertCanDecide', () => {
  const order = { requesterId: 1, status: 'pending', requiredLevels: 2 };
  const approver = { id: 2, role: 'approver', approvalLevel: 1 };

  it('devolve o nível da próxima etapa', () => {
    assert.equal(assertCanDecide({ order, approver, approvals: [] }), 1);
  });

  it('barra quem não é aprovador', () => {
    assert.throws(
      () => assertCanDecide({ order, approver: { ...approver, role: 'requester' }, approvals: [] }),
      { status: 403 },
    );
  });

  it('barra pedido que não está pendente', () => {
    assert.throws(
      () => assertCanDecide({ order: { ...order, status: 'draft' }, approver, approvals: [] }),
      { status: 409 },
    );
  });

  it('barra o próprio solicitante', () => {
    assert.throws(
      () => assertCanDecide({ order: { ...order, requesterId: 2 }, approver, approvals: [] }),
      { status: 403 },
    );
  });

  it('barra quem já decidiu uma etapa', () => {
    assert.throws(
      () => assertCanDecide({ order, approver: { ...approver, approvalLevel: 3 }, approvals: [{ approverId: 2 }] }),
      { status: 403 },
    );
  });

  it('barra aprovador com nível abaixo da etapa', () => {
    assert.throws(() => assertCanDecide({ order, approver, approvals: [{ approverId: 9 }] }), {
      status: 403,
    });
  });
});
