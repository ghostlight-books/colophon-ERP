import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  CLIENT_APP_URL: z.string().url().default("http://localhost:5173"),
  SQUARE_ACCESS_TOKEN: z.string().optional(),
  SQUARE_LOCATION_ID: z.string().optional(),
  SQUARE_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
  CREDENTIAL_ENCRYPTION_KEY: z.string().min(16).optional(),
  TENANT_BASE_DOMAIN: z.string().default("localhost"),
  ADMIN_MASTER_KEY: z.string().min(16).optional(),
  SHOPIFY_API_KEY: z.string().optional(),
  SHOPIFY_API_SECRET: z.string().optional(),
  SHOPIFY_APP_URL: z.string().url().default("https://colophon-api.onrender.com"),
  RENDER_GIT_COMMIT: z.string().optional(),
  SCRAPING_API_PROVIDER: z.enum(["zenrows", "scrapingbee", "scraperapi", "crawlbase", "custom"]).optional(),
  SCRAPING_API_KEY: z.string().optional(),
  SCRAPER_PROXY_URL: z.string().optional(),
  SCRAPER_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(12000),
});

export const env = envSchema.parse(process.env);
