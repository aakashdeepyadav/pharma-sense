import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { AuthenticatedRequest } from '../auth';
import { sendApiError } from '../lib/api';
import { availableStock, isBatchExpired } from '../domain/stockRules';

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
      const currentStock = availableStock(medicine.batches, now);
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
        if (isBatchExpired(batch.expiryDate, now)) {
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

    await prisma.$transaction(async (database) => {
      const activeFingerprints = alerts.map((alert) => alert.fingerprint);
      const existingAlerts = activeFingerprints.length === 0
        ? []
        : await database.alert.findMany({
            where: { fingerprint: { in: activeFingerprints } },
            select: { fingerprint: true, status: true },
          });
      const existingStatus = new Map(existingAlerts.map((alert) => [alert.fingerprint, alert.status]));

      await database.alert.updateMany({
        where: {
          status: { in: ['OPEN', 'ACKNOWLEDGED'] },
          ...(activeFingerprints.length > 0 ? { fingerprint: { notIn: activeFingerprints } } : {}),
        },
        data: { status: 'RESOLVED' },
      });

      for (const alert of alerts) {
        const wasResolved = existingStatus.get(alert.fingerprint) === 'RESOLVED';
        await database.alert.upsert({
          where: { fingerprint: alert.fingerprint },
          create: alert,
          update: {
            type: alert.type,
            severity: alert.severity,
            message: alert.message,
            quantity: alert.quantity,
            expiryDate: alert.expiryDate,
            ...(wasResolved ? { status: 'OPEN', acknowledgedAt: null, createdAt: now } : {}),
          },
        });
      }
    });
    const currentAlerts = await prisma.alert.findMany({
      where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: currentAlerts, meta: { generatedAt: now, expiryWarningDays: EXPIRY_WARNING_DAYS } });
  } catch {
    sendApiError(res, 500, 'CALCULATE_ALERTS_FAILED', 'Failed to calculate inventory alerts');
  }
});

router.patch('/:id/acknowledge', async (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    sendApiError(res, 400, 'INVALID_ALERT_ID', 'Alert id must be a positive integer');
    return;
  }
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  try {
    const alert = await prisma.$transaction(async (database) => {
      const updatedAlert = await database.alert.update({
        where: { id },
        data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
      });
      await database.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'ALERT_ACKNOWLEDGED',
          entity: 'Alert',
          entityId: id,
        },
      });
      return updatedAlert;
    });
    res.json({ success: true, data: alert });
  } catch {
    sendApiError(res, 404, 'ALERT_NOT_FOUND', 'Alert not found');
  }
});

export default router;
