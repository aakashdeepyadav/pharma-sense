import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();
const EXPIRY_WARNING_DAYS = 30;

router.get('/', async (_req: Request, res: Response) => {
  try {
    const medicines = await prisma.medicine.findMany({
      include: { batches: true },
      orderBy: { genericName: 'asc' },
    });
    const now = new Date();
    const warningDate = new Date(now);
    warningDate.setDate(warningDate.getDate() + EXPIRY_WARNING_DAYS);
    const alerts = [];

    for (const medicine of medicines) {
      const currentStock = medicine.batches.reduce((total, batch) => total + batch.quantity, 0);
      if (currentStock === 0) {
        alerts.push({
          type: 'OUT_OF_STOCK',
          severity: 'critical',
          medicineId: medicine.id,
          message: `${medicine.genericName} is out of stock`,
          quantity: currentStock,
        });
      } else if (currentStock <= medicine.reorderLevel) {
        alerts.push({
          type: 'LOW_STOCK',
          severity: 'warning',
          medicineId: medicine.id,
          message: `${medicine.genericName} is at or below its reorder level`,
          quantity: currentStock,
        });
      }

      for (const batch of medicine.batches) {
        if (batch.quantity === 0) continue;
        if (batch.expiryDate < now) {
          alerts.push({
            type: 'EXPIRED',
            severity: 'critical',
            medicineId: medicine.id,
            batchId: batch.id,
            message: `${medicine.genericName} batch ${batch.batchNumber} has expired`,
            quantity: batch.quantity,
            expiryDate: batch.expiryDate,
          });
        } else if (batch.expiryDate <= warningDate) {
          alerts.push({
            type: 'EXPIRING_SOON',
            severity: 'warning',
            medicineId: medicine.id,
            batchId: batch.id,
            message: `${medicine.genericName} batch ${batch.batchNumber} expires within ${EXPIRY_WARNING_DAYS} days`,
            quantity: batch.quantity,
            expiryDate: batch.expiryDate,
          });
        }
      }
    }

    res.json({ success: true, data: alerts, meta: { generatedAt: now, expiryWarningDays: EXPIRY_WARNING_DAYS } });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to calculate inventory alerts' });
  }
});

export default router;