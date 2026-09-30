import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { categorySchema, categoryUpdateSchema } from '../validation/schemas';
import { AuthenticatedRequest, requireRoles } from '../auth';

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
router.post('/', requireRoles('Admin', 'Pharmacist', 'Inventory Manager'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = categorySchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ success: false, error: result.error.issues });
      return;
    }

    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const category = await prisma.$transaction(async (database) => {
      const createdCategory = await database.category.create({ data: result.data });
      await database.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'CATEGORY_CREATED',
          entity: 'Category',
          entityId: createdCategory.id,
          details: JSON.stringify({ name: createdCategory.name }),
        },
      });
      return createdCategory;
    });
    res.status(201).json({ success: true, data: category });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to add category' });
  }
});

router.patch('/:id', requireRoles('Admin', 'Pharmacist', 'Inventory Manager'), async (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const result = categoryUpdateSchema.safeParse(req.body);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ success: false, error: 'Category id must be a positive integer' });
    return;
  }
  if (!result.success || Object.keys(result.data).length === 0) {
    res.status(400).json({ success: false, error: 'Provide at least one valid category field' });
    return;
  }
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  try {
    const category = await prisma.$transaction(async (database) => {
      const updatedCategory = await database.category.update({ where: { id }, data: result.data });
      await database.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'CATEGORY_UPDATED',
          entity: 'Category',
          entityId: id,
          details: JSON.stringify(result.data),
        },
      });
      return updatedCategory;
    });
    res.json({ success: true, data: category });
  } catch {
    res.status(404).json({ success: false, error: 'Category not found' });
  }
});

export default router;
