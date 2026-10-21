export type StockMovementType = 'OUT' | 'ADJ';

export function calculateStockDelta(type: StockMovementType, quantity: number) {
  return type === 'OUT' ? -quantity : quantity;
}

export function minimumQuantityForDelta(delta: number) {
  return delta < 0 ? Math.abs(delta) : 0;
}

export function canApplyStockDelta(currentQuantity: number, delta: number) {
  return currentQuantity + delta >= 0;
}

export function isBatchExpired(expiryDate: Date, now = new Date()) {
  const expiryDay = Date.UTC(expiryDate.getUTCFullYear(), expiryDate.getUTCMonth(), expiryDate.getUTCDate());
  const currentDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return expiryDay < currentDay;
}

export function availableStock(
  batches: Array<{ quantity: number; expiryDate: Date }>,
  now = new Date(),
) {
  return batches.reduce(
    (total, batch) => total + (isBatchExpired(batch.expiryDate, now) ? 0 : batch.quantity),
    0,
  );
}
