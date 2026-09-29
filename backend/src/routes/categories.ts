import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Get all categories
router.get('/', async (req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany();
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch categories' });
  }
});

// Add a category
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    const category = await prisma.category.create({
      data: { name, description }
    });
    res.json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to add category' });
  }
});

export default router;
