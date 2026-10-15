import { AppError } from '../../errors.js';

// faixas de valor: quanto maior o pedido, mais níveis de aprovação ele exige
export const approvalTiers = [
  { upToCents: 500_000, levels: 1 }, // até R$ 5.000,00
  { upToCents: 5_000_000, levels: 2 }, // até R$ 50.000,00
  { upToCents: Infinity, levels: 3 }, // acima de R$ 50.000,00
];

export function requiredLevels(totalCents) {
  return approvalTiers.find((tier) => totalCents <= tier.upToCents).levels;
}

// valida se o aprovador pode decidir a próxima etapa e devolve o nível dessa etapa
export function assertCanDecide({ order, approver, approvals }) {
  if (approver.role !== 'approver') {
    throw new AppError(403, 'apenas aprovadores podem decidir pedidos');
  }
  if (order.status !== 'pending') {
    throw new AppError(409, `pedido não está aguardando aprovação (status atual: ${order.status})`);
  }

  // segregação de funções: quem pede não aprova
  if (order.requesterId === approver.id) {
    throw new AppError(403, 'quem solicitou o pedido não pode aprová-lo');
  }
  if (approvals.some((approval) => approval.approverId === approver.id)) {
    throw new AppError(403, 'você já aprovou uma etapa deste pedido');
  }

  const level = approvals.length + 1;
  if (approver.approvalLevel < level) {
    throw new AppError(403, `esta etapa exige aprovador de nível ${level} ou superior`);
  }
  return level;
}
