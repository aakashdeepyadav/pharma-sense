import { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
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
let revokedTokensStoragePath = process.env.REVOKED_TOKENS_PATH ?? path.resolve(process.cwd(), '.data', 'revoked-tokens.json');

function tokenFingerprint(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function ensureRevokedTokensStoragePath() {
  const directory = path.dirname(revokedTokensStoragePath);
  fs.mkdirSync(directory, { recursive: true });
  if (!fs.existsSync(revokedTokensStoragePath)) {
    fs.writeFileSync(revokedTokensStoragePath, '{}');
  }
}

function persistRevokedTokens() {
  ensureRevokedTokensStoragePath();
  const activeTokens = Object.fromEntries(
    [...revokedAccessTokens.entries()].filter(([, expiresAt]) => expiresAt > Date.now()),
  );
  fs.writeFileSync(revokedTokensStoragePath, JSON.stringify(activeTokens));
}

function loadRevokedTokens() {
  if (!fs.existsSync(revokedTokensStoragePath)) {
    return;
  }

  try {
    const raw = fs.readFileSync(revokedTokensStoragePath, 'utf8');
    const data = raw ? JSON.parse(raw) : {};
    for (const [fingerprint, expiresAt] of Object.entries(data as Record<string, number>)) {
      if (typeof expiresAt === 'number' && expiresAt > Date.now()) {
        revokedAccessTokens.set(fingerprint, expiresAt);
      }
    }
  } catch {
    revokedAccessTokens.clear();
  }
}

export function configureRevokedTokensStorage(storagePath?: string) {
  revokedTokensStoragePath = storagePath ?? process.env.REVOKED_TOKENS_PATH ?? path.resolve(process.cwd(), '.data', 'revoked-tokens.json');
  revokedAccessTokens.clear();
  loadRevokedTokens();
  persistRevokedTokens();
}

function isTokenRevoked(token: string) {
  const fingerprint = tokenFingerprint(token);
  const expiresAt = revokedAccessTokens.get(fingerprint);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    revokedAccessTokens.delete(fingerprint);
    persistRevokedTokens();
    return false;
  }
  return true;
}

export function revokeAccessToken(token: string) {
  revokedAccessTokens.set(tokenFingerprint(token), Date.now() + ACCESS_TOKEN_LIFETIME_MS);
  persistRevokedTokens();
}

loadRevokedTokens();

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