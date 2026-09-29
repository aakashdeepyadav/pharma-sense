import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import medicineRoutes from './routes/medicines';
import categoryRoutes from './routes/categories';
import batchRoutes from './routes/batches';
import authRoutes from './routes/auth';
import prisma from './lib/prisma';
import { requireAuth } from './auth';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/medicines', requireAuth, medicineRoutes);
app.use('/api/v1/categories', requireAuth, categoryRoutes);
app.use('/api/v1/batches', requireAuth, batchRoutes);

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'ok' });
  } catch {
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

app.get('/', (req, res) => {
  res.send('PharmaSense API is running');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
});
