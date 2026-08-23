import { z } from "zod";

export const createBookSchema = z.object({
  isbn13: z.string().regex(/^\d{13}$/),
  title: z.string().min(1).max(255),
  author: z.string().min(1).max(255),
  publisher: z.string().max(255).optional(),
  publishedYear: z.number().int().min(1400).max(3000).optional(),
  listPriceCents: z.number().int().nonnegative(),
  genre: z.string().max(100).optional()
});

export type CreateBookInput = z.infer<typeof createBookSchema>;
