import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { medicineSchema } from '../validation/schemas';

const router = Router();

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
    const result = medicineSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ success: false, error: result.error.issues });
      return;
    }

    const medicine = await prisma.medicine.create({
      data: result.data,
    });
    res.status(201).json({ success: true, data: medicine });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to add medicine' });
  }
});

export default router;
