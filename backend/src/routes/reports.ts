import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { AuthenticatedRequest, requireRoles } from '../auth';
import { demandHistoryQuerySchema } from '../validation/schemas';
import { forecastQuerySchema } from '../validation/schemas';
import { replenishmentDecisionSchema, replenishmentQuerySchema } from '../validation/schemas';
import { assessDemandRisk, assessForecastReadiness, movingAverageForecast, movingAverageMae } from '../domain/forecasting';
import { calculateReplenishment } from '../domain/replenishment';
import { sendApiError } from '../lib/api';

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
        inventoryCost: batches.reduce((total, batch) => total + batch.quantity * Number(batch.purchasePrice), 0),
        issuedUnits: transactions.reduce((total, transaction) => total + transaction.quantity, 0),
        topIssuedMedicines,
      },
    });
  } catch {
    sendApiError(res, 500, 'CALCULATE_REPORT_FAILED', 'Failed to calculate report summary');
  }
});

router.get('/demand-history', async (req: AuthenticatedRequest, res: Response) => {
  const result = demandHistoryQuerySchema.safeParse(req.query);
  if (!result.success) {
    sendApiError(res, 400, 'VALIDATION_ERROR', 'Request validation failed', result.error.issues);
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
    sendApiError(res, 500, 'PREPARE_DEMAND_HISTORY_FAILED', 'Failed to prepare demand history');
  }
});

router.get('/forecast-risk', async (_req: AuthenticatedRequest, res: Response) => {
  const to = new Date();
  const from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);

  try {
    const [medicines, transactions] = await Promise.all([
      prisma.medicine.findMany({
        where: { active: true },
        select: {
          id: true,
          genericName: true,
          reorderLevel: true,
          batches: { select: { quantity: true } },
        },
        orderBy: { genericName: 'asc' },
      }),
      prisma.stockTransaction.findMany({
        where: {
          type: 'OUT',
          timestamp: { gte: from, lte: to },
        },
        select: {
          quantity: true,
          timestamp: true,
          batch: { select: { medicineId: true } },
        },
        orderBy: { timestamp: 'asc' },
      }),
    ]);

    const demandByMedicine = new Map<number, Map<string, number>>();
    for (const transaction of transactions) {
      const medicineId = transaction.batch.medicineId;
      const dateKey = transaction.timestamp.toISOString().slice(0, 10);
      const medicineMap = demandByMedicine.get(medicineId) ?? new Map<string, number>();
      medicineMap.set(dateKey, (medicineMap.get(dateKey) ?? 0) + transaction.quantity);
      demandByMedicine.set(medicineId, medicineMap);
    }

    const currentDate = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    const endDate = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
    const forecastData = medicines.map((medicine) => {
      const values: number[] = [];
      const workingDate = new Date(currentDate);
      while (workingDate <= endDate) {
        const dateKey = workingDate.toISOString().slice(0, 10);
        values.push(demandByMedicine.get(medicine.id)?.get(dateKey) ?? 0);
        workingDate.setUTCDate(workingDate.getUTCDate() + 1);
      }

      const currentStock = medicine.batches.reduce((total, batch) => total + batch.quantity, 0);
      const risk = assessDemandRisk(values, currentStock, medicine.reorderLevel, 7);
      return {
        medicineId: medicine.id,
        medicineName: medicine.genericName,
        currentStock,
        reorderLevel: medicine.reorderLevel,
        predictedDailyDemand: Number(risk.predictedDailyDemand.toFixed(2)),
        coverDays: risk.coverDays === null ? null : Number(risk.coverDays.toFixed(2)),
        projectedStockAfter7Days: Number(risk.projectedStockAfter7Days.toFixed(2)),
        riskLevel: risk.riskLevel,
        message: risk.message,
      };
    });

    res.json({
      success: true,
      data: forecastData,
      meta: {
        from: from.toISOString(),
        to: to.toISOString(),
        windowDays: 7,
      },
    });
  } catch {
    sendApiError(res, 500, 'CALCULATE_FORECAST_RISK_FAILED', 'Failed to calculate forecast risk summary');
  }
});

