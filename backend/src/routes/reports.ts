import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { AuthenticatedRequest, requireRoles } from '../auth';
import { demandHistoryQuerySchema, forecastMlPredictionQuerySchema } from '../validation/schemas';
import { forecastQuerySchema } from '../validation/schemas';
import { replenishmentDecisionSchema, replenishmentQuerySchema } from '../validation/schemas';
import { assessDemandDrift, assessDemandRisk, assessForecastQuality, assessForecastReadiness, movingAverageForecast, movingAverageMae } from '../domain/forecasting';
import { buildLightGbmFeatures, loadLightGbmArtifact, predictLightGbm } from '../domain/lightgbm';
import { calculateReplenishment } from '../domain/replenishment';
import { availableStock } from '../domain/stockRules';
import { sendApiError } from '../lib/api';

const router = Router();

router.get('/summary', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const [medicines, suppliers, batches, transactions] = await Promise.all([
      prisma.medicine.findMany({
        where: { active: true },
        select: {
          id: true,
          genericName: true,
          reorderLevel: true,
          batches: { select: { quantity: true, expiryDate: true } },
        },
      }),
      prisma.supplier.count(),
      prisma.batch.findMany({ select: { quantity: true, purchasePrice: true, expiryDate: true } }),
      prisma.stockTransaction.findMany({
        where: { type: 'OUT' },
        select: { quantity: true, timestamp: true, batch: { select: { medicineId: true } } },
      }),
    ]);

    const issuedByMedicine = new Map<number, number>();
    for (const transaction of transactions) {
      issuedByMedicine.set(
        transaction.batch.medicineId,
        (issuedByMedicine.get(transaction.batch.medicineId) ?? 0) + transaction.quantity,
      );
    }

    const to = new Date();
    const from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
    const demandByMedicine = new Map<number, Map<string, number>>();
    for (const transaction of transactions) {
      const medicineId = transaction.batch.medicineId;
      const dateKey = transaction.timestamp.toISOString().slice(0, 10);
      const medicineMap = demandByMedicine.get(medicineId) ?? new Map<string, number>();
      medicineMap.set(dateKey, (medicineMap.get(dateKey) ?? 0) + transaction.quantity);
      demandByMedicine.set(medicineId, medicineMap);
    }

    const monitoringExposure = medicines.map((medicine) => {
      const values: number[] = [];
      let currentDate = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
      const endDate = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
      while (currentDate <= endDate) {
        const dateKey = currentDate.toISOString().slice(0, 10);
        values.push(demandByMedicine.get(medicine.id)?.get(dateKey) ?? 0);
        currentDate = new Date(Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), currentDate.getUTCDate() + 1));
      }

      const currentStock = availableStock(medicine.batches, to);
      const risk = assessDemandRisk(values, currentStock, medicine.reorderLevel, 7);
      const quality = assessForecastQuality(
        values.slice(7),
        values.slice(7).map((_, index) => {
          const windowValues = values.slice(index, index + 7);
          return windowValues.length === 0 ? 0 : windowValues.reduce((total, value) => total + value, 0) / windowValues.length;
        }),
        { maxMae: 1.5, maxRmse: 2.5 },
      );
      const drift = assessDemandDrift(values, 7);
      const monitoringStatus = drift.status === 'WATCH' || quality.status === 'WATCH'
        ? 'WATCH'
        : quality.status === 'INSUFFICIENT_DATA' || drift.status === 'INSUFFICIENT_DATA'
          ? 'INSUFFICIENT_DATA'
          : 'OK';

      return {
        medicineId: medicine.id,
        medicineName: medicine.genericName,
        riskLevel: risk.riskLevel,
        monitoringStatus,
        driftStatus: drift.status,
        driftMessage: drift.message,
      };
    });

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
        totalUnits: availableStock(batches, to),
        inventoryCost: batches.reduce((total, batch) => total + batch.quantity * Number(batch.purchasePrice), 0),
        issuedUnits: transactions.reduce((total, transaction) => total + transaction.quantity, 0),
        forecastWatchCount: monitoringExposure.filter(
          (item) => item.monitoringStatus === 'WATCH' || item.riskLevel === 'MEDIUM' || item.riskLevel === 'HIGH',
        ).length,
        monitoringBreakdown: {
          ok: monitoringExposure.filter((item) => item.monitoringStatus === 'OK').length,
          watch: monitoringExposure.filter((item) => item.monitoringStatus === 'WATCH').length,
          insufficientData: monitoringExposure.filter((item) => item.monitoringStatus === 'INSUFFICIENT_DATA').length,
        },
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
          batches: { select: { quantity: true, expiryDate: true } },
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

      const currentStock = availableStock(medicine.batches, to);
      const risk = assessDemandRisk(values, currentStock, medicine.reorderLevel, 7);
      const actualValues = values.slice(7);
      const predictions = actualValues.map((_, index) => {
        const windowValues = values.slice(index, index + 7);
        const forecast = windowValues.length === 0 ? 0 : windowValues.reduce((total, value) => total + value, 0) / windowValues.length;
        return forecast;
      });
      const forecastQuality = assessForecastQuality(actualValues, predictions, { maxMae: 1.5, maxRmse: 2.5 });
      const drift = assessDemandDrift(values, 7);
      const monitoringStatus = drift.status === 'WATCH' || forecastQuality.status === 'WATCH'
        ? 'WATCH'
        : forecastQuality.status === 'INSUFFICIENT_DATA' || drift.status === 'INSUFFICIENT_DATA'
          ? 'INSUFFICIENT_DATA'
          : 'OK';

      return {
        medicineId: medicine.id,
        medicineName: medicine.genericName,
        currentStock,
        reorderLevel: medicine.reorderLevel,
        predictedDailyDemand: Number(risk.predictedDailyDemand.toFixed(2)),
        coverDays: risk.coverDays === null ? null : Number(risk.coverDays.toFixed(2)),
        projectedStockAfter7Days: Number(risk.projectedStockAfter7Days.toFixed(2)),
        riskLevel: risk.riskLevel,
        monitoringStatus,
        driftStatus: drift.status,
        driftMessage: drift.message,
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

router.get('/forecast-ml', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const candidateDirs = [
      path.resolve(process.cwd(), 'ml-artifacts'),
      path.resolve(process.cwd(), '../research/results'),
      path.resolve(process.cwd(), 'research/results'),
      path.resolve(__dirname, '../../../research/results'),
    ];

    let metrics: unknown = null;
    let replenishmentExample: unknown = null;

    for (const dir of candidateDirs) {
      const metricsFile = path.join(dir, 'lightgbm_forecast_metrics.json');
      const exampleFile = path.join(dir, 'lightgbm_replenishment_example.json');
      try {
        const raw = await fs.readFile(metricsFile, 'utf8');
        metrics = JSON.parse(raw);
        try {
          const rawExample = await fs.readFile(exampleFile, 'utf8');
          replenishmentExample = JSON.parse(rawExample);
        } catch {
          replenishmentExample = null;
        }
        break;
      } catch {
        // try next candidate directory
      }
    }

    res.json({
      success: true,
      data: {
        available: metrics !== null,
        metrics,
        replenishmentExample,
      },
    });
  } catch {
    sendApiError(res, 500, 'GET_FORECAST_ML_FAILED', 'Failed to retrieve ML forecast insights');
  }
});

