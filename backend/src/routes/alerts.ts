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
    const alerts: Array<{
      fingerprint: string;
      type: string;
      severity: string;
      medicineId: number;
      batchId?: number;
      message: string;
      quantity: number;
      expiryDate?: Date;
    }> = [];

    for (const medicine of medicines) {
      const currentStock = medicine.batches.reduce((total, batch) => total + batch.quantity, 0);
      if (currentStock === 0) {
        alerts.push({
          fingerprint: `OUT_OF_STOCK:${medicine.id}`,
          type: 'OUT_OF_STOCK',
          severity: 'critical',
          medicineId: medicine.id,
          message: `${medicine.genericName} is out of stock`,
          quantity: currentStock,
        });
      } else if (currentStock <= medicine.reorderLevel) {
        alerts.push({
          fingerprint: `LOW_STOCK:${medicine.id}`,
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
            fingerprint: `EXPIRED:${medicine.id}:${batch.id}`,
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
            fingerprint: `EXPIRING_SOON:${medicine.id}:${batch.id}`,
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

    await prisma.alert.updateMany({
      where: { status: 'OPEN' },
      data: { status: 'RESOLVED' },
    });
    for (const alert of alerts) {
      await prisma.alert.upsert({
        where: { fingerprint: alert.fingerprint },
        create: alert,
        update: {
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
          quantity: alert.quantity,
          expiryDate: alert.expiryDate,
          status: undefined,
        },
      });
    }
    const currentAlerts = await prisma.alert.findMany({
      where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: currentAlerts, meta: { generatedAt: now, expiryWarningDays: EXPIRY_WARNING_DAYS } });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to calculate inventory alerts' });
  }
});

router.patch('/:id/acknowledge', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ success: false, error: 'Alert id must be a positive integer' });
    return;
  }

  try {
    const alert = await prisma.alert.update({
      where: { id },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
    });
    res.json({ success: true, data: alert });
  } catch {
    res.status(404).json({ success: false, error: 'Alert not found' });
  }
});

export default router;