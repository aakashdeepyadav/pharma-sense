import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { z } from 'zod';
import prisma from '../lib/prisma';
import {
  createAccessToken,
  createAuthenticationChallenge,
  readAuthenticationChallenge,
  requireAuth,
  AuthenticatedRequest,
  revokeAccessToken,
} from '../auth';
import { sendApiError } from '../lib/api';
import { passwordChangeSchema, profileUpdateSchema } from '../validation/schemas';
import {
  createTotpUri,
  decryptMfaSecret,
  encryptMfaSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  MFA_REQUIRED_ROLES,
  verifyTotp,
} from '../mfa';

dotenv.config();

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
const mfaAttempts = new Map<string, { count: number; windowStartedAt: number }>();
function allowMfaAttempt(userId: number) {
  const key = String(userId);
  const now = Date.now();
  const previous = mfaAttempts.get(key);
  const current = previous && now - previous.windowStartedAt < LOGIN_WINDOW_MS
    ? previous
    : { count: 0, windowStartedAt: now };
  if (current.count >= Math.min(LOGIN_ATTEMPT_LIMIT, 5)) return false;
  current.count += 1;
  mfaAttempts.set(key, current);
  return true;
}

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

    if (!user || !validPassword || !user.active) {
      loginAttempts.set(address, { count: attempts.count + 1, windowStartedAt: attempts.windowStartedAt });
      res.status(401).json({ success: false, error: 'Invalid email or password' });
      return;
    }

    loginAttempts.delete(address);

    if (user.mfaEnabled || (process.env.REQUIRE_PRIVILEGED_MFA === 'true' && MFA_REQUIRED_ROLES.has(user.role.name))) {
      const purpose = user.mfaEnabled ? 'mfa-verification' : 'mfa-enrollment';
      const challengeToken = createAuthenticationChallenge(user, purpose);
      res.json({
        success: true,
        data: {
          ...(user.mfaEnabled ? { mfaRequired: true } : { mfaSetupRequired: true }),
          challengeToken,
          user: { name: user.name, email: user.email },
        },
      });
      return;
    }

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

const mfaSetupSchema = z.object({ enrollmentToken: z.string().min(1) });
const mfaCodeSchema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().trim().min(6).max(32),
});

router.post('/mfa/setup', async (req: Request, res: Response) => {
  const input = mfaSetupSchema.safeParse(req.body);
  if (!input.success) {
    sendApiError(res, 400, 'VALIDATION_ERROR', 'A valid MFA enrollment token is required');
    return;
  }
  try {
    const challenge = readAuthenticationChallenge(input.data.enrollmentToken, 'mfa-enrollment');
    if (!allowMfaAttempt(challenge.userId)) {
      res.status(429).json({ success: false, error: 'Too many MFA enrollment attempts. Sign in again later.' });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: challenge.userId }, include: { role: true } });
    if (!user || !user.active || user.sessionVersion !== challenge.sessionVersion || user.mfaEnabled || !MFA_REQUIRED_ROLES.has(user.role.name)) {
      res.status(401).json({ success: false, error: 'MFA enrollment challenge is no longer valid' });
      return;
    }
    const secret = generateTotpSecret();
    const staged = await prisma.user.updateMany({
      where: { id: user.id, active: true, sessionVersion: challenge.sessionVersion, mfaEnabled: false },
      data: { mfaSecretEncrypted: encryptMfaSecret(secret), mfaRecoveryCodes: null, mfaLastUsedStep: null },
    });
    if (staged.count !== 1) {
      res.status(409).json({ success: false, error: 'MFA enrollment challenge is no longer valid' });
      return;
    }
    res.json({
      success: true,
      data: { secret, otpauthUrl: createTotpUri(secret, user.email) },
    });
  } catch {
    sendApiError(res, 401, 'MFA_ENROLLMENT_FAILED', 'Unable to start MFA enrollment. Sign in again and retry.');
  }
});

