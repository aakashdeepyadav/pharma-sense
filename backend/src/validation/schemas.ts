import { z } from 'zod';

const moneySchema = z.coerce.number()
  .finite()
  .min(0)
  .max(9_999_999_999.99)
  .refine((value) => {
    const cents = value * 100;
    return Math.abs(cents - Math.round(cents)) < Number.EPSILON * Math.max(1, Math.abs(cents)) * 2;
  }, 'Amount must have no more than two decimal places');

const nonnegativeQuantitySchema = z.coerce.number().int().min(0).max(2_147_483_647);

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
});

export const categoryUpdateSchema = categorySchema.partial();

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.string().trim().min(1).max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const medicineSchema = z.object({
  genericName: z.string().trim().min(1).max(150),
  brandName: z.string().trim().min(1).max(150),
  categoryId: z.coerce.number().int().positive(),
  manufacturer: z.string().trim().max(150).optional(),
  dosageForm: z.string().trim().max(100).optional(),
  barcode: z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim().length === 0
        ? undefined
        : value,
    z.string().trim().max(100).optional(),
  ),
  active: z.coerce.boolean().default(true),
  reorderLevel: z.coerce.number().int().nonnegative(),
  unit: z.string().trim().min(1).max(50),
});

export const medicineUpdateSchema = medicineSchema.partial();

export const medicineQuerySchema = z.object({
  search: z.string().trim().max(150).optional(),
  barcode: z.string().trim().max(100).optional(),
  active: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.enum(['genericName', 'brandName', 'manufacturer', 'reorderLevel']).default('genericName'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(1).max(150),
  contactInfo: z.string().trim().max(300).optional(),
});

export const supplierUpdateSchema = supplierSchema.partial();

export const userCreateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(100),
  roleId: z.coerce.number().int().positive(),
});

export const userUpdateSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()).optional(),
  roleId: z.coerce.number().int().positive().optional(),
  active: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0);

export const userPasswordResetSchema = z.object({
  password: z.string().min(12).max(100),
});

export const auditQuerySchema = z.object({
  search: z.string().trim().max(150).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(8).max(100),
  newPassword: z.string().min(12).max(100),
});

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()).optional(),
}).refine((value) => Object.keys(value).length > 0);

export const supplierQuerySchema = z.object({
  search: z.string().trim().max(150).optional(),
  contactInfo: z.string().trim().max(300).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.enum(['name', 'contactInfo', 'id']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const batchSchema = z.object({
  medicineId: z.coerce.number().int().positive(),
  supplierId: z.coerce.number().int().positive(),
  batchNumber: z.string().trim().min(1).max(100),
  mfgDate: z.coerce.date(),
  expiryDate: z.coerce.date(),
  quantity: nonnegativeQuantitySchema,
  purchasePrice: moneySchema,
  sellingPrice: moneySchema,
}).refine((value) => value.expiryDate > value.mfgDate, {
  message: 'Expiry date must be after manufacturing date',
  path: ['expiryDate'],
});

export const stockTransactionSchema = z.object({
  batchId: z.coerce.number().int().positive(),
  type: z.enum(['OUT', 'ADJ']),
  quantity: z.coerce.number().int().min(-2_147_483_648).max(2_147_483_647),
  notes: z.string().trim().max(500).optional(),
}).superRefine((value, context) => {
  if (value.type === 'OUT' && value.quantity <= 0) {
    context.addIssue({ code: 'custom', message: 'Stock out quantity must be positive', path: ['quantity'] });
  }
  if (value.type === 'ADJ' && value.quantity === 0) {
    context.addIssue({ code: 'custom', message: 'Adjustment quantity cannot be zero', path: ['quantity'] });
  }
});

export const demandHistoryQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).refine((value) => !value.from || !value.to || value.from <= value.to, {
  message: 'from must be before or equal to to',
  path: ['from'],
});

export const forecastQuerySchema = z.object({
  medicineId: z.coerce.number().int().positive(),
  horizon: z.coerce.number().int().min(1).max(30).default(7),
  window: z.coerce.number().int().min(1).max(30).default(7),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).refine((value) => !value.from || !value.to || value.from <= value.to, {
  message: 'from must be before or equal to to',
  path: ['from'],
});

const purchaseItemSchema = z.object({
  medicineId: z.coerce.number().int().positive(),
  batchNumber: z.string().trim().min(1).max(100),
  mfgDate: z.coerce.date(),
  expiryDate: z.coerce.date(),
  quantity: z.coerce.number().int().positive().max(2_147_483_647),
  purchasePrice: moneySchema,
  sellingPrice: moneySchema,
}).refine((value) => value.expiryDate > value.mfgDate, {
  message: 'Expiry date must be after manufacturing date',
  path: ['expiryDate'],
});

export const purchaseSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(purchaseItemSchema).min(1).max(100),
});

export const replenishmentQuerySchema = z.object({
  window: z.coerce.number().int().min(7).max(90).default(30),
  targetDays: z.coerce.number().int().min(1).max(60).default(14),
});