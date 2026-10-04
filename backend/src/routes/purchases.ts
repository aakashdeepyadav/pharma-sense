import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { AuthenticatedRequest, requireRoles } from '../auth';
import { purchaseSchema } from '../validation/schemas';
import { sendApiError } from '../lib/api';

const router = Router();
const receivingRoles = ['Admin', 'Pharmacist', 'Inventory Manager'];

router.get('/', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const purchases = await prisma.purchase.findMany({
      include: {
        supplier: true,
        createdBy: { select: { name: true, email: true } },
        items: { include: { medicine: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: purchases });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch purchases' });
  }
});

router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const purchaseId = Number(req.params.id);
  if (!Number.isInteger(purchaseId) || purchaseId < 1) {
    sendApiError(res, 400, 'INVALID_PURCHASE_ID', 'Purchase id must be a positive integer');
    return;
  }

  try {
    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: {
        supplier: true,
        createdBy: { select: { name: true, email: true } },
        items: { include: { medicine: true } },
      },
    });
    if (!purchase) {
      sendApiError(res, 404, 'PURCHASE_NOT_FOUND', 'Purchase not found');
      return;
    }
    res.json({ success: true, data: purchase });
  } catch {
    sendApiError(res, 500, 'FETCH_PURCHASE_FAILED', 'Failed to fetch purchase');
  }
});

router.post('/', requireRoles(...receivingRoles), async (req: AuthenticatedRequest, res: Response) => {
  const result = purchaseSchema.safeParse(req.body);
  if (!result.success) {
    sendApiError(res, 400, 'VALIDATION_ERROR', 'Request validation failed', result.error.issues);
    return;
  }
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  try {
    const purchase = await prisma.$transaction(async (database) => {
      const createdPurchase = await database.purchase.create({
        data: {
          supplierId: result.data.supplierId,
          createdById: req.user!.id,
          notes: result.data.notes,
          items: { create: result.data.items },
        },
        include: { items: true, supplier: true },
      });
      await database.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'PURCHASE_CREATED',
          entity: 'Purchase',
          entityId: createdPurchase.id,
          details: JSON.stringify({ itemCount: createdPurchase.items.length }),
        },
      });
      return createdPurchase;
    });
    res.status(201).json({ success: true, data: purchase });
  } catch {
    sendApiError(res, 500, 'CREATE_PURCHASE_FAILED', 'Failed to create purchase');
  }
});

router.post('/:id/receive', requireRoles(...receivingRoles), async (req: AuthenticatedRequest, res: Response) => {
  const purchaseId = Number(req.params.id);
  if (!Number.isInteger(purchaseId) || purchaseId < 1) {
    sendApiError(res, 400, 'INVALID_PURCHASE_ID', 'Purchase id must be a positive integer');
    return;
  }
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  try {
    const purchase = await prisma.$transaction(async (database) => {
      const existingPurchase = await database.purchase.findUnique({
        where: { id: purchaseId },
        include: { items: true },
      });
      if (!existingPurchase) throw new Error('PURCHASE_NOT_FOUND');
      if (existingPurchase.status === 'RECEIVED') throw new Error('PURCHASE_ALREADY_RECEIVED');

      for (const item of existingPurchase.items) {
        const batch = await database.batch.create({
          data: {
            medicineId: item.medicineId,
            supplierId: existingPurchase.supplierId,
            batchNumber: item.batchNumber,
            mfgDate: item.mfgDate,
            expiryDate: item.expiryDate,
            quantity: item.quantity,
            purchasePrice: item.purchasePrice,
            sellingPrice: item.sellingPrice,
          },
        });
        await database.stockTransaction.create({
          data: {
            batchId: batch.id,
            userId: req.user!.id,
            type: 'IN',
            quantity: item.quantity,
            notes: `Purchase #${purchaseId} received`,
          },
        });
      }

      const receivedPurchase = await database.purchase.update({
        where: { id: purchaseId },
        data: { status: 'RECEIVED', receivedAt: new Date() },
        include: { items: true, supplier: true },
      });
      await database.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'PURCHASE_RECEIVED',
          entity: 'Purchase',
          entityId: purchaseId,
          details: JSON.stringify({ itemCount: existingPurchase.items.length }),
        },
      });
      return receivedPurchase;
    });
    res.json({ success: true, data: purchase });
  } catch (error) {
    if (error instanceof Error && error.message === 'PURCHASE_NOT_FOUND') {
      sendApiError(res, 404, 'PURCHASE_NOT_FOUND', 'Purchase not found');
      return;
    }
    if (error instanceof Error && error.message === 'PURCHASE_ALREADY_RECEIVED') {
      sendApiError(res, 409, 'PURCHASE_ALREADY_RECEIVED', 'Purchase has already been received');
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      sendApiError(res, 409, 'DUPLICATE_BATCH', 'A batch with this medicine and batch number already exists');
      return;
    }
    sendApiError(res, 500, 'RECEIVE_PURCHASE_FAILED', 'Failed to receive purchase');
  }
});

export default router;
