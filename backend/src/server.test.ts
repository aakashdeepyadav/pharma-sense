import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { app } from './server';
import { configureRevokedTokensStorage, createAccessToken, revokeAccessToken } from './auth';
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

  it('rate limits repeated requests per client and route with CORS headers', async () => {
    const clientIp = '203.0.113.250';
    const origin = 'http://localhost:5173';
    let rateLimited = false;

    for (let index = 0; index < 45; index += 1) {
      const response = await fetch(`${baseUrl}/health`, {
        headers: { 'X-Forwarded-For': clientIp, Origin: origin },
      });
      if (response.status === 429) {
        rateLimited = true;
        assert.equal(response.headers.get('access-control-allow-origin'), origin);
        const body = (await response.json()) as { error?: { code?: string; message?: string } };
        assert.equal(body.error?.code, 'RATE_LIMIT_EXCEEDED');
        break;
      }
    }

    assert.equal(rateLimited, true);
    const otherRouteResponse = await fetch(`${baseUrl}/`, {
      headers: { 'X-Forwarded-For': clientIp, Origin: origin },
    });
    assert.equal(otherRouteResponse.status, 200);
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

  it('persists revoked tokens to disk for server restarts', () => {
    const storagePath = path.join(process.cwd(), '.tmp-revoked-tokens.json');
    configureRevokedTokensStorage(storagePath);
    const token = createAccessToken({ id: 2, role: 'Admin' });
    revokeAccessToken(token);

    const saved = JSON.parse(fs.readFileSync(storagePath, 'utf8')) as Record<string, number>;
    assert.ok(Object.keys(saved).length >= 1);
    const tokens = Object.values(saved);
    assert.ok(tokens.some((value) => typeof value === 'number' && value > Date.now()));
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

  it('allows each seeded development role to sign in with its assigned role', async () => {
    const developmentAccounts = [
      { email: 'admin@pharmasense.local', password: 'admin12345', role: 'Admin' },
      { email: 'pharmacist@pharmasense.local', password: 'pharmacist12345', role: 'Pharmacist' },
      { email: 'manager@pharmasense.local', password: 'manager12345', role: 'Inventory Manager' },
      { email: 'staff@pharmasense.local', password: 'staff12345', role: 'Staff' },
    ];

    for (const account of developmentAccounts) {
      const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: account.email, password: account.password }),
      });
      assert.equal(response.status, 200);
      const result = (await response.json()) as {
        data: { token: string; user: { role: string } };
      };
      assert.equal(result.data.user.role, account.role);

      if (account.role === 'Staff') {
        const writeResponse = await fetch(`${baseUrl}/api/v1/medicines`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${result.data.token}`,
          },
          body: JSON.stringify({}),
        });
        assert.equal(writeResponse.status, 403);
      }
    }
  });

  it('allows Admin to manage users without exposing password hashes', async () => {
    const adminToken = createAccessToken({ id: 1, role: 'Admin' });
    const staffAccount = await prisma.user.findUnique({
      where: { email: 'staff@pharmasense.local' },
    });
    assert.ok(staffAccount);
    const staffToken = createAccessToken({ id: staffAccount.id, role: 'Staff' });
    const usersResponse = await fetch(`${baseUrl}/api/v1/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(usersResponse.status, 200);
    const usersResult = (await usersResponse.json()) as {
      data: Array<{ id: number; name: string; email: string; role: { name: string }; passwordHash?: string }>;
    };
    assert.ok(usersResult.data.length >= 4);
    assert.ok(usersResult.data.every((user) => user.passwordHash === undefined));

    const rolesResponse = await fetch(`${baseUrl}/api/v1/users/roles`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(rolesResponse.status, 200);
    const rolesResult = (await rolesResponse.json()) as {
      data: Array<{ id: number; name: string }>;
    };
    const pharmacistRole = rolesResult.data.find((role) => role.name === 'Pharmacist');
    const staffRole = rolesResult.data.find((role) => role.name === 'Staff');
    assert.ok(pharmacistRole);
    assert.ok(staffRole);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const email = `managed-user-${suffix}@pharmasense.local`;
    let createdUserId: number | undefined;

    try {
      const createResponse = await fetch(`${baseUrl}/api/v1/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: 'Managed Test User',
          email,
          password: 'managed-user-password',
          roleId: staffRole.id,
        }),
      });
      assert.equal(createResponse.status, 201);
      const created = (await createResponse.json()) as {
        data: { id: number; email: string; role: { name: string }; passwordHash?: string };
      };
      createdUserId = created.data.id;
      assert.equal(created.data.email, email);
      assert.equal(created.data.role.name, 'Staff');
      assert.equal(created.data.passwordHash, undefined);

      const duplicateResponse = await fetch(`${baseUrl}/api/v1/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: 'Duplicate User',
          email,
          password: 'managed-user-password',
          roleId: staffRole.id,
        }),
      });
      assert.equal(duplicateResponse.status, 409);

      const updateResponse = await fetch(`${baseUrl}/api/v1/users/${createdUserId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ roleId: pharmacistRole.id }),
      });
      assert.equal(updateResponse.status, 200);
      const updated = (await updateResponse.json()) as {
        data: { role: { name: string }; passwordHash?: string };
      };
      assert.equal(updated.data.role.name, 'Pharmacist');
      assert.equal(updated.data.passwordHash, undefined);

      const staleStaffToken = createAccessToken({ id: createdUserId, role: 'Staff' });
      const updatedRoleResponse = await fetch(`${baseUrl}/api/v1/medicines`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${staleStaffToken}`,
        },
        body: JSON.stringify({}),
      });
      assert.equal(updatedRoleResponse.status, 400);

      const userToken = createAccessToken({ id: createdUserId, role: 'Pharmacist' });
      const deactivateResponse = await fetch(`${baseUrl}/api/v1/users/${createdUserId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ active: false }),
      });
      assert.equal(deactivateResponse.status, 200);
      const deactivatedAccessResponse = await fetch(`${baseUrl}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      assert.equal(deactivatedAccessResponse.status, 401);

      const inactiveLoginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'managed-user-password' }),
      });
      assert.equal(inactiveLoginResponse.status, 401);

      const reactivateResponse = await fetch(`${baseUrl}/api/v1/users/${createdUserId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ active: true }),
      });
      assert.equal(reactivateResponse.status, 200);
      const oldTokenAfterReactivation = await fetch(`${baseUrl}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      assert.equal(oldTokenAfterReactivation.status, 401);

      const resetPasswordResponse = await fetch(`${baseUrl}/api/v1/users/${createdUserId}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ password: 'new-managed-password' }),
      });
      assert.equal(resetPasswordResponse.status, 200);
      const updatedPasswordLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'new-managed-password' }),
      });
      assert.equal(updatedPasswordLogin.status, 200);

      const selfDemotionResponse = await fetch(`${baseUrl}/api/v1/users/1`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ roleId: staffRole.id }),
      });
      assert.equal(selfDemotionResponse.status, 409);
      const selfDeactivationResponse = await fetch(`${baseUrl}/api/v1/users/1`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ active: false }),
      });
      assert.equal(selfDeactivationResponse.status, 409);

      const forbiddenResponse = await fetch(`${baseUrl}/api/v1/users`, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      assert.equal(forbiddenResponse.status, 403);
    } finally {
      if (createdUserId) {
        await prisma.auditLog.deleteMany({
          where: { entity: 'User', entityId: createdUserId },
        });
        await prisma.user.delete({ where: { id: createdUserId } });
      }
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

  it('allows multiple medicines without a barcode', async () => {
    const category = await prisma.category.findFirst();
    assert.ok(category);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const createdMedicineIds: number[] = [];
    const token = createAccessToken({ id: 1, role: 'Admin' });

    try {
      for (const index of [1, 2]) {
        const medicineResponse: Awaited<ReturnType<typeof fetch>> = await fetch(
          `${baseUrl}/api/v1/medicines`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              genericName: `Barcode optional ${suffix} ${index}`,
              brandName: `Barcode optional brand ${suffix} ${index}`,
              categoryId: category.id,
              unit: 'Tablet',
              reorderLevel: 0,
              barcode: '',
            }),
          },
        );
        assert.equal(medicineResponse.status, 201);
        const result = (await medicineResponse.json()) as { data: { id: number } };
        createdMedicineIds.push(result.data.id);
      }
    } finally {
      if (createdMedicineIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: { entity: 'Medicine', entityId: { in: createdMedicineIds } },
        });
        await prisma.medicine.deleteMany({
          where: { id: { in: createdMedicineIds } },
        });
      }
    }
  });

  it('validates supplier search filters', async () => {
    const token = createAccessToken({ id: 1, role: 'Admin' });
    const response = await fetch(`${baseUrl}/api/v1/suppliers?search=${'x'.repeat(151)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 400);
  });

  it('returns paginated medicine metadata', async () => {
    const token = createAccessToken({ id: 1, role: 'Admin' });
    const response = await fetch(`${baseUrl}/api/v1/medicines?page=1&pageSize=2`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200);
    const result = (await response.json()) as {
      success: boolean;
      data: unknown[];
      meta: { page: number; pageSize: number; total: number; totalPages: number };
    };
    assert.equal(result.success, true);
    assert.equal(result.meta.page, 1);
    assert.equal(result.meta.pageSize, 2);
    assert.ok(Array.isArray(result.data));
    assert.ok(result.data.length <= 2);
    assert.ok(result.meta.total >= 0);
    assert.ok(result.meta.totalPages >= 0);
  });

  it('returns structured validation errors', async () => {
    const token = createAccessToken({ id: 1, role: 'Admin' });
    const response = await fetch(`${baseUrl}/api/v1/medicines?active=maybe`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 400);
    const result = (await response.json()) as {
      success: boolean;
      error: { code: string; message: string; details: unknown[] };
    };
    assert.equal(result.success, false);
    assert.equal(result.error.code, 'VALIDATION_ERROR');
    assert.equal(result.error.message, 'Request validation failed');
    assert.ok(result.error.details.length > 0);
  });

  it('returns paginated category metadata', async () => {
    const token = createAccessToken({ id: 1, role: 'Admin' });
    const response = await fetch(`${baseUrl}/api/v1/categories?page=1&pageSize=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200);
    const result = (await response.json()) as {
      success: boolean;
      data: unknown[];
      meta: { page: number; pageSize: number; total: number; totalPages: number };
    };
    assert.equal(result.success, true);
    assert.equal(result.meta.page, 1);
    assert.equal(result.meta.pageSize, 5);
    assert.ok(Array.isArray(result.data));
    assert.ok(result.meta.total >= 0);
    assert.ok(result.meta.totalPages >= 0);
  });

  it('defaults stock transaction history to newest first', async () => {
    const token = createAccessToken({ id: 1, role: 'Admin' });
    const response = await fetch(
      `${baseUrl}/api/v1/inventory/transactions?page=1&pageSize=1`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(response.status, 200);
    const result = (await response.json()) as {
      meta: { sortBy: string; sortOrder: string };
    };
    assert.equal(result.meta.sortBy, 'timestamp');
    assert.equal(result.meta.sortOrder, 'desc');
  });

  it('denies Staff medicine writes', async () => {
    const staffAccount = await prisma.user.findUnique({
      where: { email: 'staff@pharmasense.local' },
    });
    assert.ok(staffAccount);
    const response = await fetch(`${baseUrl}/api/v1/medicines`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${createAccessToken({ id: staffAccount.id, role: 'Staff' })}`,
      },
      body: JSON.stringify({ genericName: 'Test', brandName: 'Test', categoryId: 1, unit: 'Tablet', reorderLevel: 1 }),
    });
    assert.equal(response.status, 403);
  });

  it('restricts audit visibility to management roles', async () => {
    const staffAccount = await prisma.user.findUnique({
      where: { email: 'staff@pharmasense.local' },
    });
    assert.ok(staffAccount);
    const adminResponse = await fetch(`${baseUrl}/api/v1/audit-logs`, {
      headers: { Authorization: `Bearer ${createAccessToken({ id: 1, role: 'Admin' })}` },
    });
    assert.equal(adminResponse.status, 200);

    const staffResponse = await fetch(`${baseUrl}/api/v1/audit-logs`, {
      headers: { Authorization: `Bearer ${createAccessToken({ id: staffAccount.id, role: 'Staff' })}` },
    });
    assert.equal(staffResponse.status, 403);
  });
});