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
npm run dev
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```
