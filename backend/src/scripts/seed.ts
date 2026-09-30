import bcrypt from 'bcrypt';
import prisma from '../lib/prisma';

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The development seed cannot run in production');
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
  await prisma.category.upsert({
    where: { name: 'General' },
    update: {},
    create: { name: 'General', description: 'Default development category' },
  });
  const developmentAccounts = [
    {
      name: 'PharmaSense Admin',
      email: 'admin@pharmasense.local',
      password: 'admin12345',
      role: 'Admin',
    },
    {
      name: 'PharmaSense Pharmacist',
      email: 'pharmacist@pharmasense.local',
      password: 'pharmacist12345',
      role: 'Pharmacist',
    },
    {
      name: 'PharmaSense Inventory Manager',
      email: 'manager@pharmasense.local',
      password: 'manager12345',
      role: 'Inventory Manager',
    },
    {
      name: 'PharmaSense Staff',
      email: 'staff@pharmasense.local',
      password: 'staff12345',
      role: 'Staff',
    },
  ];

  for (const account of developmentAccounts) {
    const role = savedRoles.find((savedRole) => savedRole.name === account.role);
    if (!role) throw new Error(`${account.role} role was not created`);

    const passwordHash = await bcrypt.hash(account.password, 12);
    await prisma.user.upsert({
      where: { email: account.email },
      update: { name: account.name, passwordHash, roleId: role.id },
      create: {
        name: account.name,
        email: account.email,
        passwordHash,
        roleId: role.id,
      },
    });
  }

  console.log('Local development accounts for all four roles are ready.');
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });