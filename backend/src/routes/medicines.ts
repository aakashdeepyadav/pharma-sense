import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { medicineSchema, medicineUpdateSchema } from '../validation/schemas';
import { AuthenticatedRequest, requireRoles } from '../auth';

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
router.post('/', requireRoles('Admin', 'Pharmacist', 'Inventory Manager'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = medicineSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ success: false, error: result.error.issues });
      return;
    }

    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const medicine = await prisma.$transaction(async (database) => {
      const createdMedicine = await database.medicine.create({ data: result.data });
      await database.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'MEDICINE_CREATED',
          entity: 'Medicine',
          entityId: createdMedicine.id,
          details: JSON.stringify({ genericName: createdMedicine.genericName, brandName: createdMedicine.brandName }),
        },
      });
      return createdMedicine;
    });
    res.status(201).json({ success: true, data: medicine });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to add medicine' });
  }
});

router.patch('/:id', requireRoles('Admin', 'Pharmacist', 'Inventory Manager'), async (req: AuthenticatedRequest, res: Response) => {
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
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const medicine = await prisma.$transaction(async (database) => {
      const updatedMedicine = await database.medicine.update({ where: { id }, data: result.data });
      await database.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'MEDICINE_UPDATED',
          entity: 'Medicine',
          entityId: updatedMedicine.id,
          details: JSON.stringify(result.data),
        },
      });
      return updatedMedicine;
    });
    res.json({ success: true, data: medicine });
  } catch {
    res.status(404).json({ success: false, error: 'Medicine not found' });
  }
});

export default router;