router.post('/mfa/confirm', async (req: Request, res: Response) => {
  const input = z.object({ enrollmentToken: z.string().min(1), code: z.string().trim().regex(/^\d{6}$/u) }).safeParse(req.body);
  if (!input.success) {
    sendApiError(res, 400, 'VALIDATION_ERROR', 'Enter the six-digit code from your authenticator app');
    return;
  }
  try {
    const challenge = readAuthenticationChallenge(input.data.enrollmentToken, 'mfa-enrollment');
    if (!allowMfaAttempt(challenge.userId)) {
      res.status(429).json({ success: false, error: 'Too many MFA enrollment attempts. Sign in again later.' });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: challenge.userId }, include: { role: true } });
    if (!user || !user.active || user.sessionVersion !== challenge.sessionVersion || user.mfaEnabled || !user.mfaSecretEncrypted || !MFA_REQUIRED_ROLES.has(user.role.name)) {
      res.status(401).json({ success: false, error: 'MFA enrollment challenge is no longer valid' });
      return;
    }
    const secret = decryptMfaSecret(user.mfaSecretEncrypted);
    const acceptedStep = verifyTotp(secret, input.data.code);
    if (acceptedStep === null) {
      res.status(401).json({ success: false, error: 'The authenticator code is invalid or expired' });
      return;
    }

    const recoveryCodes = generateRecoveryCodes();
    const updated = await prisma.$transaction(async (database) => {
      const result = await database.user.updateMany({
        where: { id: user.id, sessionVersion: challenge.sessionVersion, mfaEnabled: false },
        data: {
          mfaEnabled: true,
          mfaLastUsedStep: acceptedStep,
          mfaRecoveryCodes: JSON.stringify(recoveryCodes.map(hashRecoveryCode)),
          sessionVersion: { increment: 1 },
        },
      });
      if (result.count !== 1) return false;
      await database.auditLog.create({ data: { userId: user.id, action: 'AUTH_MFA_ENABLED', entity: 'User', entityId: user.id } });
      return true;
    });
    if (!updated) {
      res.status(409).json({ success: false, error: 'MFA enrollment has already been completed' });
      return;
    }
    mfaAttempts.delete(String(user.id));

    res.json({
      success: true,
      data: {
        token: createAccessToken({ id: user.id, role: user.role.name, sessionVersion: challenge.sessionVersion + 1 }),
        user: { id: user.id, name: user.name, email: user.email, role: user.role.name },
        recoveryCodes,
      },
    });
  } catch {
    sendApiError(res, 401, 'MFA_ENROLLMENT_FAILED', 'Unable to confirm MFA enrollment. Sign in again and retry.');
  }
});

router.post('/mfa/verify', async (req: Request, res: Response) => {
  const input = mfaCodeSchema.safeParse(req.body);
  if (!input.success) {
    sendApiError(res, 400, 'VALIDATION_ERROR', 'Enter an authenticator code or recovery code');
    return;
  }
  try {
    const challenge = readAuthenticationChallenge(input.data.challengeToken, 'mfa-verification');
    if (!allowMfaAttempt(challenge.userId)) {
      res.status(429).json({ success: false, error: 'Too many MFA attempts. Sign in again later.' });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: challenge.userId }, include: { role: true } });
    if (!user || !user.active || user.sessionVersion !== challenge.sessionVersion || !user.mfaEnabled || !user.mfaSecretEncrypted) {
      res.status(401).json({ success: false, error: 'MFA challenge is no longer valid' });
      return;
    }

    const code = input.data.code.replaceAll('-', '').toUpperCase();
    const secret = decryptMfaSecret(user.mfaSecretEncrypted);
    const acceptedStep = /^\d{6}$/u.test(code) ? verifyTotp(secret, code) : null;
    let authenticated = false;
    if (acceptedStep !== null) {
      const consumed = await prisma.user.updateMany({
        where: {
          id: user.id,
          mfaEnabled: true,
          sessionVersion: challenge.sessionVersion,
          OR: [{ mfaLastUsedStep: null }, { mfaLastUsedStep: { lt: acceptedStep } }],
        },
        data: { mfaLastUsedStep: acceptedStep },
      });
      authenticated = consumed.count === 1;
    } else {
      const hashes = user.mfaRecoveryCodes ? JSON.parse(user.mfaRecoveryCodes) as string[] : [];
      const codeHash = hashRecoveryCode(code);
      const index = hashes.indexOf(codeHash);
      if (index >= 0) {
        hashes.splice(index, 1);
        const consumed = await prisma.$transaction(async (database) => {
          const result = await database.user.updateMany({
            where: { id: user.id, mfaEnabled: true, sessionVersion: challenge.sessionVersion, mfaRecoveryCodes: user.mfaRecoveryCodes },
            data: { mfaRecoveryCodes: JSON.stringify(hashes) },
          });
          if (result.count !== 1) return false;
          await database.auditLog.create({ data: { userId: user.id, action: 'AUTH_MFA_RECOVERY_USED', entity: 'User', entityId: user.id } });
          return true;
        });
        authenticated = consumed;
      }
    }

    if (!authenticated) {
      res.status(401).json({ success: false, error: 'The authenticator or recovery code is invalid or already used' });
      return;
    }
    mfaAttempts.delete(String(user.id));
    res.json({
      success: true,
      data: {
        token: createAccessToken({ id: user.id, role: user.role.name, sessionVersion: user.sessionVersion }),
        user: { id: user.id, name: user.name, email: user.email, role: user.role.name },
      },
    });
  } catch {
    sendApiError(res, 401, 'MFA_VERIFICATION_FAILED', 'Unable to verify MFA. Sign in again and retry.');
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
