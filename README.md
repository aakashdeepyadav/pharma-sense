# PharmaSense

Agent-Based Medicine Stock Management System.

## Prerequisites
- Node.js (v18+)
- Docker (for database)

## Quick Start

### 1. Database
```bash
docker-compose up -d
```

### 2. Backend
```bash
cd backend
npm install
npx prisma db push
npm run seed
npm run dev
```

The development seed creates this local administrator account:

```text
Email: admin@pharmasense.local
Password: admin12345
```

Change these credentials before using any shared or deployed environment.

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

Open the frontend at the Vite URL and sign in with the seeded administrator account. Inventory routes require a valid JWT issued by the backend.
