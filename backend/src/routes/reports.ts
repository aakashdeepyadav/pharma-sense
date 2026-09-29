import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { AuthenticatedRequest } from '../auth';

const router = Router();

router.get('/summary', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const [medicines, suppliers, batches, transactions] = await Promise.all([
      prisma.medicine.findMany({ select: { id: true, genericName: true } }),
      prisma.supplier.count(),
      prisma.batch.findMany({ select: { quantity: true, purchasePrice: true } }),
      prisma.stockTransaction.findMany({
        where: { type: 'OUT' },
        select: { quantity: true, batch: { select: { medicineId: true } } },
      }),
    ]);

    const issuedByMedicine = new Map<number, number>();
    for (const transaction of transactions) {
      issuedByMedicine.set(
        transaction.batch.medicineId,
        (issuedByMedicine.get(transaction.batch.medicineId) ?? 0) + transaction.quantity,
      );
    }

    const topIssuedMedicines = medicines
      .map((medicine) => ({
        medicineId: medicine.id,
        medicineName: medicine.genericName,
        quantityIssued: issuedByMedicine.get(medicine.id) ?? 0,
      }))
      .filter((medicine) => medicine.quantityIssued > 0)
      .sort((first, second) => second.quantityIssued - first.quantityIssued)
      .slice(0, 5);

    res.json({
      success: true,
      data: {
        medicineCount: medicines.length,
        supplierCount: suppliers,
        batchCount: batches.length,
        totalUnits: batches.reduce((total, batch) => total + batch.quantity, 0),
        inventoryCost: batches.reduce((total, batch) => total + batch.quantity * batch.purchasePrice, 0),
        issuedUnits: transactions.reduce((total, transaction) => total + transaction.quantity, 0),
        topIssuedMedicines,
      },
    });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to calculate report summary' });
  }
});

export default router;