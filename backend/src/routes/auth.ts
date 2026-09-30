import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { createAccessToken, requireAuth, AuthenticatedRequest, revokeAccessToken } from '../auth';
import { passwordChangeSchema } from '../validation/schemas';

const router = Router();
const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(100),
});
const loginAttempts = new Map<string, { count: number; windowStartedAt: number }>();
function positiveIntegerSetting(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

const LOGIN_WINDOW_MS = positiveIntegerSetting('LOGIN_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000);
const LOGIN_ATTEMPT_LIMIT = positiveIntegerSetting('LOGIN_RATE_LIMIT_MAX_ATTEMPTS', 10);

router.post('/login', async (req: Request, res: Response) => {
  const address = req.ip ?? 'unknown';
  const now = Date.now();
  const previous = loginAttempts.get(address);
  const attempts = previous && now - previous.windowStartedAt < LOGIN_WINDOW_MS
    ? previous
    : { count: 0, windowStartedAt: now };
  if (attempts.count >= LOGIN_ATTEMPT_LIMIT) {
    res.status(429).json({ success: false, error: 'Too many login attempts. Try again later' });
    return;
  }

  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    loginAttempts.set(address, { count: attempts.count + 1, windowStartedAt: attempts.windowStartedAt });
    res.status(400).json({ success: false, error: 'Enter a valid email and password' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: result.data.email.toLowerCase() },
      include: { role: true },
    });
    const validPassword = user ? await bcrypt.compare(result.data.password, user.passwordHash) : false;

    if (!user || !user.active || !validPassword) {
      loginAttempts.set(address, { count: attempts.count + 1, windowStartedAt: attempts.windowStartedAt });
      res.status(401).json({ success: false, error: 'Invalid email or password' });
      return;
    }

    loginAttempts.delete(address);

    res.json({
      success: true,
      data: {
        token: createAccessToken({
          id: user.id,
          role: user.role.name,
          sessionVersion: user.sessionVersion,
        }),
        user: { id: user.id, name: user.name, email: user.email, role: user.role.name },
      },
    });
  } catch {
    res.status(500).json({ success: false, error: 'Unable to sign in' });
  }
});

router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user?.id },
      include: { role: true },
    });
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    res.json({
      success: true,
      data: { id: user.id, name: user.name, email: user.email, role: user.role.name },
    });
  } catch {
    res.status(500).json({ success: false, error: 'Unable to load user profile' });
  }
});

router.post('/change-password', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const result = passwordChangeSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ success: false, error: 'Current password and a new 12-character password are required' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    const validPassword = user ? await bcrypt.compare(result.data.currentPassword, user.passwordHash) : false;
    if (!user || !validPassword) {
      res.status(401).json({ success: false, error: 'Current password is incorrect' });
      return;
    }

    const authorization = req.header('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    await prisma.$transaction(async (database) => {
      await database.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await bcrypt.hash(result.data.newPassword, 12),
          sessionVersion: { increment: 1 },
        },
      });
      await database.auditLog.create({
        data: {
          userId: user.id,
          action: 'PASSWORD_CHANGED',
          entity: 'User',
          entityId: user.id,
        },
      });
    });
    if (token) revokeAccessToken(token);
    res.json({ success: true, data: { requiresLogin: true } });
  } catch {
    res.status(500).json({ success: false, error: 'Unable to change password' });
  }
});

router.post('/logout', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const authorization = req.header('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
  if (token) revokeAccessToken(token);
  res.json({ success: true, data: { loggedOut: true } });
});

export default router;