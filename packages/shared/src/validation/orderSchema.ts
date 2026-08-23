import { z } from "zod";

export const posLineItemSchema = z.object({
  inventoryItemId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative()
});

export const createPosTransactionSchema = z.object({
  cashierUserId: z.string().uuid(),
  paymentMethod: z.enum(["CASH", "CARD", "STORE_CREDIT", "MOBILE"]),
  taxCents: z.number().int().nonnegative().default(0),
  lineItems: z.array(posLineItemSchema).min(1)
});

export type CreatePosTransactionInput = z.infer<typeof createPosTransactionSchema>;
