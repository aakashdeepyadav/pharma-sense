import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { app } from './server';
import { createAccessToken } from './auth';
import prisma from './lib/prisma';

let server: ReturnType<typeof app.listen>;
let baseUrl = '';
const seededAdminPassword = process.env.SEED_ADMIN_PASSWORD ?? '';

async function createUserForRole(roleName: string) {
  const role = await prisma.role.findUnique({ where: { name: roleName } });
  assert.ok(role, `Expected seeded ${roleName} role`);
  return prisma.user.create({
    data: {
      name: `${roleName} Authorization Test`,
      email: `authz-${crypto.randomUUID()}@pharmasense.local`,
      passwordHash: 'test-only-unused-password-hash',
      roleId: role.id,
    },
  });
}

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe('PharmaSense API', () => {
  it('reports database health', async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', database: 'ok' });
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('x-powered-by'), null);
  });

  it('protects inventory routes from anonymous access', async () => {
    const response = await fetch(`${baseUrl}/api/v1/medicines`);
    assert.equal(response.status, 401);
  });

  it('rejects invalid login input', async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: 'short' }),
    });
    assert.equal(response.status, 400);
  });

  it('rejects undersized JWT signing secrets', () => {
    const originalSecret = process.env.JWT_SECRET;
    try {
      process.env.JWT_SECRET = 'too-short';
      assert.throws(() => createAccessToken({ id: 1, role: 'Admin' }), /at least 32 bytes/);
      process.env.JWT_SECRET = 'replace-with-a-long-random-secret';
      assert.throws(() => createAccessToken({ id: 1, role: 'Admin' }), /unique secret/);
    } finally {
      if (originalSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = originalSecret;
    }
  });

  it('revokes a token on logout', async () => {
    const token = createAccessToken({ id: 1, role: 'Admin' });
    const logoutResponse = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(logoutResponse.status, 200);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const savedRevocation = await prisma.revokedAccessToken.findUnique({ where: { tokenHash } });
    assert.ok(savedRevocation);
    assert.notEqual(savedRevocation.tokenHash, token);

    const protectedResponse = await fetch(`${baseUrl}/api/v1/reports/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(protectedResponse.status, 401);
  });

  it('allows the seeded admin to read reports', async () => {
    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@pharmasense.local', password: seededAdminPassword }),
    });
    assert.equal(loginResponse.status, 200);
    const login = (await loginResponse.json()) as { data: { token: string } };
    const response = await fetch(`${baseUrl}/api/v1/reports/summary`, {
      headers: { Authorization: `Bearer ${login.data.token}` },
    });
    assert.equal(response.status, 200);
    const result = (await response.json()) as { success: boolean; data: { medicineCount: number } };
    assert.equal(result.success, true);
    assert.equal(typeof result.data.medicineCount, 'number');
  });

  it('smokes an authenticated inventory receiving and issuing workflow', async () => {
    const runId = `smoke-${Date.now()}`;
    let categoryId: number | undefined;
    let supplierId: number | undefined;
    let medicineId: number | undefined;
    let batchId: number | undefined;

    try {
      const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@pharmasense.local', password: seededAdminPassword }),
      });
      assert.equal(loginResponse.status, 200);
      const login = (await loginResponse.json()) as { data: { token: string } };
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${login.data.token}`,
      };

      const categoryResponse = await fetch(`${baseUrl}/api/v1/categories`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: `${runId}-category` }),
      });
      assert.equal(categoryResponse.status, 201);
      categoryId = ((await categoryResponse.json()) as { data: { id: number } }).data.id;

      const supplierResponse = await fetch(`${baseUrl}/api/v1/suppliers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: `${runId}-supplier` }),
      });
      assert.equal(supplierResponse.status, 201);
      supplierId = ((await supplierResponse.json()) as { data: { id: number } }).data.id;

      const medicineResponse = await fetch(`${baseUrl}/api/v1/medicines`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          genericName: `${runId}-medicine`,
          brandName: `${runId}-brand`,
          categoryId,
          reorderLevel: 2,
          unit: 'Tablet',
        }),
      });
      assert.equal(medicineResponse.status, 201);
      medicineId = ((await medicineResponse.json()) as { data: { id: number } }).data.id;

      const batchResponse = await fetch(`${baseUrl}/api/v1/batches`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          medicineId,
          supplierId,
          batchNumber: `${runId}-batch`,
          mfgDate: '2025-01-01',
          expiryDate: '2030-01-01',
          quantity: 12,
          purchasePrice: 1.25,
          sellingPrice: 2.5,
        }),
      });
      assert.equal(batchResponse.status, 201);
      batchId = ((await batchResponse.json()) as { data: { id: number } }).data.id;

      const issueResponse = await fetch(`${baseUrl}/api/v1/inventory/transactions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ batchId, type: 'OUT', quantity: 5, notes: runId }),
      });
      assert.equal(issueResponse.status, 201);

      const batchListResponse = await fetch(`${baseUrl}/api/v1/batches`, { headers });
      assert.equal(batchListResponse.status, 200);
      const batches = (await batchListResponse.json()) as {
        data: Array<{ id: number; quantity: number }>;
      };
      assert.equal(batches.data.find((batch) => batch.id === batchId)?.quantity, 7);
    } finally {
      await prisma.auditLog.deleteMany({ where: { details: { contains: runId } } });
      if (batchId) {
        await prisma.stockTransaction.deleteMany({ where: { batchId } });
        await prisma.batch.deleteMany({ where: { id: batchId } });
      }
      if (medicineId) await prisma.medicine.deleteMany({ where: { id: medicineId } });
      if (supplierId) await prisma.supplier.deleteMany({ where: { id: supplierId } });
      if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
    }
  });

  it('records a replenishment review decision for a medicine', async () => {
    const medicine = await prisma.medicine.findFirst();
    assert.ok(medicine, 'Expected a seeded medicine for replenishment review testing');

    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@pharmasense.local', password: seededAdminPassword }),
    });
    assert.equal(loginResponse.status, 200);
    const login = (await loginResponse.json()) as { data: { token: string } };

    const response = await fetch(`${baseUrl}/api/v1/reports/replenishment/decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${login.data.token}`,
      },
      body: JSON.stringify({ medicineId: medicine.id, decision: 'APPROVED', notes: 'Approved for review' }),
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as { success: boolean; data: { medicineId: number; decision: string } };
    assert.equal(body.success, true);
    assert.equal(body.data.medicineId, medicine.id);
    assert.equal(body.data.decision, 'APPROVED');

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'REPLENISHMENT_DECISION',
        entity: 'Medicine',
        entityId: medicine.id,
      },
    });
    assert.ok(audit);
    assert.match(audit.details ?? '', /APPROVED|Approved/i);
  });

  it('returns a forecast risk summary for medicines', async () => {
    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@pharmasense.local', password: seededAdminPassword }),
    });
    const login = (await loginResponse.json()) as { data: { token: string } };
    const response = await fetch(`${baseUrl}/api/v1/reports/forecast-risk`, {
      headers: { Authorization: `Bearer ${login.data.token}` },
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      success: boolean;
      data: Array<{ medicineId: number; riskLevel: string; monitoringStatus?: string }>;
    };
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.some((item) => typeof item.medicineId === 'number'));
    assert.ok(body.data.every((item) => ['LOW', 'MEDIUM', 'HIGH', 'INSUFFICIENT_DATA'].includes(item.riskLevel)));
    assert.ok(body.data.every((item) => !item.monitoringStatus || ['OK', 'WATCH', 'INSUFFICIENT_DATA'].includes(item.monitoringStatus)));
  });

  it('rejects invalid forecast parameters', async () => {
    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@pharmasense.local', password: seededAdminPassword }),
    });
    const login = (await loginResponse.json()) as { data: { token: string } };
    const response = await fetch(`${baseUrl}/api/v1/reports/forecast-baseline?medicineId=1&horizon=0`, {
      headers: { Authorization: `Bearer ${login.data.token}` },
    });
    assert.equal(response.status, 400);
  });

  it('rejects invalid purchase requests', async () => {
    const token = createAccessToken({ id: 1, role: 'Admin' });
    const createResponse = await fetch(`${baseUrl}/api/v1/purchases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ supplierId: 1, items: [] }),
    });
    assert.equal(createResponse.status, 400);

    const detailResponse = await fetch(`${baseUrl}/api/v1/purchases/not-an-id`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(detailResponse.status, 400);
  });

  it('validates medicine search filters', async () => {
    const token = createAccessToken({ id: 1, role: 'Admin' });
    const invalidResponse = await fetch(`${baseUrl}/api/v1/medicines?active=maybe`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(invalidResponse.status, 400);

    const searchResponse = await fetch(`${baseUrl}/api/v1/medicines?search=tablet`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(searchResponse.status, 200);
  });

  it('validates supplier search filters', async () => {
    const token = createAccessToken({ id: 1, role: 'Admin' });
    const response = await fetch(`${baseUrl}/api/v1/suppliers?search=${'x'.repeat(151)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 400);
  });

  it('searches suppliers by contact information', async () => {
    const token = createAccessToken({ id: 1, role: 'Admin' });
    const runId = `supplier-search-${crypto.randomUUID()}`;
    let supplierId: number | undefined;
    try {
      const createResponse = await fetch(`${baseUrl}/api/v1/suppliers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: `${runId}-name`, contactInfo: `${runId}-contact` }),
      });
      assert.equal(createResponse.status, 201);
      supplierId = ((await createResponse.json()) as { data: { id: number } }).data.id;

      const response = await fetch(`${baseUrl}/api/v1/suppliers?search=${runId}-contact`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(response.status, 200);
      const result = (await response.json()) as { data: Array<{ id: number }> };
      assert.equal(result.data.some((supplier) => supplier.id === supplierId), true);
    } finally {
      if (supplierId) await prisma.supplier.delete({ where: { id: supplierId } });
    }
  });

  it('enforces session invalidation after an account lifecycle change', async () => {
    const user = await createUserForRole('Staff');
    const token = createAccessToken({ id: user.id, role: 'Staff', sessionVersion: user.sessionVersion });
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { sessionVersion: { increment: 1 } },
      });
      const response = await fetch(`${baseUrl}/api/v1/medicines`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(response.status, 401);
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it('atomically receives purchases and rejects duplicate, insufficient, and expired stock operations', async () => {
    const token = createAccessToken({ id: 1, role: 'Admin' });
    const runId = `purchase-${crypto.randomUUID()}`;
    const category = await prisma.category.create({ data: { name: `${runId}-category` } });
    const supplier = await prisma.supplier.create({ data: { name: `${runId}-supplier` } });
    const medicine = await prisma.medicine.create({
      data: {
        genericName: `${runId}-medicine`,
        brandName: `${runId}-brand`,
        categoryId: category.id,
        reorderLevel: 1,
        unit: 'Tablet',
      },
    });
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    let purchaseId: number | undefined;
    let duplicatePurchaseId: number | undefined;
    let receivedBatchId: number | undefined;
    let expiredBatchId: number | undefined;

    try {
      const purchaseBody = {
        supplierId: supplier.id,
        items: [{
          medicineId: medicine.id,
          batchNumber: `${runId}-batch`,
          mfgDate: '2025-01-01',
          expiryDate: '2030-01-01',
          quantity: 3,
          purchasePrice: 1,
          sellingPrice: 2,
        }],
      };
      const createResponse = await fetch(`${baseUrl}/api/v1/purchases`, {
        method: 'POST',
        headers,
        body: JSON.stringify(purchaseBody),
      });
      assert.equal(createResponse.status, 201);
      purchaseId = ((await createResponse.json()) as { data: { id: number } }).data.id;

      const receiveResponse = await fetch(`${baseUrl}/api/v1/purchases/${purchaseId}/receive`, {
        method: 'POST',
        headers,
      });
      assert.equal(receiveResponse.status, 200);
      receivedBatchId = (await prisma.batch.findFirstOrThrow({
        where: { medicineId: medicine.id, batchNumber: `${runId}-batch` },
      })).id;

      const duplicateCreateResponse = await fetch(`${baseUrl}/api/v1/purchases`, {
        method: 'POST',
        headers,
        body: JSON.stringify(purchaseBody),
      });
      assert.equal(duplicateCreateResponse.status, 201);
      duplicatePurchaseId = ((await duplicateCreateResponse.json()) as { data: { id: number } }).data.id;
      const duplicateReceiveResponse = await fetch(`${baseUrl}/api/v1/purchases/${duplicatePurchaseId}/receive`, {
        method: 'POST',
        headers,
      });
      assert.equal(duplicateReceiveResponse.status, 409);
      assert.equal(await prisma.batch.count({ where: { medicineId: medicine.id } }), 1);

      const insufficientResponse = await fetch(`${baseUrl}/api/v1/inventory/transactions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ batchId: receivedBatchId, type: 'OUT', quantity: 4 }),
      });
      assert.equal(insufficientResponse.status, 409);
      assert.equal((await prisma.batch.findUniqueOrThrow({ where: { id: receivedBatchId } })).quantity, 3);

      const expiredResponse = await fetch(`${baseUrl}/api/v1/batches`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          medicineId: medicine.id,
          supplierId: supplier.id,
          batchNumber: `${runId}-expired`,
          mfgDate: '2020-01-01',
          expiryDate: '2021-01-01',
          quantity: 2,
          purchasePrice: 1,
          sellingPrice: 2,
        }),
      });
      assert.equal(expiredResponse.status, 201);
      expiredBatchId = ((await expiredResponse.json()) as { data: { id: number } }).data.id;
      const expiredIssueResponse = await fetch(`${baseUrl}/api/v1/inventory/transactions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ batchId: expiredBatchId, type: 'OUT', quantity: 1 }),
      });
      assert.equal(expiredIssueResponse.status, 409);
      assert.equal((await prisma.batch.findUniqueOrThrow({ where: { id: expiredBatchId } })).quantity, 2);
    } finally {
      await prisma.auditLog.deleteMany({ where: { userId: 1, entityId: { in: [purchaseId, duplicatePurchaseId, receivedBatchId, expiredBatchId].filter((id): id is number => id !== undefined) } } });
      await prisma.stockTransaction.deleteMany({ where: { batchId: { in: [receivedBatchId, expiredBatchId].filter((id): id is number => id !== undefined) } } });
      await prisma.batch.deleteMany({ where: { medicineId: medicine.id } });
      await prisma.purchase.deleteMany({ where: { id: { in: [purchaseId, duplicatePurchaseId].filter((id): id is number => id !== undefined) } } });
      await prisma.medicine.delete({ where: { id: medicine.id } });
      await prisma.supplier.delete({ where: { id: supplier.id } });
      await prisma.category.delete({ where: { id: category.id } });
    }
  });

  it('denies Staff medicine writes', async () => {
    const staff = await createUserForRole('Staff');
    try {
      const response = await fetch(`${baseUrl}/api/v1/medicines`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${createAccessToken({ id: staff.id, role: 'Admin' })}`,
        },
        body: JSON.stringify({ genericName: 'Test', brandName: 'Test', categoryId: 1, unit: 'Tablet', reorderLevel: 1 }),
      });
      assert.equal(response.status, 403);
    } finally {
      await prisma.user.delete({ where: { id: staff.id } });
    }
  });

  it('restricts audit visibility to management roles', async () => {
    const adminResponse = await fetch(`${baseUrl}/api/v1/audit-logs`, {
      headers: { Authorization: `Bearer ${createAccessToken({ id: 1, role: 'Admin' })}` },
    });
    assert.equal(adminResponse.status, 200);

    const staff = await createUserForRole('Staff');
    try {
      const staffResponse = await fetch(`${baseUrl}/api/v1/audit-logs`, {
        headers: { Authorization: `Bearer ${createAccessToken({ id: staff.id, role: 'Admin' })}` },
      });
      assert.equal(staffResponse.status, 403);
    } finally {
      await prisma.user.delete({ where: { id: staff.id } });
    }
  });

  it('changes a user password and invalidates the previous session', async () => {
    const role = await prisma.role.findUnique({ where: { name: 'Admin' } });
    assert.ok(role);
    const email = `password-test-${crypto.randomUUID()}@pharmasense.local`;
    const oldPassword = 'old-password-for-test';
    const newPassword = 'new-password-for-test';
    const user = await prisma.user.create({
      data: {
        name: 'Password Change Test User',
        email,
        passwordHash: await bcrypt.hash(oldPassword, 12),
        roleId: role.id,
      },
    });
    const token = createAccessToken({ id: user.id, role: role.name });

    try {
      const response = await fetch(`${baseUrl}/api/v1/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword: oldPassword, newPassword }),
      });
      assert.equal(response.status, 200);

      const staleSessionResponse = await fetch(`${baseUrl}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(staleSessionResponse.status, 401);

      const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: newPassword }),
      });
      assert.equal(loginResponse.status, 200);
    } finally {
      await prisma.auditLog.deleteMany({ where: { entity: 'User', entityId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it('updates the current user profile and rejects duplicate email addresses', async () => {
    const role = await prisma.role.findUnique({ where: { name: 'Admin' } });
    assert.ok(role);
    const email = `profile-test-${crypto.randomUUID()}@pharmasense.local`;
    const duplicateEmail = 'admin@pharmasense.local';
    const user = await prisma.user.create({
      data: {
        name: 'Profile Test User',
        email,
        passwordHash: 'test-only-unused-password-hash',
        roleId: role.id,
      },
    });
    const token = createAccessToken({ id: user.id, role: role.name });

    try {
      const updateResponse = await fetch(`${baseUrl}/api/v1/auth/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: 'Updated Profile User', email: `updated-${email}` }),
      });
      assert.equal(updateResponse.status, 200);
      const updated = (await updateResponse.json()) as {
        data: { name: string; email: string; role: string };
      };
      assert.equal(updated.data.name, 'Updated Profile User');
      assert.equal(updated.data.email, `updated-${email}`);
      assert.equal(updated.data.role, 'Admin');

      const duplicateResponse = await fetch(`${baseUrl}/api/v1/auth/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: duplicateEmail }),
      });
      assert.equal(duplicateResponse.status, 409);
    } finally {
      await prisma.auditLog.deleteMany({ where: { entity: 'User', entityId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});