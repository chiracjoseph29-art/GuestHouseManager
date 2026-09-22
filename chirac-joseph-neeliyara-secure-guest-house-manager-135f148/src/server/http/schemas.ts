import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
});

export const createBookingSchema = z.object({
  guest: z.object({
    fullName: z.string().min(1).max(200),
    email: z.string().email().max(320).optional(),
    phone: z.string().max(30).optional(),
  }),
  checkIn: z.string().datetime(),
  checkOut: z.string().datetime(),
  guestCount: z.number().int().min(1).max(50),
  source: z.enum(["DIRECT", "ONLINE", "PHONE", "WALK_IN", "OTHER"]),
  isWholeHouse: z.boolean(),
  roomIds: z.array(z.string().uuid()).default([]),
  amountTotal: z.number().min(0),
  amountPaid: z.number().min(0).optional(),
  notes: z.string().max(5000).optional(),
});

export const inventoryChangeSchema = z.object({
  type: z.enum(["ADDITION", "CONSUMPTION", "ADJUSTMENT", "DAMAGED", "LOST"]),
  quantityChange: z.number().int(),
  reason: z.string().min(1).max(500),
});

export const assignCleanerSchema = z.object({
  cleanerId: z.string().uuid(),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(12).max(200),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  password: z.string().min(12).max(200),
  role: z.enum(["ADMIN", "MANAGER", "CLEANER"]),
  canViewFinancials: z.boolean().optional(),
});
