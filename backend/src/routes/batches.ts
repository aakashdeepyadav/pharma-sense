import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

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
    const { medicineId, supplierId, batchNumber, mfgDate, expiryDate, quantity, purchasePrice } = req.body;
    const batch = await prisma.batch.create({
      data: {
        medicineId,
        supplierId,
        batchNumber,
        mfgDate: new Date(mfgDate),
        expiryDate: new Date(expiryDate),
        quantity,
        purchasePrice
      }
    });
    res.json({ success: true, data: batch });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to add batch' });
  }
});

export default router;
