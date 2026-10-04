import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { buildPaginationMeta, sendApiError } from '../lib/api';
import { batchSchema, listQuerySchema } from '../validation/schemas';
import { AuthenticatedRequest, requireRoles } from '../auth';

const router = Router();

// Get all batches
router.get('/', async (req: Request, res: Response) => {
  const query = listQuerySchema.safeParse(req.query);
  if (!query.success) {
    sendApiError(res, 400, 'VALIDATION_ERROR', 'Request validation failed', query.error.issues);
    return;
  }

  try {
    const sortBy = query.data.sortBy ?? 'expiryDate';
    const [total, batches] = await Promise.all([
      prisma.batch.count(),
      prisma.batch.findMany({
        include: { medicine: true, supplier: true },
        orderBy: { [sortBy]: query.data.sortOrder } as Record<string, 'asc' | 'desc'>,
        skip: (query.data.page - 1) * query.data.pageSize,
        take: query.data.pageSize,
      }),
    ]);

    res.json({
      success: true,
      data: batches,
      meta: buildPaginationMeta(total, query.data.page, query.data.pageSize, sortBy, query.data.sortOrder),
    });
  } catch {
    sendApiError(res, 500, 'FETCH_BATCHES_FAILED', 'Failed to fetch batches');
  }
});

// Add a new batch
router.post('/', requireRoles('Admin', 'Pharmacist', 'Inventory Manager'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = batchSchema.safeParse(req.body);
    if (!result.success) {
      sendApiError(res, 400, 'VALIDATION_ERROR', 'Request validation failed', result.error.issues);
      return;
    }

    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const batch = await prisma.$transaction(async (transaction) => {
      const createdBatch = await transaction.batch.create({
        data: result.data,
      });
      await transaction.stockTransaction.create({
        data: {
          batchId: createdBatch.id,
          userId: req.user!.id,
          type: 'IN',
          quantity: createdBatch.quantity,
          notes: 'Initial batch receipt',
        },
      });
      await transaction.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'BATCH_RECEIVED',
          entity: 'Batch',
          entityId: createdBatch.id,
          details: JSON.stringify({ quantity: createdBatch.quantity, batchNumber: createdBatch.batchNumber }),
        },
      });
      return createdBatch;
    });
    res.status(201).json({ success: true, data: batch });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      sendApiError(res, 409, 'DUPLICATE_BATCH', 'A batch with this medicine and batch number already exists');
      return;
    }
    sendApiError(res, 500, 'CREATE_BATCH_FAILED', 'Failed to add batch');
  }
});

export default router;
