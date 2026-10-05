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

  const demoCategories = [
    'Analgesics',
    'Antibiotics',
    'Cardiovascular',
    'Diabetes Care',
    'Respiratory',
    'Vitamins and Supplements',
  ];
  const demoSuppliers = [
    { name: 'Northstar Demo Pharmaceuticals', contactInfo: 'northstar-demo@pharmasense.local' },
    { name: 'Evergreen Demo Medical Supply', contactInfo: 'evergreen-demo@pharmasense.local' },
    { name: 'Cedar Demo Healthcare Distribution', contactInfo: 'cedar-demo@pharmasense.local' },
    { name: 'Harbor Demo Pharmacy Supply', contactInfo: 'harbor-demo@pharmasense.local' },
  ];
  const demoMedicines = [
    { genericName: 'Ibuprofen', dosageForm: 'Tablet', unit: 'tablet' },
    { genericName: 'Cetirizine', dosageForm: 'Tablet', unit: 'tablet' },
    { genericName: 'Loratadine', dosageForm: 'Tablet', unit: 'tablet' },
    { genericName: 'Omeprazole', dosageForm: 'Capsule', unit: 'capsule' },
    { genericName: 'Metformin', dosageForm: 'Tablet', unit: 'tablet' },
    { genericName: 'Amlodipine', dosageForm: 'Tablet', unit: 'tablet' },
    { genericName: 'Lisinopril', dosageForm: 'Tablet', unit: 'tablet' },
    { genericName: 'Atorvastatin', dosageForm: 'Tablet', unit: 'tablet' },
    { genericName: 'Salbutamol', dosageForm: 'Inhaler', unit: 'inhaler' },
    { genericName: 'Fluticasone', dosageForm: 'Nasal spray', unit: 'bottle' },
    { genericName: 'Azithromycin', dosageForm: 'Tablet', unit: 'tablet' },
    { genericName: 'Doxycycline', dosageForm: 'Capsule', unit: 'capsule' },
    { genericName: 'Cephalexin', dosageForm: 'Capsule', unit: 'capsule' },
    { genericName: 'Losartan', dosageForm: 'Tablet', unit: 'tablet' },
    { genericName: 'Aspirin', dosageForm: 'Tablet', unit: 'tablet' },
    { genericName: 'Furosemide', dosageForm: 'Tablet', unit: 'tablet' },
    { genericName: 'Insulin glargine', dosageForm: 'Injection', unit: 'vial' },
    { genericName: 'Gliclazide', dosageForm: 'Tablet', unit: 'tablet' },
    { genericName: 'Montelukast', dosageForm: 'Tablet', unit: 'tablet' },
    { genericName: 'Prednisolone', dosageForm: 'Tablet', unit: 'tablet' },
    { genericName: 'Ferrous sulfate', dosageForm: 'Tablet', unit: 'tablet' },
    { genericName: 'Folic acid', dosageForm: 'Tablet', unit: 'tablet' },
    { genericName: 'Calcium carbonate', dosageForm: 'Tablet', unit: 'tablet' },
    { genericName: 'Oral rehydration salts', dosageForm: 'Powder', unit: 'sachet' },
  ];

  await prisma.$transaction(async (database) => {
    const categories = await Promise.all(demoCategories.map((name) => database.category.upsert({
      where: { name },
      update: {},
      create: { name, description: 'Development demo dataset category' },
    })));
    const suppliers = await Promise.all(demoSuppliers.map(async (supplier) => {
      const existingSupplier = await database.supplier.findFirst({ where: { name: supplier.name } });
      return existingSupplier ?? database.supplier.create({ data: supplier });
    }));
    const now = new Date();
    const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const plans = [];

    for (const [index, item] of demoMedicines.entries()) {
      const barcode = `PS-DEMO-${String(index + 1).padStart(3, '0')}`;
      const medicine = await database.medicine.upsert({
        where: { barcode },
        update: {},
        create: {
          genericName: item.genericName,
          brandName: `Sample ${item.genericName}`,
          categoryId: categories[index % categories.length].id,
          manufacturer: 'PharmaSense Demo Manufacturer',
          dosageForm: item.dosageForm,
          barcode,
          reorderLevel: 20 + (index % 4) * 5,
          unit: item.unit,
        },
      });
      const supplier = suppliers[index % suppliers.length];

      for (let batchIndex = 0; batchIndex < 2; batchIndex += 1) {
        const remainingQuantity = batchIndex === 0
          ? (index % 8 === 0 ? 0 : index % 5 === 0 ? 4 : 30 + (index * 11) % 80)
          : (index % 7 === 0 ? 3 : 25 + (index * 13) % 75);
        const issuedQuantity = 15 + (index * 7 + batchIndex * 11) % 40;
        const expiryInDays = index % 6 === 0 ? 18 + batchIndex * 12 : 90 + (index * 37) % 500;
        const purchasePrice = Number((1.2 + (index % 8) * 0.15).toFixed(2));

        plans.push({
          medicine,
          supplier,
          batchNumber: `${barcode}-LOT-${batchIndex + 1}`,
          mfgDate: daysAgo(180),
          expiryDate: new Date(now.getTime() + expiryInDays * 24 * 60 * 60 * 1000),
          remainingQuantity,
          issuedQuantity,
          receivedQuantity: remainingQuantity + issuedQuantity,
          purchasePrice,
          sellingPrice: Number((purchasePrice * 1.25).toFixed(2)),
          batchIndex,
        });
      }
    }

    for (const supplier of suppliers) {
      const supplierPlans = plans.filter((plan) => plan.supplier.id === supplier.id);
      const purchaseNotes = `PHARMASENSE_DEMO_CATALOG_PURCHASE:${supplier.name}`;
      const existingPurchase = await database.purchase.findFirst({ where: { notes: purchaseNotes } });
      if (!existingPurchase) {
        await database.purchase.create({
          data: {
            supplierId: supplier.id,
            createdById: admin.id,
            status: 'RECEIVED',
            notes: purchaseNotes,
            createdAt: daysAgo(120),
            receivedAt: daysAgo(120),
            items: {
              create: supplierPlans.map((plan) => ({
                medicineId: plan.medicine.id,
                batchNumber: plan.batchNumber,
                mfgDate: plan.mfgDate,
                expiryDate: plan.expiryDate,
                quantity: plan.receivedQuantity,
                purchasePrice: plan.purchasePrice,
                sellingPrice: plan.sellingPrice,
              })),
            },
          },
        });
      }
    }

    for (const plan of plans) {
      const batch = await database.batch.upsert({
        where: {
          medicineId_batchNumber: {
            medicineId: plan.medicine.id,
            batchNumber: plan.batchNumber,
          },
        },
        update: {},
        create: {
          medicineId: plan.medicine.id,
          supplierId: plan.supplier.id,
          batchNumber: plan.batchNumber,
          mfgDate: plan.mfgDate,
          expiryDate: plan.expiryDate,
          quantity: plan.remainingQuantity,
          purchasePrice: plan.purchasePrice,
          sellingPrice: plan.sellingPrice,
        },
      });
      const movementCount = await database.stockTransaction.count({ where: { batchId: batch.id } });
      if (movementCount === 0) {
        await database.stockTransaction.create({
          data: {
            batchId: batch.id,
            userId: admin.id,
            type: 'IN',
            quantity: plan.receivedQuantity,
            timestamp: daysAgo(120),
            notes: 'PHARMASENSE_DEMO_SEED_RECEIPT',
          },
        });

        for (let movementIndex = 0; movementIndex < 5; movementIndex += 1) {
          const quantity = Math.floor(plan.issuedQuantity / 5)
            + (movementIndex < plan.issuedQuantity % 5 ? 1 : 0);
          await database.stockTransaction.create({
            data: {
              batchId: batch.id,
              userId: admin.id,
              type: 'OUT',
              quantity,
              timestamp: daysAgo(100 - movementIndex * 20 - plan.batchIndex * 3),
              notes: 'PHARMASENSE_DEMO_SEED_ISSUE',
            },
          });
        }
      }
    }

    const medicineIds = [...new Set(plans.map((plan) => plan.medicine.id))];
    for (const medicineId of medicineIds) {
      const medicinePlans = plans.filter((plan) => plan.medicine.id === medicineId);
      const currentQuantity = medicinePlans.reduce((total, plan) => total + plan.remainingQuantity, 0);
      const medicine = medicinePlans[0].medicine;

      if (currentQuantity <= medicine.reorderLevel) {
        const type = currentQuantity === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK';
        await database.alert.upsert({
          where: { fingerprint: `${type}:${medicineId}` },
          update: { quantity: currentQuantity },
          create: {
            fingerprint: `${type}:${medicineId}`,
            type,
            severity: currentQuantity === 0 ? 'critical' : 'warning',
            status: 'OPEN',
            message: `${medicine.genericName} demo stock is at or below its reorder level`,
            quantity: currentQuantity,
            medicineId,
          },
        });
      }

      for (const plan of medicinePlans.filter((candidate) => {
        const remainingDays = Math.ceil((candidate.expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        return remainingDays >= 0 && remainingDays <= 30;
      })) {
        const fingerprint = `EXPIRING_SOON:${medicineId}:${plan.batchNumber}`;
        const batch = await database.batch.findUniqueOrThrow({
          where: { medicineId_batchNumber: { medicineId, batchNumber: plan.batchNumber } },
        });
        await database.alert.upsert({
          where: { fingerprint },
          update: { quantity: plan.remainingQuantity, expiryDate: plan.expiryDate },
          create: {
            fingerprint,
            type: 'EXPIRING_SOON',
            severity: 'warning',
            status: 'OPEN',
            message: `${medicine.genericName} demo batch ${plan.batchNumber} expires soon`,
            quantity: plan.remainingQuantity,
            medicineId,
            batchId: batch.id,
            expiryDate: plan.expiryDate,
          },
        });
      }
    }
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