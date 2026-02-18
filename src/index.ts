import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { createServer } from "node:http";
import { Server, Socket } from "socket.io";
import { settings } from "./config";
import { createPostgresPersistence, PersistenceStore } from "./db/postgresPersistence";
import { requireAdminKey } from "./middleware/adminKey";
import {
  ApiKeyAuthenticator,
  createEnvApiKeyAuthenticator,
  createRequireApiKey,
  createSocketApiKeyGuard,
  getApiAuthFromSocket,
  getApiKeyFromSocket
} from "./middleware/apiKey";
import { errorHandler } from "./middleware/errorHandler";
import { createAdminKeyRoutes } from "./routes/adminKeyRoutes";
import { createIngestRoutes } from "./routes/ingestRoutes";
import { createRouteRoutes } from "./routes/routeRoutes";
import { createStateRoutes } from "./routes/stateRoutes";
import { createApiKeyStore, ApiKeyStore } from "./services/apiKeyStore";
import { RuntimeRegistry, TenantRuntime } from "./state/runtimeRegistry";
import { StateChangeSet } from "./types/state";

const closeServer = async (server: ReturnType<typeof createServer>): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
};

const getSocketApiKey = (socket: Socket): string => {
  const authContext = getApiAuthFromSocket(socket);
  if (authContext?.apiKey) {
    return authContext.apiKey;
  }

  const fromData = typeof socket.data.apiKey === "string" ? socket.data.apiKey.trim() : "";
  if (fromData) {
    return fromData;
  }

  return getApiKeyFromSocket(socket);
};

const bootstrap = async (): Promise<void> => {
  const app = express();
  const httpServer = createServer(app);

  const socketOrigin = settings.corsOrigin === "*"
    ? "*"
    : settings.corsOrigin.split(",").map((origin) => origin.trim()).filter(Boolean);

  const io = new Server(httpServer, {
    cors: {
      origin: socketOrigin
    }
  });

  let persistence: PersistenceStore | null = null;
  if (settings.databaseUrl) {
    persistence = createPostgresPersistence(settings.databaseUrl, settings.databaseSsl);
  } else {
    console.warn("DATABASE_URL not configured; running in-memory mode only.");
  }

  const envAuthenticator = createEnvApiKeyAuthenticator();
  let keyStore: ApiKeyStore | null = null;
  let authenticateApiKey: ApiKeyAuthenticator = envAuthenticator;

  if (settings.databaseUrl) {
    keyStore = createApiKeyStore(settings.databaseUrl, settings.databaseSsl, settings.apiKeyPepper);

    if (settings.bootstrapApiKeys) {
      const seededCount = await keyStore.seedKeys(
        settings.seedApiKeys.map((apiKey) => ({
          apiKey,
          label: settings.apiKeyLabels[apiKey] ?? null
        }))
      );

      if (seededCount > 0) {
        console.log(`Bootstrapped ${seededCount} API key(s) into database.`);
      }
    }

    authenticateApiKey = async (apiKey: string) => {
      if (settings.allowAnyApiKey) {
        return envAuthenticator(apiKey);
      }

      return keyStore ? keyStore.authenticate(apiKey) : null;
    };
  } else {
    console.warn("Using environment API key authentication (no database key store).");
  }

  const runtimeRegistry = new RuntimeRegistry({
    persistence,
    commanderName: settings.commanderName,
    tenantMode: settings.tenantMode,
    resolveTenantLabel: (apiKey) => settings.apiKeyLabels[apiKey] ?? null
  });

  const ingestLimiter = rateLimit({
    windowMs: settings.ingestRateLimitWindowMs,
    max: settings.ingestRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false
  });

  const emitChanges = (runtime: TenantRuntime, changes: StateChangeSet): void => {
    if (!changes.shipUpdated && !changes.locationUpdated && !changes.routeUpdated) {
      return;
    }

    const snapshot = runtime.store.getSnapshot();
    const room = runtime.tenantId;

    if (changes.shipUpdated) {
      io.to(room).emit("ShipUpdated", snapshot.ship);
    }

    if (changes.locationUpdated) {
      io.to(room).emit("LocationUpdated", snapshot.location);
    }

    if (changes.routeUpdated) {
      io.to(room).emit("RouteUpdated", snapshot.route);
    }

    io.to(room).emit("StateUpdated", snapshot);
  };

  const requireApiKey = createRequireApiKey(authenticateApiKey);

  app.use(helmet());
  app.use(cors({ origin: settings.corsOrigin === "*" ? true : socketOrigin }));
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  if (keyStore && settings.adminApiKey) {
    app.use("/api/admin", requireAdminKey, createAdminKeyRoutes({ keyStore }));
  }

  app.use("/api/ingest", ingestLimiter, requireApiKey, createIngestRoutes({
    resolveRuntime: (apiKey, tenantLabel, keyFingerprint) =>
      runtimeRegistry.getRuntime(apiKey, tenantLabel, keyFingerprint),
    onStateChanged: emitChanges,
    persistence
  }));

  app.use("/api/route", ingestLimiter, requireApiKey, createRouteRoutes({
    resolveRuntime: (apiKey, tenantLabel, keyFingerprint) =>
      runtimeRegistry.getRuntime(apiKey, tenantLabel, keyFingerprint),
    onStateChanged: emitChanges,
    persistence
  }));

  app.use("/api", requireApiKey, createStateRoutes({
    resolveRuntime: (apiKey, tenantLabel, keyFingerprint) =>
      runtimeRegistry.getRuntime(apiKey, tenantLabel, keyFingerprint)
  }));

  io.use(createSocketApiKeyGuard(authenticateApiKey));

  io.on("connection", (socket) => {
    void (async () => {
      try {
        const authContext = getApiAuthFromSocket(socket);
        const apiKey = getSocketApiKey(socket);
        const runtime = await runtimeRegistry.getRuntime(
          apiKey,
          authContext?.tenantLabel ?? null,
          authContext?.keyFingerprint ?? null
        );
        socket.join(runtime.tenantId);

        const snapshot = runtime.store.getSnapshot();
        socket.emit("ShipUpdated", snapshot.ship);
        socket.emit("LocationUpdated", snapshot.location);
        socket.emit("RouteUpdated", snapshot.route);
        socket.emit("StateUpdated", snapshot);
      } catch {
        socket.disconnect(true);
      }
    })();
  });

  app.use(errorHandler);

  const shutdown = async (): Promise<void> => {
    await closeServer(httpServer);

    const closers: Promise<void>[] = [];
    if (persistence) {
      closers.push(persistence.close());
    }

    if (keyStore) {
      closers.push(keyStore.close());
    }

    await Promise.all(closers);
  };

  process.once("SIGINT", () => {
    shutdown().finally(() => process.exit(0));
  });

  process.once("SIGTERM", () => {
    shutdown().finally(() => process.exit(0));
  });

  httpServer.listen(settings.port, () => {
    console.log(`Express server running on port ${settings.port}`);
    console.log("Realtime channel ready (Socket.IO)");
    if (settings.tenantMode === "api_key") {
      console.log("Tenant mode: per API key");
    }

    if (settings.databaseUrl) {
      console.log("API key authentication source: PostgreSQL");
    } else {
      console.log("API key authentication source: environment");
    }
  });
};

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown startup error";
  console.error(`Startup failed: ${message}`);
  process.exit(1);
});
