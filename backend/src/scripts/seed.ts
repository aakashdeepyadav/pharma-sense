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
  const category = await prisma.category.upsert({
    where: { name: 'General' },
    update: {},
    create: { name: 'General', description: 'Default development category' },
  });
  const passwordHash = await bcrypt.hash(seedPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@pharmasense.local' },
    update: { roleId: role.id, active: true, sessionVersion: 0, passwordHash },
    create: {
      name: 'PharmaSense Admin',
      email: 'admin@pharmasense.local',
      passwordHash,
      roleId: role.id,
    },
  });

  await prisma.$transaction(async (database) => {
    const supplier = await database.supplier.findFirst({ where: { name: 'PharmaSense Demo Supplier' } })
      ?? await database.supplier.create({
        data: { name: 'PharmaSense Demo Supplier', contactInfo: 'demo-supplier@pharmasense.local' },
      });
    const medicines = await Promise.all([
      database.medicine.upsert({
        where: { barcode: 'DEMO-PS-001' },
        update: {},
        create: {
          genericName: 'Paracetamol Demo',
          brandName: 'Demo Relief 500',
          categoryId: category.id,
          manufacturer: 'PharmaSense Sample Manufacturer',
          dosageForm: 'Tablet',
          barcode: 'DEMO-PS-001',
          reorderLevel: 15,
          unit: 'tablet',
        },
      }),
      database.medicine.upsert({
        where: { barcode: 'DEMO-PS-002' },
        update: {},
        create: {
          genericName: 'Amoxicillin Demo',
          brandName: 'Demo Care 250',
          categoryId: category.id,
          manufacturer: 'PharmaSense Sample Manufacturer',
          dosageForm: 'Capsule',
          barcode: 'DEMO-PS-002',
          reorderLevel: 10,
          unit: 'capsule',
        },
      }),
    ]);
    const purchaseNotes = 'PHARMASENSE_DEMO_SEED_PURCHASE';
    const existingPurchase = await database.purchase.findFirst({ where: { notes: purchaseNotes } });
    if (!existingPurchase) {
      await database.purchase.create({
        data: {
          supplierId: supplier.id,
          createdById: admin.id,
          status: 'RECEIVED',
          notes: purchaseNotes,
          receivedAt: new Date(),
          items: {
            create: [
              {
                medicineId: medicines[0].id,
                batchNumber: 'DEMO-LOT-001',
                mfgDate: new Date('2026-01-01T00:00:00.000Z'),
                expiryDate: new Date('2027-12-31T00:00:00.000Z'),
                quantity: 60,
                purchasePrice: 0.1,
                sellingPrice: 0.25,
              },
              {
                medicineId: medicines[1].id,
                batchNumber: 'DEMO-LOT-002',
                mfgDate: new Date('2026-01-01T00:00:00.000Z'),
                expiryDate: new Date('2026-10-20T00:00:00.000Z'),
                quantity: 8,
                purchasePrice: 0.2,
                sellingPrice: 0.4,
              },
            ],
          },
        },
      });
    }

    const demoBatches = [
      {
        medicine: medicines[0],
        batchNumber: 'DEMO-LOT-001',
        mfgDate: new Date('2026-01-01T00:00:00.000Z'),
        expiryDate: new Date('2027-12-31T00:00:00.000Z'),
        quantity: 60,
        purchasePrice: 0.1,
        sellingPrice: 0.25,
      },
      {
        medicine: medicines[1],
        batchNumber: 'DEMO-LOT-002',
        mfgDate: new Date('2026-01-01T00:00:00.000Z'),
        expiryDate: new Date('2026-10-20T00:00:00.000Z'),
        quantity: 8,
        purchasePrice: 0.2,
        sellingPrice: 0.4,
      },
    ];

    for (const demoBatch of demoBatches) {
      const batch = await database.batch.upsert({
        where: {
          medicineId_batchNumber: {
            medicineId: demoBatch.medicine.id,
            batchNumber: demoBatch.batchNumber,
          },
        },
        update: {},
        create: {
          medicineId: demoBatch.medicine.id,
          supplierId: supplier.id,
          batchNumber: demoBatch.batchNumber,
          mfgDate: demoBatch.mfgDate,
          expiryDate: demoBatch.expiryDate,
          quantity: demoBatch.quantity,
          purchasePrice: demoBatch.purchasePrice,
          sellingPrice: demoBatch.sellingPrice,
        },
      });
      const movementCount = await database.stockTransaction.count({ where: { batchId: batch.id } });
      if (movementCount === 0) {
        await database.stockTransaction.create({
          data: {
            batchId: batch.id,
            userId: admin.id,
            type: 'IN',
            quantity: batch.quantity,
            notes: 'Demo seed purchase receipt',
          },
        });
      }
    }

    const lowStockMedicine = medicines[1];
    const lowStockBatch = await database.batch.findUniqueOrThrow({
      where: { medicineId_batchNumber: { medicineId: lowStockMedicine.id, batchNumber: 'DEMO-LOT-002' } },
    });
    await database.alert.upsert({
      where: { fingerprint: `LOW_STOCK:${lowStockMedicine.id}` },
      update: { quantity: lowStockBatch.quantity },
      create: {
        fingerprint: `LOW_STOCK:${lowStockMedicine.id}`,
        type: 'LOW_STOCK',
        severity: 'warning',
        status: 'OPEN',
        message: `${lowStockMedicine.genericName} is at or below its reorder level`,
        quantity: lowStockBatch.quantity,
        medicineId: lowStockMedicine.id,
      },
    });
    await database.alert.upsert({
      where: { fingerprint: `EXPIRING_SOON:${lowStockMedicine.id}:${lowStockBatch.id}` },
      update: { quantity: lowStockBatch.quantity, expiryDate: lowStockBatch.expiryDate },
      create: {
        fingerprint: `EXPIRING_SOON:${lowStockMedicine.id}:${lowStockBatch.id}`,
        type: 'EXPIRING_SOON',
        severity: 'warning',
        status: 'OPEN',
        message: `${lowStockMedicine.genericName} demo batch ${lowStockBatch.batchNumber} expires soon`,
        quantity: lowStockBatch.quantity,
        medicineId: lowStockMedicine.id,
        batchId: lowStockBatch.id,
        expiryDate: lowStockBatch.expiryDate,
      },
    });
  });

  console.log('Development demo data ready: admin@pharmasense.local');
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });