import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { AuthenticatedRequest } from '../auth';
import { stockTransactionSchema } from '../validation/schemas';

const router = Router();

router.get('/transactions', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const transactions = await prisma.stockTransaction.findMany({
      include: {
        batch: { include: { medicine: true, supplier: true } },
        user: { select: { name: true, email: true } },
      },
      orderBy: { timestamp: 'desc' },
    });
    res.json({ success: true, data: transactions });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch stock transactions' });
  }
});

router.post('/transactions', async (req: AuthenticatedRequest, res: Response) => {
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
      const adjustment = result.data.type === 'OUT' ? -result.data.quantity : result.data.quantity;
      const minimumQuantity = adjustment < 0 ? Math.abs(adjustment) : 0;
      const updatedBatch = await database.batch.updateMany({
        where: { id: result.data.batchId, quantity: { gte: minimumQuantity } },
        data: { quantity: { increment: adjustment } },
      });

      if (updatedBatch.count === 0) {
        const batch = await database.batch.findUnique({ where: { id: result.data.batchId } });
        if (!batch) throw new Error('BATCH_NOT_FOUND');
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
    res.status(500).json({ success: false, error: 'Failed to record stock transaction' });
  }
});

export default router;