import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import medicineRoutes from './routes/medicines';
import categoryRoutes from './routes/categories';
import batchRoutes from './routes/batches';
import authRoutes from './routes/auth';
import supplierRoutes from './routes/suppliers';
import inventoryRoutes from './routes/inventory';
import alertRoutes from './routes/alerts';
import reportRoutes from './routes/reports';
import auditRoutes from './routes/audit';
import purchaseRoutes from './routes/purchases';
import userRoutes from './routes/users';
import prisma from './lib/prisma';
import { requireAuth } from './auth';

dotenv.config();

export const app = express();
const port = process.env.PORT || 5000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 40;
const requestCounts = new Map<string, { count: number; windowStart: number }>();

app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use((req, res, next) => {
  const forwarded = req.headers['x-forwarded-for'];
  const clientKey = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : req.socket.remoteAddress ?? 'unknown';
  const rateLimitKey = `${clientKey}:${req.path}`;

  const now = Date.now();
  const currentWindow = requestCounts.get(rateLimitKey) ?? { count: 0, windowStart: now };

  if (now - currentWindow.windowStart > RATE_LIMIT_WINDOW_MS) {
    requestCounts.set(rateLimitKey, { count: 1, windowStart: now });
    next();
    return;
  }

  currentWindow.count += 1;
  requestCounts.set(rateLimitKey, currentWindow);

  if (currentWindow.count > RATE_LIMIT_MAX_REQUESTS) {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please retry later.',
      },
    });
    return;
  }

  next();
});
app.use(express.json({ limit: '100kb' }));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', requireAuth, userRoutes);
app.use('/api/v1/medicines', requireAuth, medicineRoutes);
app.use('/api/v1/categories', requireAuth, categoryRoutes);
app.use('/api/v1/batches', requireAuth, batchRoutes);
app.use('/api/v1/purchases', requireAuth, purchaseRoutes);
app.use('/api/v1/suppliers', requireAuth, supplierRoutes);
app.use('/api/v1/inventory', requireAuth, inventoryRoutes);
app.use('/api/v1/alerts', requireAuth, alertRoutes);
app.use('/api/v1/reports', requireAuth, reportRoutes);
app.use('/api/v1/audit-logs', requireAuth, auditRoutes);

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

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
});
