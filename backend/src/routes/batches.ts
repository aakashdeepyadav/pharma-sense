import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { batchSchema } from '../validation/schemas';

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
router.post('/', async (req: Request, res: Response) => {
  try {
    const result = batchSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ success: false, error: result.error.issues });
      return;
    }

    const batch = await prisma.batch.create({
      data: result.data,
    });
    res.status(201).json({ success: true, data: batch });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to add batch' });
  }
});

export default router;
