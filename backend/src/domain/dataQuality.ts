export interface BatchQualityRecord {
  id: number;
  medicineId: number;
  batchNumber: string;
  mfgDate: Date | null;
  expiryDate: Date | null;
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
}

export interface PurchaseItemQualityRecord {
  id: number;
  mfgDate: Date | null;
  expiryDate: Date | null;
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
}

export interface TransactionQualityRecord {
  id: number;
  timestamp: Date | null;
  type: string;
  quantity: number;
}

export interface QualityFinding {
  code: string;
  entityId: number;
}

export interface InventoryQualityReport {
  errors: QualityFinding[];
  warnings: QualityFinding[];
}

function isValidDate(value: Date | null): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function isValidPrice(value: number) {
  const cents = value * 100;
  const precisionTolerance = Number.EPSILON * Math.max(1, Math.abs(cents)) * 2;
  return Number.isFinite(value)
    && value >= 0
    && value <= 9_999_999_999.99
    && Math.abs(cents - Math.round(cents)) < precisionTolerance;
}

export function inspectInventoryQuality(
  batches: BatchQualityRecord[],
  purchaseItems: PurchaseItemQualityRecord[],
  transactions: TransactionQualityRecord[],
  now = new Date(),
): InventoryQualityReport {
  const errors: QualityFinding[] = [];
  const warnings: QualityFinding[] = [];
  const batchKeys = new Map<string, number>();

  for (const batch of batches) {
    const batchKey = `${batch.medicineId}:${batch.batchNumber}`;
    const firstBatchId = batchKeys.get(batchKey);
    if (firstBatchId !== undefined) errors.push({ code: 'DUPLICATE_BATCH', entityId: batch.id });
    else batchKeys.set(batchKey, batch.id);

    if (!isValidDate(batch.mfgDate) || !isValidDate(batch.expiryDate)) {
      errors.push({ code: 'BATCH_MISSING_OR_INVALID_DATE', entityId: batch.id });
    } else if (batch.expiryDate <= batch.mfgDate) {
      errors.push({ code: 'BATCH_INVALID_DATE_ORDER', entityId: batch.id });
    }
    if (!Number.isInteger(batch.quantity) || batch.quantity < 0) {
      errors.push({ code: 'BATCH_INVALID_QUANTITY', entityId: batch.id });
    }
    if (!isValidPrice(batch.purchasePrice) || !isValidPrice(batch.sellingPrice)) {
      errors.push({ code: 'BATCH_INVALID_PRICE', entityId: batch.id });
    }
    if (isValidDate(batch.expiryDate) && batch.expiryDate < now && batch.quantity > 0) {
      warnings.push({ code: 'EXPIRED_BATCH_HAS_STOCK', entityId: batch.id });
    }
  }

  for (const item of purchaseItems) {
    if (!isValidDate(item.mfgDate) || !isValidDate(item.expiryDate)) {
      errors.push({ code: 'PURCHASE_ITEM_MISSING_OR_INVALID_DATE', entityId: item.id });
    } else if (item.expiryDate <= item.mfgDate) {
      errors.push({ code: 'PURCHASE_ITEM_INVALID_DATE_ORDER', entityId: item.id });
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      errors.push({ code: 'PURCHASE_ITEM_INVALID_QUANTITY', entityId: item.id });
    }
    if (!isValidPrice(item.purchasePrice) || !isValidPrice(item.sellingPrice)) {
      errors.push({ code: 'PURCHASE_ITEM_INVALID_PRICE', entityId: item.id });
    }
  }

  for (const transaction of transactions) {
    if (!isValidDate(transaction.timestamp)) {
      errors.push({ code: 'TRANSACTION_MISSING_OR_INVALID_DATE', entityId: transaction.id });
    }
    const validQuantity = transaction.type === 'IN'
      ? Number.isInteger(transaction.quantity) && transaction.quantity >= 0
      : transaction.type === 'OUT'
        ? Number.isInteger(transaction.quantity) && transaction.quantity > 0
        : transaction.type === 'ADJ'
          ? Number.isInteger(transaction.quantity) && transaction.quantity !== 0
          : false;
    if (!validQuantity) errors.push({ code: 'TRANSACTION_INVALID_TYPE_OR_QUANTITY', entityId: transaction.id });
  }

  return { errors, warnings };
}