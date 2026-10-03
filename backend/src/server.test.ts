import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { app } from './server';
import { createAccessToken } from './auth';
import prisma from './lib/prisma';

let server: ReturnType<typeof app.listen>;
let baseUrl = '';

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

  it('revokes a token on logout', async () => {
    const token = createAccessToken({ id: 1, role: 'Admin' });
    const logoutResponse = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(logoutResponse.status, 200);

    const protectedResponse = await fetch(`${baseUrl}/api/v1/reports/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(protectedResponse.status, 401);
  });

  it('allows the seeded admin to read reports', async () => {
    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@pharmasense.local', password: 'admin12345' }),
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
        body: JSON.stringify({ email: 'admin@pharmasense.local', password: 'admin12345' }),
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

  it('rejects invalid forecast parameters', async () => {
    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@pharmasense.local', password: 'admin12345' }),
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

  it('denies Staff medicine writes', async () => {
    const response = await fetch(`${baseUrl}/api/v1/medicines`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${createAccessToken({ id: 1, role: 'Staff' })}`,
      },
      body: JSON.stringify({ genericName: 'Test', brandName: 'Test', categoryId: 1, unit: 'Tablet', reorderLevel: 1 }),
    });
    assert.equal(response.status, 403);
  });

  it('restricts audit visibility to management roles', async () => {
    const adminResponse = await fetch(`${baseUrl}/api/v1/audit-logs`, {
      headers: { Authorization: `Bearer ${createAccessToken({ id: 1, role: 'Admin' })}` },
    });
    assert.equal(adminResponse.status, 200);

    const staffResponse = await fetch(`${baseUrl}/api/v1/audit-logs`, {
      headers: { Authorization: `Bearer ${createAccessToken({ id: 1, role: 'Staff' })}` },
    });
    assert.equal(staffResponse.status, 403);
  });
});