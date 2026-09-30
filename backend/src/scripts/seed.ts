import bcrypt from 'bcrypt';
import prisma from '../lib/prisma';

async function seed() {
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
  const passwordHash = await bcrypt.hash('admin12345', 12);

  await prisma.user.upsert({
    where: { email: 'admin@pharmasense.local' },
    update: { roleId: role.id },
    create: {
      name: 'PharmaSense Admin',
      email: 'admin@pharmasense.local',
      passwordHash,
      roleId: role.id,
    },
  });

  console.log('Development admin ready: admin@pharmasense.local / admin12345');
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });