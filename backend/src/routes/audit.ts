import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { AuthenticatedRequest, requireRoles } from '../auth';

const router = Router();

router.get('/', requireRoles('Admin', 'Inventory Manager'), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const logs = await prisma.auditLog.findMany({
      include: { user: { select: { name: true, email: true, role: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ success: true, data: logs });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch audit logs' });
  }
});

export default router;