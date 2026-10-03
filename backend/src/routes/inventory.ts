import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { buildPaginationMeta, sendApiError } from '../lib/api';
import { AuthenticatedRequest, requireRoles } from '../auth';
import { listQuerySchema, stockTransactionSchema } from '../validation/schemas';
import { calculateStockDelta, isBatchExpired, minimumQuantityForDelta } from '../domain/stockRules';

const router = Router();

router.get('/transactions', async (req: AuthenticatedRequest, res: Response) => {
  const query = listQuerySchema.safeParse(req.query);
  if (!query.success) {
    sendApiError(res, 400, 'VALIDATION_ERROR', 'Request validation failed', query.error.issues);
    return;
  }

  try {
    const sortBy = query.data.sortBy ?? 'timestamp';
    const sortOrder = req.query.sortOrder === undefined ? 'desc' : query.data.sortOrder;
    const [total, transactions] = await Promise.all([
      prisma.stockTransaction.count(),
      prisma.stockTransaction.findMany({
        include: {
          batch: { include: { medicine: true, supplier: true } },
          user: { select: { name: true, email: true } },
        },
        orderBy: { [sortBy]: sortOrder } as Record<string, 'asc' | 'desc'>,
        skip: (query.data.page - 1) * query.data.pageSize,
        take: query.data.pageSize,
      }),
    ]);

    res.json({
      success: true,
      data: transactions,
      meta: buildPaginationMeta(total, query.data.page, query.data.pageSize, sortBy, sortOrder),
    });
  } catch {
    sendApiError(res, 500, 'FETCH_TRANSACTIONS_FAILED', 'Failed to fetch stock transactions');
  }
});

router.post('/transactions', requireRoles('Admin', 'Pharmacist', 'Inventory Manager', 'Staff'), async (req: AuthenticatedRequest, res: Response) => {
  const result = stockTransactionSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ success: false, error: result.error.issues });
    return;
  }
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  try {
    const transaction = await prisma.$transaction(async (database) => {
      const batch = await database.batch.findUnique({ where: { id: result.data.batchId } });
      if (!batch) throw new Error('BATCH_NOT_FOUND');
      if (result.data.type === 'OUT' && isBatchExpired(batch.expiryDate)) {
        throw new Error('EXPIRED_BATCH');
      }

      const adjustment = calculateStockDelta(result.data.type, result.data.quantity);
      const minimumQuantity = minimumQuantityForDelta(adjustment);
      const updatedBatch = await database.batch.updateMany({
        where: { id: result.data.batchId, quantity: { gte: minimumQuantity } },
        data: { quantity: { increment: adjustment } },
      });

      if (updatedBatch.count === 0) {
        throw new Error('INSUFFICIENT_STOCK');
      }

      return database.stockTransaction.create({
        data: {
          batchId: result.data.batchId,
          userId: req.user!.id,
          type: result.data.type,
          quantity: result.data.quantity,
          notes: result.data.notes,
        },
        include: { batch: { include: { medicine: true, supplier: true } } },
      });
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: result.data.type === 'OUT' ? 'STOCK_OUT' : 'STOCK_ADJUSTMENT',
        entity: 'Batch',
        entityId: result.data.batchId,
        details: JSON.stringify({ quantity: result.data.quantity, notes: result.data.notes }),
      },
    });

    res.status(201).json({ success: true, data: transaction });
  } catch (error) {
    if (error instanceof Error && error.message === 'BATCH_NOT_FOUND') {
      res.status(404).json({ success: false, error: 'Batch not found' });
      return;
    }
    if (error instanceof Error && error.message === 'INSUFFICIENT_STOCK') {
      res.status(409).json({ success: false, error: 'Insufficient stock for this operation' });
      return;
    }
    if (error instanceof Error && error.message === 'EXPIRED_BATCH') {
      res.status(409).json({ success: false, error: 'Expired batches cannot be issued' });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to record stock transaction' });
  }
});

export default router;