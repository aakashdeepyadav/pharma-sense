import bcrypt from 'bcrypt';
import prisma from '../lib/prisma';

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The development seed must not run in production');
  }
  const seedPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!seedPassword || seedPassword.length < 16 || seedPassword.startsWith('replace-with-')) {
    throw new Error('Set a unique SEED_ADMIN_PASSWORD of at least 16 characters for local seeding');
  }

  const roles = [
    { name: 'Admin', permissions: 'all' },
    { name: 'Pharmacist', permissions: 'medicine:write,stock:write' },
    { name: 'Inventory Manager', permissions: 'medicine:write,supplier:write,stock:write' },
    { name: 'Staff', permissions: 'inventory:read' },
  ];
  const savedRoles = await Promise.all(roles.map((role) => prisma.role.upsert({
    where: { name: role.name },
    update: { permissions: role.permissions },
    create: role,
  })));
  const role = savedRoles.find((savedRole) => savedRole.name === 'Admin');
  if (!role) throw new Error('Admin role was not created');
  await prisma.category.upsert({
    where: { name: 'General' },
    update: {},
    create: { name: 'General', description: 'Default development category' },
  });
  const passwordHash = await bcrypt.hash(seedPassword, 12);

  await prisma.user.upsert({
    where: { email: 'admin@pharmasense.local' },
    update: { roleId: role.id, active: true, sessionVersion: 0, passwordHash },
    create: {
      name: 'PharmaSense Admin',
      email: 'admin@pharmasense.local',
      passwordHash,
      roleId: role.id,
    },
  });

  console.log('Development admin ready: admin@pharmasense.local');
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });