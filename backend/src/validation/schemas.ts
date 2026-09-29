import { z } from 'zod';

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
});

export const medicineSchema = z.object({
  genericName: z.string().trim().min(1).max(150),
  brandName: z.string().trim().min(1).max(150),
  categoryId: z.coerce.number().int().positive(),
  reorderLevel: z.coerce.number().int().nonnegative(),
  unit: z.string().trim().min(1).max(50),
});

export const medicineUpdateSchema = medicineSchema.partial();

export const batchSchema = z.object({
  medicineId: z.coerce.number().int().positive(),
  supplierId: z.coerce.number().int().positive(),
  batchNumber: z.string().trim().min(1).max(100),
  mfgDate: z.coerce.date(),
  expiryDate: z.coerce.date(),
  quantity: z.coerce.number().int().nonnegative(),
  purchasePrice: z.coerce.number().nonnegative(),
}).refine((value) => value.expiryDate > value.mfgDate, {
  message: 'Expiry date must be after manufacturing date',
  path: ['expiryDate'],
});