import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { supplierSchema, supplierUpdateSchema } from '../validation/schemas';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      include: { _count: { select: { batches: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: suppliers });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch suppliers' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const result = supplierSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ success: false, error: result.error.issues });
    return;
  }

  try {
    const supplier = await prisma.supplier.create({ data: result.data });
    res.status(201).json({ success: true, data: supplier });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to add supplier' });
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
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
    const supplier = await prisma.supplier.update({ where: { id }, data: result.data });
    res.json({ success: true, data: supplier });
  } catch {
    res.status(404).json({ success: false, error: 'Supplier not found' });
  }
});

export default router;