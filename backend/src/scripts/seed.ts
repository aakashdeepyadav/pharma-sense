import bcrypt from 'bcrypt';
import prisma from '../lib/prisma';

async function seed() {
  const role = await prisma.role.upsert({
    where: { name: 'Admin' },
    update: { permissions: 'all' },
    create: { name: 'Admin', permissions: 'all' },
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