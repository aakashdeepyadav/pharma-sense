import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { AuthenticatedRequest } from '../auth';
import { demandHistoryQuerySchema } from '../validation/schemas';
import { forecastQuerySchema } from '../validation/schemas';
import { movingAverageForecast, movingAverageMae } from '../domain/forecasting';

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

router.get('/demand-history', async (req: AuthenticatedRequest, res: Response) => {
  const result = demandHistoryQuerySchema.safeParse(req.query);
  if (!result.success) {
    res.status(400).json({ success: false, error: result.error.issues });
    return;
  }

  const to = result.data.to ?? new Date();
  const from = result.data.from ?? new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
  try {
    const transactions = await prisma.stockTransaction.findMany({
      where: { type: 'OUT', timestamp: { gte: from, lte: to } },
      select: {
        quantity: true,
        timestamp: true,
        batch: { select: { medicineId: true, medicine: { select: { genericName: true } } } },
      },
      orderBy: { timestamp: 'asc' },
    });
    const dailyDemand = new Map<string, { medicineId: number; medicineName: string; date: string; quantityIssued: number }>();
    for (const transaction of transactions) {
      const date = transaction.timestamp.toISOString().slice(0, 10);
      const key = `${transaction.batch.medicineId}:${date}`;
      const existing = dailyDemand.get(key);
      if (existing) {
        existing.quantityIssued += transaction.quantity;
      } else {
        dailyDemand.set(key, {
          medicineId: transaction.batch.medicineId,
          medicineName: transaction.batch.medicine.genericName,
          date,
          quantityIssued: transaction.quantity,
        });
      }
    }

    res.json({
      success: true,
      data: Array.from(dailyDemand.values()),
      meta: {
        from: from.toISOString(),
        to: to.toISOString(),
        definition: 'Demand is completed OUT stock transactions grouped by UTC calendar day and medicine.',
      },
    });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to prepare demand history' });
  }
});

router.get('/forecast-baseline', async (req: AuthenticatedRequest, res: Response) => {
  const result = forecastQuerySchema.safeParse(req.query);
  if (!result.success) {
    res.status(400).json({ success: false, error: result.error.issues });
    return;
  }

  const to = result.data.to ?? new Date();
  const from = result.data.from ?? new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
  try {
    const [medicine, transactions] = await Promise.all([
      prisma.medicine.findUnique({ where: { id: result.data.medicineId }, select: { genericName: true } }),
      prisma.stockTransaction.findMany({
        where: {
          type: 'OUT',
          timestamp: { gte: from, lte: to },
          batch: { medicineId: result.data.medicineId },
        },
        select: { quantity: true, timestamp: true },
        orderBy: { timestamp: 'asc' },
      }),
    ]);
    if (!medicine) {
      res.status(404).json({ success: false, error: 'Medicine not found' });
      return;
    }

    const dailyValues: number[] = [];
    const currentDate = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    const endDate = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
    while (currentDate <= endDate) {
      const dateKey = currentDate.toISOString().slice(0, 10);
      dailyValues.push(transactions
        .filter((transaction) => transaction.timestamp.toISOString().slice(0, 10) === dateKey)
        .reduce((total, transaction) => total + transaction.quantity, 0));
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }
    const forecastValues = movingAverageForecast(dailyValues, result.data.window, result.data.horizon);
    const forecast = forecastValues.map((quantity, index) => {
      const forecastDate = new Date(endDate);
      forecastDate.setUTCDate(forecastDate.getUTCDate() + index + 1);
      return { date: forecastDate.toISOString().slice(0, 10), predictedQuantity: quantity };
    });

    res.json({
      success: true,
      data: {
        medicineId: result.data.medicineId,
        medicineName: medicine.genericName,
        model: 'moving_average',
        window: result.data.window,
        horizon: result.data.horizon,
        forecast,
        evaluation: { mae: movingAverageMae(dailyValues, result.data.window), observations: dailyValues.length },
      },
    });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to calculate forecast baseline' });
  }
});

export default router;