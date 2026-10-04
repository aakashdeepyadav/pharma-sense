export type LedgerMovementType = 'IN' | 'OUT' | 'ADJ';

export interface BatchQuantitySnapshot {
  id: number;
  quantity: number;
}

export interface StockLedgerEntry {
  batchId: number;
  type: LedgerMovementType;
  quantity: number;
}

export interface StockDiscrepancy {
  batchId: number;
  batchQuantity: number;
  ledgerQuantity: number;
  difference: number;
}

export function reconcileBatchStock(
  batches: BatchQuantitySnapshot[],
  transactions: StockLedgerEntry[],
): StockDiscrepancy[] {
  const ledgerQuantities = new Map<number, number>();

  for (const transaction of transactions) {
    const delta = transaction.type === 'OUT' ? -transaction.quantity : transaction.quantity;
    ledgerQuantities.set(
      transaction.batchId,
      (ledgerQuantities.get(transaction.batchId) ?? 0) + delta,
    );
  }

  return batches.flatMap((batch) => {
    const ledgerQuantity = ledgerQuantities.get(batch.id) ?? 0;
    if (batch.quantity === ledgerQuantity) return [];

    return [{
      batchId: batch.id,
      batchQuantity: batch.quantity,
      ledgerQuantity,
      difference: batch.quantity - ledgerQuantity,
    }];
  });
}