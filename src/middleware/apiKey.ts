import { createHash } from "node:crypto";
import { NextFunction, Request, Response } from "express";
import { Socket } from "socket.io";
import { settings } from "../config";
import { ApiKeyAuthContext } from "../services/apiKeyStore";

type RequestWithAuth = Request & { apiAuthContext?: ApiKeyAuthContext };
type SocketWithAuth = Socket & { data: Socket["data"] & { apiAuthContext?: ApiKeyAuthContext } };

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

const normalizeString = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const readHeader = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    return value.length > 0 ? normalizeString(value[0]) : "";
  }

  return normalizeString(value);
};

const getKeyFingerprint = (apiKey: string): string => {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 12);
};

export const getApiKeyFromRequest = (request: Request): string => {
  const headerKey = request.header("x-api-key");
  const bearerToken = getBearerToken(request.header("authorization"));
  return normalizeString(headerKey ?? bearerToken ?? "");
};

export const getApiKeyFromSocket = (socket: Socket): string => {
  const authApiKey = normalizeString(socket.handshake.auth?.apiKey);
  if (authApiKey) {
    return authApiKey;
  }

  const headerApiKey = readHeader(socket.handshake.headers["x-api-key"]);
  if (headerApiKey) {
    return headerApiKey;
  }

  const authHeader = readHeader(socket.handshake.headers.authorization);
  const bearerToken = getBearerToken(authHeader);
  return normalizeString(bearerToken ?? "");
};

export const getApiAuthFromRequest = (request: Request): ApiKeyAuthContext | null => {
  return (request as RequestWithAuth).apiAuthContext ?? null;
};

export const getApiAuthFromSocket = (socket: Socket): ApiKeyAuthContext | null => {
  return (socket as SocketWithAuth).data.apiAuthContext ?? null;
};

const setApiAuthOnRequest = (request: Request, context: ApiKeyAuthContext): void => {
  (request as RequestWithAuth).apiAuthContext = context;
};

const setApiAuthOnSocket = (socket: Socket, context: ApiKeyAuthContext): void => {
  (socket as SocketWithAuth).data.apiAuthContext = context;
};

export type ApiKeyAuthenticator = (apiKey: string) => Promise<ApiKeyAuthContext | null>;

export const createEnvApiKeyAuthenticator = (): ApiKeyAuthenticator => {
  return async (apiKey: string): Promise<ApiKeyAuthContext | null> => {
    const normalized = normalizeString(apiKey);
    if (!normalized) {
      return null;
    }

    if (settings.allowAnyApiKey) {
      return {
        apiKey: normalized,
        tenantLabel: settings.apiKeyLabels[normalized] ?? null,
        keyFingerprint: getKeyFingerprint(normalized),
        source: "any"
      };
    }

    if (settings.apiKeys.includes(normalized)) {
      return {
        apiKey: normalized,
        tenantLabel: settings.apiKeyLabels[normalized] ?? null,
        keyFingerprint: getKeyFingerprint(normalized),
        source: "env"
      };
    }

    return null;
  };
};

export const createRequireApiKey = (authenticateApiKey: ApiKeyAuthenticator) => {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const providedKey = getApiKeyFromRequest(request);
      const authContext = await authenticateApiKey(providedKey);
      if (!authContext) {
        response.status(401).json({ error: "Unauthorized" });
        return;
      }

      setApiAuthOnRequest(request, authContext);
      next();
    } catch (error) {
      next(error);
    }
  };
};

export const createSocketApiKeyGuard = (authenticateApiKey: ApiKeyAuthenticator) => {
  return (socket: Socket, next: (error?: Error) => void): void => {
    void (async () => {
      try {
        const apiKey = getApiKeyFromSocket(socket);
        const authContext = await authenticateApiKey(apiKey);
        if (!authContext) {
          next(new Error("Unauthorized"));
          return;
        }

        setApiAuthOnSocket(socket, authContext);
        next();
      } catch {
        next(new Error("Unauthorized"));
      }
    })();
  };
};
