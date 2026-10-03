import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { AuthenticatedRequest, requireRoles } from '../auth';
import { userCreateSchema, userPasswordResetSchema, userUpdateSchema } from '../validation/schemas';

const router = Router();
const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  active: true,
  role: { select: { id: true, name: true } },
} as const;

router.get('/roles', requireRoles('Admin'), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const roles = await prisma.role.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: roles });
  } catch {
    res.status(500).json({ success: false, error: 'Unable to load roles' });
  }
});

router.get('/', requireRoles('Admin'), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        role: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: users });
  } catch {
    res.status(500).json({ success: false, error: 'Unable to load users' });
  }
});

router.post('/', requireRoles('Admin'), async (req: AuthenticatedRequest, res: Response) => {
  const result = userCreateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ success: false, error: 'Provide a valid name, email, password, and role' });
    return;
  }

  try {
    const role = await prisma.role.findUnique({ where: { id: result.data.roleId } });
    if (!role) {
      res.status(400).json({ success: false, error: 'Selected role does not exist' });
      return;
    }

    const passwordHash = await bcrypt.hash(result.data.password, 12);
    const user = await prisma.$transaction(async (database) => {
      const createdUser = await database.user.create({
        data: {
          name: result.data.name,
          email: result.data.email,
          passwordHash,
          roleId: role.id,
        },
        select: safeUserSelect,
      });
      await database.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'USER_CREATED',
          entity: 'User',
          entityId: createdUser.id,
          details: JSON.stringify({ email: createdUser.email, role: role.name }),
        },
      });
      return createdUser;
    });
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ success: false, error: 'A user with this email already exists' });
      return;
    }
    res.status(500).json({ success: false, error: 'Unable to create user' });
  }
});

router.patch('/:id', requireRoles('Admin'), async (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ success: false, error: 'User id must be a positive integer' });
    return;
  }

  const result = userUpdateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ success: false, error: 'Provide at least one valid user field' });
    return;
  }

  try {
    const updatedUser = await prisma.$transaction(async (database) => {
      const existingUser = await database.user.findUnique({
        where: { id },
        include: { role: true },
      });
      if (!existingUser) throw new Error('USER_NOT_FOUND');

      const targetRole = result.data.roleId === undefined
        ? existingUser.role
        : await database.role.findUnique({ where: { id: result.data.roleId } });
      if (!targetRole) throw new Error('ROLE_NOT_FOUND');

      const deactivatingUser = existingUser.active && result.data.active === false;
      const removingAdmin = existingUser.role.name === 'Admin' && (
        targetRole.name !== 'Admin' || deactivatingUser
      );
      if (deactivatingUser && existingUser.id === req.user!.id) {
        throw new Error('CANNOT_DEACTIVATE_SELF');
      }
      if (removingAdmin) {
        const adminCount = await database.user.count({
          where: { active: true, role: { name: 'Admin' } },
        });
        if (adminCount <= 1) throw new Error('LAST_ADMIN');
      }

      const user = await database.user.update({
        where: { id },
        data: {
          ...(result.data.name === undefined ? {} : { name: result.data.name }),
          ...(result.data.email === undefined ? {} : { email: result.data.email }),
          ...(result.data.roleId === undefined ? {} : { roleId: targetRole.id }),
          ...(result.data.active === undefined ? {} : { active: result.data.active }),
          ...(deactivatingUser ? { sessionVersion: { increment: 1 } } : {}),
        },
        select: safeUserSelect,
      });
      await database.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'USER_UPDATED',
          entity: 'User',
          entityId: user.id,
          details: JSON.stringify(result.data),
        },
      });
      return user;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    res.json({ success: true, data: updatedUser });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ success: false, error: 'A user with this email already exists' });
      return;
    }
    if (error instanceof Error && error.message === 'USER_NOT_FOUND') {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    if (error instanceof Error && error.message === 'ROLE_NOT_FOUND') {
      res.status(400).json({ success: false, error: 'Selected role does not exist' });
      return;
    }
    if (error instanceof Error && ['CANNOT_DEMOTE_SELF', 'CANNOT_DEACTIVATE_SELF', 'LAST_ADMIN'].includes(error.message)) {
      res.status(409).json({ success: false, error: 'At least one administrator must remain active' });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      res.status(409).json({ success: false, error: 'User roles changed concurrently; retry the request' });
      return;
    }
    res.status(500).json({ success: false, error: 'Unable to update user' });
  }
});

router.post('/:id/reset-password', requireRoles('Admin'), async (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ success: false, error: 'User id must be a positive integer' });
    return;
  }

  const result = userPasswordResetSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ success: false, error: 'Password must be between 12 and 100 characters' });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(result.data.password, 12);
    const user = await prisma.$transaction(async (database) => {
      const updatedUser = await database.user.update({
        where: { id },
        data: { passwordHash, sessionVersion: { increment: 1 } },
        select: safeUserSelect,
      });
      await database.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'USER_PASSWORD_RESET',
          entity: 'User',
          entityId: updatedUser.id,
        },
      });
      return updatedUser;
    });
    res.json({ success: true, data: user });
  } catch {
    res.status(404).json({ success: false, error: 'User not found' });
  }
});

export default router;