import { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
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

const revokedAccessTokens = new Map<string, number>();
const ACCESS_TOKEN_LIFETIME_MS = 2 * 60 * 60 * 1000;

function tokenFingerprint(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function isTokenRevoked(token: string) {
  const fingerprint = tokenFingerprint(token);
  const expiresAt = revokedAccessTokens.get(fingerprint);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    revokedAccessTokens.delete(fingerprint);
    return false;
  }
  return true;
}

export function revokeAccessToken(token: string) {
  revokedAccessTokens.set(tokenFingerprint(token), Date.now() + ACCESS_TOKEN_LIFETIME_MS);
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authorization = req.header('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;

  if (!token) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  if (isTokenRevoked(token)) {
    res.status(401).json({ success: false, error: 'Invalid or expired authentication token' });
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
  return jwt.sign({ userId: user.id, role: user.role }, getJwtSecret(), {
    expiresIn: '2h',
    jwtid: crypto.randomUUID(),
  });
}

export function requireRoles(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      res.status(403).json({ success: false, error: 'You do not have permission for this action' });
      return;
    }
    next();
  };
}