import { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import prisma from './lib/prisma';

export type AuthenticatedRequest = Request & {
  user?: {
    id: number;
    role: string;
    sessionVersion: number;
  };
};

const JWT_ISSUER = 'pharmasense-api';
const JWT_AUDIENCE = 'pharmasense-client';
const JWT_ALGORITHM = 'HS256';
const JWT_SECRET_PLACEHOLDERS = new Set(['replace-with-a-long-random-secret']);

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  if (Buffer.byteLength(secret, 'utf8') < 32 || JWT_SECRET_PLACEHOLDERS.has(secret)) {
    throw new Error('JWT_SECRET must be a unique secret of at least 32 bytes');
  }
  return secret;
}

function tokenFingerprint(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const tokenVerificationOptions: jwt.VerifyOptions = {
  algorithms: [JWT_ALGORITHM],
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE,
};

export async function revokeAccessToken(token: string) {
  const payload = jwt.verify(token, getJwtSecret(), tokenVerificationOptions);
  if (typeof payload === 'string' || !('exp' in payload) || typeof payload.exp !== 'number') {
    throw new Error('Cannot revoke a token without an expiry');
  }

  const tokenHash = tokenFingerprint(token);
  await prisma.revokedAccessToken.upsert({
    where: { tokenHash },
    create: { tokenHash, expiresAt: new Date(payload.exp * 1000) },
    update: { expiresAt: new Date(payload.exp * 1000) },
  });
  await prisma.revokedAccessToken.deleteMany({ where: { expiresAt: { lte: new Date() } } });
}

export function validateJwtSecret() {
  getJwtSecret();
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authorization = req.header('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;

  if (!token) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, getJwtSecret(), tokenVerificationOptions);
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired authentication token' });
    return;
  }

  if (typeof payload === 'string' || !Number.isSafeInteger(payload.userId) || payload.userId < 1) {
    res.status(401).json({ success: false, error: 'Invalid authentication token' });
    return;
  }

  try {
    const tokenHash = tokenFingerprint(token);
    const revokedToken = await prisma.revokedAccessToken.findUnique({ where: { tokenHash } });
    if (revokedToken && revokedToken.expiresAt > new Date()) {
      res.status(401).json({ success: false, error: 'Invalid or expired authentication token' });
      return;
    }
    if (revokedToken) {
      await prisma.revokedAccessToken.deleteMany({ where: { tokenHash } });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { role: true },
    });
    if (!user || (
      typeof payload.sessionVersion === 'number'
      && payload.sessionVersion !== user.sessionVersion
    )) {
      res.status(401).json({ success: false, error: 'Invalid or expired authentication token' });
      return;
    }

    req.user = { id: user.id, role: user.role.name, sessionVersion: user.sessionVersion };
    next();
  } catch {
    res.status(503).json({ success: false, error: 'Authentication service unavailable' });
  }
}

export function createAccessToken(user: { id: number; role: string; sessionVersion?: number }) {
  return jwt.sign({
    userId: user.id,
    role: user.role,
    ...(user.sessionVersion === undefined ? {} : { sessionVersion: user.sessionVersion }),
  }, getJwtSecret(), {
    algorithm: JWT_ALGORITHM,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
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