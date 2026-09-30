import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { categorySchema } from '../validation/schemas';
import { requireRoles } from '../auth';

const router = Router();

// Get all categories
router.get('/', async (req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany();
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch categories' });
  }
});

// Add a category
router.post('/', requireRoles('Admin', 'Pharmacist', 'Inventory Manager'), async (req: Request, res: Response) => {
  try {
    const result = categorySchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ success: false, error: result.error.issues });
      return;
    }

    const category = await prisma.category.create({
      data: result.data,
    });
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to add category' });
  }
});

export default router;