router.get('/forecast-baseline', async (req: AuthenticatedRequest, res: Response) => {
  const result = forecastQuerySchema.safeParse(req.query);
  if (!result.success) {
    sendApiError(res, 400, 'VALIDATION_ERROR', 'Request validation failed', result.error.issues);
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
      sendApiError(res, 404, 'MEDICINE_NOT_FOUND', 'Medicine not found');
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
    const readiness = assessForecastReadiness(dailyValues, result.data.window);
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
        evaluation: {
          mae: movingAverageMae(dailyValues, result.data.window),
          observations: dailyValues.length,
          readiness,
        },
      },
    });
  } catch {
    sendApiError(res, 500, 'CALCULATE_FORECAST_FAILED', 'Failed to calculate forecast baseline');
  }
});

router.get('/replenishment', async (req: AuthenticatedRequest, res: Response) => {
  const result = replenishmentQuerySchema.safeParse(req.query);
  if (!result.success) {
    sendApiError(res, 400, 'VALIDATION_ERROR', 'Request validation failed', result.error.issues);
    return;
  }

  const to = new Date();
  const from = new Date(to.getTime() - result.data.window * 24 * 60 * 60 * 1000);
  try {
    const [medicines, transactions] = await Promise.all([
      prisma.medicine.findMany({
        where: { active: true },
        select: {
          id: true,
          genericName: true,
          reorderLevel: true,
          batches: { select: { quantity: true } },
        },
        orderBy: { genericName: 'asc' },
      }),
      prisma.stockTransaction.findMany({
        where: { type: 'OUT', timestamp: { gte: from, lte: to } },
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

    const recommendations = medicines.map((medicine) => {
      const currentUnits = medicine.batches.reduce((total, batch) => total + batch.quantity, 0);
      const averageDailyDemand = (issuedByMedicine.get(medicine.id) ?? 0) / result.data.window;
      return {
        medicineId: medicine.id,
        medicineName: medicine.genericName,
        ...calculateReplenishment(currentUnits, medicine.reorderLevel, averageDailyDemand, result.data.targetDays),
        explanation: 'Read-only estimate using completed OUT transactions and the medicine reorder level.',
      };
    });

    res.json({
      success: true,
      data: recommendations,
      meta: { from: from.toISOString(), to: to.toISOString(), model: 'rule_based_average_demand' },
    });
  } catch {
    sendApiError(res, 500, 'CALCULATE_REPLENISHMENT_FAILED', 'Failed to calculate replenishment recommendations');
  }
});

router.post('/replenishment/decision', requireRoles('Admin', 'Pharmacist', 'Inventory Manager'), async (req: AuthenticatedRequest, res: Response) => {
  const result = replenishmentDecisionSchema.safeParse(req.body);
  if (!result.success) {
    sendApiError(res, 400, 'VALIDATION_ERROR', 'Request validation failed', result.error.issues);
    return;
  }

  try {
    const medicine = await prisma.medicine.findUnique({
      where: { id: result.data.medicineId },
      select: { id: true, genericName: true },
    });

    if (!medicine) {
      sendApiError(res, 404, 'MEDICINE_NOT_FOUND', 'Medicine not found');
      return;
    }

    const summary = `${result.data.decision === 'APPROVED' ? 'Approved' : 'Dismissed'} replenishment review for ${medicine.genericName}`;
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'REPLENISHMENT_DECISION',
        entity: 'Medicine',
        entityId: medicine.id,
        details: `${summary}${result.data.notes ? `: ${result.data.notes}` : ''}`,
      },
    });

    res.json({
      success: true,
      data: {
        medicineId: medicine.id,
        medicineName: medicine.genericName,
        decision: result.data.decision,
        notes: result.data.notes ?? null,
      },
    });
  } catch {
    sendApiError(res, 500, 'RECORD_REPLENISHMENT_DECISION_FAILED', 'Failed to record replenishment review decision');
  }
});

export default router;