import bcrypt from 'bcrypt';
import { z } from 'zod';
import prisma from '../lib/prisma';

const emailResult = z.string().trim().email().safeParse(process.env.BOOTSTRAP_ADMIN_EMAIL);
const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

async function bootstrapAdmin() {
  if (!emailResult.success || !name || name.length > 100) {
    throw new Error('Set a valid BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_NAME');
  }
  if (!password || password.length < 16 || password.length > 100 || password.startsWith('replace-with-')) {
    throw new Error('Set a unique BOOTSTRAP_ADMIN_PASSWORD of at least 16 characters');
  }

  const email = emailResult.data.toLowerCase();
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    throw new Error('Bootstrap is allowed only before the first user exists');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction(async (database) => {
    const roleDefinitions = [
      { name: 'Admin', permissions: 'all' },
      { name: 'Pharmacist', permissions: 'medicine:write,stock:write' },
      { name: 'Inventory Manager', permissions: 'medicine:write,supplier:write,stock:write' },
      { name: 'Staff', permissions: 'inventory:read' },
    ];
    const roles = await Promise.all(roleDefinitions.map((role) => database.role.upsert({
      where: { name: role.name },
      update: { permissions: role.permissions },
      create: role,
    })));
    const adminRole = roles.find((role) => role.name === 'Admin');
    if (!adminRole) throw new Error('Admin role could not be created');

    await database.user.create({
      data: { name, email, passwordHash, roleId: adminRole.id },
    });
  });
  console.log(`Created the initial administrator account (${email}).`);
}

bootstrapAdmin()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Unable to bootstrap administrator');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
