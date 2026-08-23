import type { NextFunction, Request, Response } from "express";

import { env } from "../config/env";

declare global {
  namespace Express {
    interface Request {
      authContext?: {
        userId: string;
        storeId: string;
        role: string;
      };
      tenantContext?: {
        subdomain: string | null;
        isAdminPortal: boolean;
        storeSlug: string | null;
      };
    }
  }
}

function getSubdomain(host: string): string | null {
  const hostname = host.split(":")[0].toLowerCase();
  const baseDomain = env.TENANT_BASE_DOMAIN.toLowerCase();
  if (baseDomain === "localhost" || hostname === baseDomain || hostname.endsWith(`.${baseDomain}`) === false) {
    return null;
  }
  const prefix = hostname.slice(0, -(baseDomain.length + 1));
  return prefix && !prefix.includes(".") ? prefix : null;
}

export function tenantContext(req: Request, _res: Response, next: NextFunction): void {
  const configuredDevSubdomain = env.NODE_ENV !== "production" && typeof req.headers["x-dev-subdomain"] === "string"
    ? req.headers["x-dev-subdomain"]
    : null;
  const subdomain = configuredDevSubdomain ?? getSubdomain(req.headers.host ?? "");
  req.tenantContext = {
    subdomain,
    isAdminPortal: subdomain === "admin",
    storeSlug: subdomain && subdomain !== "admin" ? subdomain : null,
  };
  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.tenantContext?.isAdminPortal) {
    res.status(403).json({ error: "Admin portal requires the admin subdomain." });
    return;
  }
  const configuredKey = env.ADMIN_MASTER_KEY;
  const providedKey = req.headers["x-admin-master-key"];
  if (env.NODE_ENV !== "production" && req.headers["x-dev-subdomain"] === "admin") {
    next();
    return;
  }
  if (!configuredKey || typeof providedKey !== "string" || providedKey !== configuredKey) {
    res.status(401).json({ error: "Unauthorized admin request." });
    return;
  }
  next();
}