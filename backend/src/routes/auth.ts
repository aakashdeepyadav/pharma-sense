import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { createAccessToken, requireAuth, AuthenticatedRequest } from '../auth';

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
        token: createAccessToken({ id: user.id, role: user.role.name }),
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

export default router;