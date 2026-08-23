import type { NextFunction, Request, Response } from "express";
import { hasModuleAccess, type SystemModule } from "@colophon/shared";

export function checkPermission(module: SystemModule) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const context = req.authContext;
    if (!context) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    if (!hasModuleAccess(context.role, module)) {
      res.status(403).json({ error: `Your role does not have access to ${module}.` });
      return;
    }
    next();
  };
}