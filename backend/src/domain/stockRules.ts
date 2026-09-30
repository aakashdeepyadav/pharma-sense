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
  return expiryDate.getTime() <= now.getTime();
}