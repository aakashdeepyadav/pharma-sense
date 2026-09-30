import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { supplierQuerySchema, supplierSchema, supplierUpdateSchema } from '../validation/schemas';
import { AuthenticatedRequest, requireRoles } from '../auth';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const query = supplierQuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ success: false, error: query.error.issues });
    return;
  }

  try {
    const suppliers = await prisma.supplier.findMany({
      where: query.data.search
        ? { name: { contains: query.data.search, mode: 'insensitive' } }
        : undefined,
      include: { _count: { select: { batches: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: suppliers });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch suppliers' });
  }
});

router.post('/', requireRoles('Admin', 'Inventory Manager'), async (req: AuthenticatedRequest, res: Response) => {
  const result = supplierSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ success: false, error: result.error.issues });
    return;
  }

  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const supplier = await prisma.$transaction(async (database) => {
      const createdSupplier = await database.supplier.create({ data: result.data });
      await database.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'SUPPLIER_CREATED',
          entity: 'Supplier',
          entityId: createdSupplier.id,
          details: JSON.stringify({ name: createdSupplier.name }),
        },
      });
      return createdSupplier;
    });
    res.status(201).json({ success: true, data: supplier });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to add supplier' });
  }
});

router.patch('/:id', requireRoles('Admin', 'Inventory Manager'), async (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const result = supplierUpdateSchema.safeParse(req.body);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ success: false, error: 'Supplier id must be a positive integer' });
    return;
  }
  if (!result.success || Object.keys(result.data).length === 0) {
    res.status(400).json({ success: false, error: 'Provide at least one valid supplier field' });
    return;
  }

  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const supplier = await prisma.$transaction(async (database) => {
      const updatedSupplier = await database.supplier.update({ where: { id }, data: result.data });
      await database.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'SUPPLIER_UPDATED',
          entity: 'Supplier',
          entityId: updatedSupplier.id,
          details: JSON.stringify(result.data),
        },
      });
      return updatedSupplier;
    });
    res.json({ success: true, data: supplier });
  } catch {
    res.status(404).json({ success: false, error: 'Supplier not found' });
  }
});

export default router;