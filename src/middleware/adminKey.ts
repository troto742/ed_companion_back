import { NextFunction, Request, Response } from "express";
import { settings } from "../config";

const getBearerToken = (authorizationHeader: string | undefined): string | null => {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token.trim();
};

const getAdminKeyFromRequest = (request: Request): string => {
  const headerKey = request.header("x-admin-key");
  const bearerToken = getBearerToken(request.header("authorization"));
  return (headerKey ?? bearerToken ?? "").trim();
};

export const requireAdminKey = (request: Request, response: Response, next: NextFunction): void => {
  if (!settings.adminApiKey) {
    response.status(503).json({ error: "Admin API key is not configured." });
    return;
  }

  const providedKey = getAdminKeyFromRequest(request);
  if (providedKey !== settings.adminApiKey) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
};
