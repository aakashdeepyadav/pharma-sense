import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { createAccessToken, requireAuth, AuthenticatedRequest, revokeAccessToken } from '../auth';
import { sendApiError } from '../lib/api';
import { passwordChangeSchema, profileUpdateSchema } from '../validation/schemas';

const router = Router();
const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(100),
});
const loginAttempts = new Map<string, { count: number; windowStartedAt: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_ATTEMPT_LIMIT = 10;

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

    if (!user || !validPassword) {
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

router.patch('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const result = profileUpdateSchema.safeParse(req.body);
  if (!result.success) {
    sendApiError(res, 400, 'VALIDATION_ERROR', 'Request validation failed', result.error.issues);
    return;
  }

  try {
    if (result.data.email) {
      const existing = await prisma.user.findFirst({
        where: { email: result.data.email, NOT: { id: req.user!.id } },
      });
      if (existing) {
        res.status(409).json({ success: false, error: 'That email address is already in use' });
        return;
      }
    }

    const user = await prisma.$transaction(async (database) => {
      const updated = await database.user.update({
        where: { id: req.user!.id },
        data: result.data,
        include: { role: true },
      });
      await database.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'AUTH_PROFILE_UPDATED',
          entity: 'User',
          entityId: req.user!.id,
          details: JSON.stringify({ fields: Object.keys(result.data) }),
        },
      });
      return updated;
    });

    res.json({
      success: true,
      data: { id: user.id, name: user.name, email: user.email, role: user.role.name },
    });
  } catch {
    sendApiError(res, 503, 'PROFILE_UPDATE_FAILED', 'Unable to update user profile');
  }
});

router.post('/change-password', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const result = passwordChangeSchema.safeParse(req.body);
  if (!result.success) {
    sendApiError(res, 400, 'VALIDATION_ERROR', 'Request validation failed', result.error.issues);
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { passwordHash: true },
    });
    if (!user || !(await bcrypt.compare(result.data.currentPassword, user.passwordHash))) {
      res.status(401).json({ success: false, error: 'Current password is incorrect' });
      return;
    }

    const passwordHash = await bcrypt.hash(result.data.newPassword, 12);
    await prisma.$transaction(async (database) => {
      await database.user.update({
        where: { id: req.user!.id },
        data: { passwordHash, sessionVersion: { increment: 1 } },
      });
      await database.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'AUTH_PASSWORD_CHANGED',
          entity: 'User',
          entityId: req.user!.id,
        },
      });
    });

    const authorization = req.header('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    if (token) await revokeAccessToken(token);
    res.json({ success: true, data: { passwordChanged: true } });
  } catch {
    sendApiError(res, 503, 'PASSWORD_CHANGE_FAILED', 'Unable to change password');
  }
});

router.post('/logout', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const authorization = req.header('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
  try {
    if (token) await revokeAccessToken(token);
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'AUTH_LOGGED_OUT',
        entity: 'User',
        entityId: req.user!.id,
      },
    });
    res.json({ success: true, data: { loggedOut: true } });
  } catch {
    sendApiError(res, 503, 'LOGOUT_FAILED', 'Unable to revoke authentication token');
  }
});

export default router;