router.get('/forecast-ml/predictions', async (req: AuthenticatedRequest, res: Response) => {
  const query = forecastMlPredictionQuerySchema.safeParse(req.query);
  if (!query.success) {
    sendApiError(res, 400, 'VALIDATION_ERROR', 'Request validation failed', query.error.issues);
    return;
  }

  try {
    let model: Awaited<ReturnType<typeof loadLightGbmArtifact>>;
    try {
      model = await loadLightGbmArtifact();
    } catch {
      sendApiError(res, 503, 'FORECAST_MODEL_UNAVAILABLE', 'The LightGBM inference artifact is not installed');
      return;
    }

    const medicines = await prisma.medicine.findMany({
      where: query.data.medicineId ? { id: query.data.medicineId, active: true } : { active: true },
      select: { id: true, genericName: true },
      orderBy: { genericName: 'asc' },
    });
    if (query.data.medicineId && medicines.length === 0) {
      sendApiError(res, 404, 'MEDICINE_NOT_FOUND', 'Active medicine not found');
      return;
    }

    const today = new Date();
    const forecastDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const historyStart = new Date(forecastDate);
    historyStart.setUTCDate(historyStart.getUTCDate() - 30);
    const medicineIds = medicines.map((medicine) => medicine.id);
    const transactions = medicineIds.length === 0
      ? []
      : await prisma.stockTransaction.findMany({
          where: {
            type: 'OUT',
            timestamp: { gte: historyStart, lt: forecastDate },
            batch: { medicineId: { in: medicineIds } },
          },
          select: {
            quantity: true,
            timestamp: true,
            batch: { select: { medicineId: true } },
          },
          orderBy: { timestamp: 'asc' },
        });

    const demandByMedicine = new Map<number, number[]>(medicineIds.map((id) => [id, Array(30).fill(0)]));
    const firstDemandDay = new Map<number, number>();
    const activeDemandDays = new Map<number, Set<number>>();
    for (const transaction of transactions) {
      const dayIndex = Math.floor((Date.UTC(
        transaction.timestamp.getUTCFullYear(),
        transaction.timestamp.getUTCMonth(),
        transaction.timestamp.getUTCDate(),
      ) - historyStart.getTime()) / (24 * 60 * 60 * 1000));
      if (dayIndex < 0 || dayIndex >= 30) continue;
      const medicineId = transaction.batch.medicineId;
      const dailyValues = demandByMedicine.get(medicineId);
      if (!dailyValues) continue;
      dailyValues[dayIndex] += transaction.quantity;
      firstDemandDay.set(medicineId, Math.min(firstDemandDay.get(medicineId) ?? dayIndex, dayIndex));
      const activeDays = activeDemandDays.get(medicineId) ?? new Set<number>();
      activeDays.add(dayIndex);
      activeDemandDays.set(medicineId, activeDays);
    }

    const forecasts = medicines.map((medicine) => {
      const dailyDemand = demandByMedicine.get(medicine.id) ?? Array(30).fill(0);
      const firstDay = firstDemandDay.get(medicine.id);
      const historyDays = firstDay === undefined ? 0 : 30 - firstDay;
      const demandDays = activeDemandDays.get(medicine.id)?.size ?? 0;
      if (historyDays < 30 || demandDays === 0) {
        return {
          medicineId: medicine.id,
          medicineName: medicine.genericName,
          forecastDate: forecastDate.toISOString().slice(0, 10),
          predictedQuantity: null,
          status: 'INSUFFICIENT_HISTORY' as const,
          historyDays,
          demandDays,
        };
      }

      const features = buildLightGbmFeatures(dailyDemand, forecastDate);
      return {
        medicineId: medicine.id,
        medicineName: medicine.genericName,
        forecastDate: forecastDate.toISOString().slice(0, 10),
        predictedQuantity: Number(predictLightGbm(model, features).toFixed(2)),
        status: 'READY' as const,
        historyDays,
        demandDays,
      };
    });

    res.json({
      success: true,
      data: {
        model: model.model,
        trainingDataSource: model.training_data_source,
        trainedAt: model.trained_at,
        inferenceDataSource: 'recent_stock_out_transactions',
        forecasts,
      },
    });
  } catch {
    sendApiError(res, 500, 'CALCULATE_ML_FORECAST_FAILED', 'Failed to calculate LightGBM forecasts');
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
          batches: { select: { quantity: true, expiryDate: true } },
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

    const reviews = await prisma.replenishmentReview.findMany({
      where: { medicineId: { in: medicines.map((medicine) => medicine.id) } },
      select: {
        medicineId: true,
        decision: true,
        notes: true,
        reviewedAt: true,
        reviewer: { select: { id: true, name: true } },
      },
    });
    const reviewsByMedicine = new Map(reviews.map((review) => [review.medicineId, review]));

    const recommendations = medicines.map((medicine) => {
      const currentUnits = availableStock(medicine.batches, to);
      const averageDailyDemand = (issuedByMedicine.get(medicine.id) ?? 0) / result.data.window;
      const review = reviewsByMedicine.get(medicine.id);
      return {
        medicineId: medicine.id,
        medicineName: medicine.genericName,
        ...calculateReplenishment(currentUnits, medicine.reorderLevel, averageDailyDemand, result.data.targetDays),
        explanation: 'Read-only estimate using completed OUT transactions and the medicine reorder level.',
        review: review
          ? {
              decision: review.decision,
              notes: review.notes,
              reviewedAt: review.reviewedAt,
              reviewer: review.reviewer,
            }
          : null,
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
    const review = await prisma.$transaction(async (transaction) => {
      const savedReview = await transaction.replenishmentReview.upsert({
        where: { medicineId: medicine.id },
        create: {
          medicineId: medicine.id,
          reviewerId: req.user!.id,
          decision: result.data.decision,
          notes: result.data.notes,
        },
        update: {
          reviewerId: req.user!.id,
          decision: result.data.decision,
          notes: result.data.notes,
        },
        select: {
          decision: true,
          notes: true,
          reviewedAt: true,
          reviewer: { select: { id: true, name: true } },
        },
      });
      await transaction.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'REPLENISHMENT_DECISION',
          entity: 'Medicine',
          entityId: medicine.id,
          details: `${summary}${result.data.notes ? `: ${result.data.notes}` : ''}`,
        },
      });
      return savedReview;
    });

    res.json({
      success: true,
      data: {
        medicineId: medicine.id,
        medicineName: medicine.genericName,
        review,
      },
    });
  } catch {
    sendApiError(res, 500, 'RECORD_REPLENISHMENT_DECISION_FAILED', 'Failed to record replenishment review decision');
  }
});

export default router;
