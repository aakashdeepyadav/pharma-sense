import prisma from '../lib/prisma';
import { reconcileBatchStock, type LedgerMovementType } from '../domain/reconciliation';

function isLedgerMovementType(type: string): type is LedgerMovementType {
  return type === 'IN' || type === 'OUT' || type === 'ADJ';
}

async function reconcile() {
  const [batches, transactions] = await Promise.all([
    prisma.batch.findMany({ select: { id: true, quantity: true } }),
    prisma.stockTransaction.findMany({ select: { id: true, batchId: true, type: true, quantity: true } }),
  ]);
  const unsupportedMovements = transactions
    .filter((transaction) => !isLedgerMovementType(transaction.type))
    .map(({ id, type }) => ({ transactionId: id, type }));
  const ledger = transactions.flatMap(({ batchId, type, quantity }) =>
    isLedgerMovementType(type) ? [{ batchId, type, quantity }] : [],
  );
  const discrepancies = reconcileBatchStock(batches, ledger);
  const report = {
    generatedAt: new Date().toISOString(),
    batchCount: batches.length,
    transactionCount: transactions.length,
    discrepancyCount: discrepancies.length,
    unsupportedMovementCount: unsupportedMovements.length,
    discrepancies,
    unsupportedMovements,
    modifiedData: false,
  };

  console.log(JSON.stringify(report, null, 2));
  if (discrepancies.length > 0 || unsupportedMovements.length > 0) process.exitCode = 1;
}

reconcile()
  .catch((error) => {
    console.error('Stock reconciliation failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });