# PharmaSense Frontend

The frontend is a React, TypeScript, and Vite dashboard for pharmacy inventory operations. It uses the backend API for authentication, inventory, purchasing, alerts, reports, and Admin-only user/role management; the browser does not connect directly to PostgreSQL.

## Local development

Start PostgreSQL and the backend first. See the repository [README](../README.md) for database setup, migrations, and local role-test accounts.

```powershell
npm install
npm run dev
```

By default, the frontend calls `http://localhost:5000`. To use a different API origin, create `.env` with:

```dotenv
VITE_API_URL=http://localhost:5000
```

Admins manage accounts under **Management and history → User access**. They can create accounts and update names, emails, and roles. Password reset/change and account deactivation are not available yet.

## Checks

```powershell
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

The mocked browser suite covers login feedback, responsive sign-in, keyboard access, and action visibility for Admin, Pharmacist, Inventory Manager, and Staff.

The live browser workflow uses a disposable PostgreSQL database and writes records. Create and migrate a separate database (for example, `pharmasense_e2e`), seed it, then set `E2E_DATABASE_URL` to that database before running:

```powershell
$env:E2E_DATABASE_URL="postgresql://postgres:password123@localhost:5433/pharmasense_e2e?schema=public"
npm run test:e2e:live
```

Never point `E2E_DATABASE_URL` at a shared or production database. CI provisions an isolated PostgreSQL database for this test.
