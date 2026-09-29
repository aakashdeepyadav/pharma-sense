import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export type AuthenticatedRequest = Request & {
  user?: {
    id: number;
    role: string;
  };
};

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authorization = req.header('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;

  if (!token) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    if (typeof payload === 'string' || typeof payload.userId !== 'number' || typeof payload.role !== 'string') {
      res.status(401).json({ success: false, error: 'Invalid authentication token' });
      return;
    }

    req.user = { id: payload.userId, role: payload.role };
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired authentication token' });
  }
}

export function createAccessToken(user: { id: number; role: string }) {
  return jwt.sign({ userId: user.id, role: user.role }, getJwtSecret(), { expiresIn: '2h' });
}