import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { medicineSchema, medicineUpdateSchema } from '../validation/schemas';

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

router.get('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ success: false, error: 'Medicine id must be a positive integer' });
    return;
  }

  try {
    const medicine = await prisma.medicine.findUnique({
      where: { id },
      include: { category: true, batches: true },
    });
    if (!medicine) {
      res.status(404).json({ success: false, error: 'Medicine not found' });
      return;
    }
    res.json({ success: true, data: medicine });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch medicine' });
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

router.patch('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const result = medicineUpdateSchema.safeParse(req.body);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ success: false, error: 'Medicine id must be a positive integer' });
    return;
  }
  if (!result.success || Object.keys(result.data).length === 0) {
    res.status(400).json({ success: false, error: 'Provide at least one valid medicine field' });
    return;
  }

  try {
    const medicine = await prisma.medicine.update({ where: { id }, data: result.data });
    res.json({ success: true, data: medicine });
  } catch {
    res.status(404).json({ success: false, error: 'Medicine not found' });
  }
});

export default router;
