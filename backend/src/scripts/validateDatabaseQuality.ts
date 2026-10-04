import prisma from '../lib/prisma';
import { inspectInventoryQuality } from '../domain/dataQuality';

async function validateDatabase() {
  const [batchRows, purchaseItemRows, transactions] = await Promise.all([
    prisma.batch.findMany({
      select: {
        id: true,
        medicineId: true,
        batchNumber: true,
        mfgDate: true,
        expiryDate: true,
        quantity: true,
        purchasePrice: true,
        sellingPrice: true,
      },
    }),
    prisma.purchaseItem.findMany({
      select: {
        id: true,
        mfgDate: true,
        expiryDate: true,
        quantity: true,
        purchasePrice: true,
        sellingPrice: true,
      },
    }),
    prisma.stockTransaction.findMany({
      select: { id: true, timestamp: true, type: true, quantity: true },
    }),
  ]);
  const batches = batchRows.map((batch) => ({
    ...batch,
    purchasePrice: batch.purchasePrice.toNumber(),
    sellingPrice: batch.sellingPrice.toNumber(),
  }));
  const purchaseItems = purchaseItemRows.map((item) => ({
    ...item,
    purchasePrice: item.purchasePrice.toNumber(),
    sellingPrice: item.sellingPrice.toNumber(),
  }));
  const quality = inspectInventoryQuality(batches, purchaseItems, transactions);
  const report = {
    generatedAt: new Date().toISOString(),
    batchCount: batches.length,
    purchaseItemCount: purchaseItems.length,
    transactionCount: transactions.length,
    errorCount: quality.errors.length,
    warningCount: quality.warnings.length,
    status: quality.errors.length > 0 ? 'FAIL' : quality.warnings.length > 0 ? 'PASS_WITH_WARNINGS' : 'PASS',
    errors: quality.errors,
    warnings: quality.warnings,
    modifiedData: false,
  };

  console.log(JSON.stringify(report, null, 2));
  if (quality.errors.length > 0) process.exitCode = 1;
}

validateDatabase()
  .catch((error) => {
    console.error('Database quality validation failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });