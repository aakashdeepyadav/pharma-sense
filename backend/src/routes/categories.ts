import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { buildPaginationMeta, sendApiError } from '../lib/api';
import { categorySchema, categoryUpdateSchema, listQuerySchema } from '../validation/schemas';
import { AuthenticatedRequest, requireRoles } from '../auth';

const router = Router();

// Get all categories
router.get('/', async (req: Request, res: Response) => {
  const query = listQuerySchema.safeParse(req.query);
  if (!query.success) {
    sendApiError(res, 400, 'VALIDATION_ERROR', 'Request validation failed', query.error.issues);
    return;
  }

  try {
    const sortBy = query.data.sortBy ?? 'name';
    const [total, categories] = await Promise.all([
      prisma.category.count(),
      prisma.category.findMany({
        orderBy: { [sortBy]: query.data.sortOrder } as Record<string, 'asc' | 'desc'>,
        skip: (query.data.page - 1) * query.data.pageSize,
        take: query.data.pageSize,
      }),
    ]);

    res.json({
      success: true,
      data: categories,
      meta: buildPaginationMeta(total, query.data.page, query.data.pageSize, sortBy, query.data.sortOrder),
    });
  } catch {
    sendApiError(res, 500, 'FETCH_CATEGORIES_FAILED', 'Failed to fetch categories');
  }
});

// Add a category
router.post('/', requireRoles('Admin', 'Pharmacist', 'Inventory Manager'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = categorySchema.safeParse(req.body);
    if (!result.success) {
      sendApiError(res, 400, 'VALIDATION_ERROR', 'Request validation failed', result.error.issues);
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
    sendApiError(res, 500, 'CREATE_CATEGORY_FAILED', 'Failed to add category');
  }
});

router.patch('/:id', requireRoles('Admin', 'Pharmacist', 'Inventory Manager'), async (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const result = categoryUpdateSchema.safeParse(req.body);
  if (!Number.isInteger(id) || id < 1) {
    sendApiError(res, 400, 'INVALID_CATEGORY_ID', 'Category id must be a positive integer');
    return;
  }
  if (!result.success || Object.keys(result.data).length === 0) {
    sendApiError(res, 400, 'VALIDATION_ERROR', 'Provide at least one valid category field');
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
    sendApiError(res, 404, 'CATEGORY_NOT_FOUND', 'Category not found');
  }
});

export default router;
