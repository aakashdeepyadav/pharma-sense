import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { AuthenticatedRequest, requireRoles } from '../auth';
import { buildPaginationMeta, sendApiError } from '../lib/api';
import { auditQuerySchema } from '../validation/schemas';

const router = Router();

router.get('/', requireRoles('Admin', 'Inventory Manager'), async (req: AuthenticatedRequest, res: Response) => {
  const query = auditQuerySchema.safeParse(req.query);
  if (!query.success) {
    sendApiError(res, 400, 'VALIDATION_ERROR', 'Request validation failed', query.error.issues);
    return;
  }

  try {
    const where = query.data.search
      ? {
          OR: [
            { action: { contains: query.data.search, mode: 'insensitive' as const } },
            { entity: { contains: query.data.search, mode: 'insensitive' as const } },
            { details: { contains: query.data.search, mode: 'insensitive' as const } },
          ],
        }
      : undefined;
    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
      include: { user: { select: { name: true, email: true, role: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
        skip: (query.data.page - 1) * query.data.pageSize,
        take: query.data.pageSize,
      }),
    ]);
    res.json({
      success: true,
      data: logs,
      meta: buildPaginationMeta(total, query.data.page, query.data.pageSize, 'createdAt', 'desc'),
    });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch audit logs' });
  }
});

export default router;