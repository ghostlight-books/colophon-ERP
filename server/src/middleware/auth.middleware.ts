import type { NextFunction, Request, Response } from "express";

import { resolveSession } from "../services/auth.service.js";

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  const session = await resolveSession(token);
  if (!session) {
    res.status(401).json({ error: "Session is invalid or expired." });
    return;
  }
  req.authContext = session;
  next();
}
