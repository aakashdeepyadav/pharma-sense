import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { batchSchema } from '../validation/schemas';
import { AuthenticatedRequest, requireRoles } from '../auth';

const router = Router();

// Get all batches
router.get('/', async (req: Request, res: Response) => {
  try {
    const batches = await prisma.batch.findMany({
      include: { medicine: true, supplier: true }
    });
    res.json({ success: true, data: batches });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch batches' });
  }
});

// Add a new batch
router.post('/', requireRoles('Admin', 'Pharmacist', 'Inventory Manager'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = batchSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ success: false, error: result.error.issues });
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
      return createdBatch;
    });
    res.status(201).json({ success: true, data: batch });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to add batch' });
  }
});

export default router;
