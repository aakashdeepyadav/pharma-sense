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

router.post('/login', async (req: Request, res: Response) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
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
      res.status(401).json({ success: false, error: 'Invalid email or password' });
      return;
    }

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