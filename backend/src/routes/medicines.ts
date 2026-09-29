import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Get all medicines
router.get('/', async (req: Request, res: Response) => {
  try {
    const medicines = await prisma.medicine.findMany({
      include: { category: true, batches: true }
    });
    res.json({ success: true, data: medicines });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch medicines' });
  }
});

// Add a new medicine
router.post('/', async (req: Request, res: Response) => {
  try {
    const { genericName, brandName, categoryId, reorderLevel, unit } = req.body;
    const medicine = await prisma.medicine.create({
      data: {
        genericName,
        brandName,
        categoryId,
        reorderLevel,
        unit
      }
    });
    res.json({ success: true, data: medicine });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to add medicine' });
  }
});

export default router;
