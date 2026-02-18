import { Router } from "express";
import multer from "multer";
import { basename, extname } from "node:path";
import { PersistenceStore } from "../db/postgresPersistence";
import { getApiAuthFromRequest, getApiKeyFromRequest } from "../middleware/apiKey";
import { parseRouteFile } from "../services/routeParser";
import { TenantRuntime } from "../state/runtimeRegistry";
import { RouteLeg, StateChangeSet } from "../types/state";

interface RouteRouteDependencies {
  resolveRuntime: (apiKey: string, tenantLabel?: string | null, keyFingerprint?: string | null) => Promise<TenantRuntime>;
  onStateChanged: (runtime: TenantRuntime, changes: StateChangeSet) => void;
  persistence?: PersistenceStore | null;
}

const upload = multer({ storage: multer.memoryStorage() });

const supportedExtensions = new Set([".csv", ".xlsx"]);

export const createRouteRoutes = (dependencies: RouteRouteDependencies): Router => {
  const router = Router();
  const { onStateChanged, persistence, resolveRuntime } = dependencies;

  router.post("/upload", upload.single("file"), async (request, response, next) => {
    const file = request.file;
    if (!file) {
      response.status(400).json({ error: "File is required. Use form-data with key 'file'." });
      return;
    }

    const extension = extname(file.originalname).toLowerCase();
    if (!supportedExtensions.has(extension)) {
      response.status(400).json({ error: "Unsupported file format. Allowed: .csv, .xlsx" });
      return;
    }

    let legs: RouteLeg[];
    try {
      legs = await parseRouteFile(file.buffer, file.originalname);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to parse route file.";
      response.status(400).json({ error: message });
      return;
    }

    const fallbackName = basename(file.originalname, extension);
    const routeNameInput = request.body.routeName;
    const routeName = typeof routeNameInput === "string" && routeNameInput.trim()
      ? routeNameInput.trim()
      : fallbackName;

    try {
      const authContext = getApiAuthFromRequest(request);
      const apiKey = authContext?.apiKey ?? getApiKeyFromRequest(request);
      const runtime = await resolveRuntime(apiKey, authContext?.tenantLabel, authContext?.keyFingerprint);
      const checkpoint = runtime.store.createCheckpoint();

      try {
        const changes = runtime.store.loadRoute(routeName, legs, new Date().toISOString());
        if (persistence) {
          await persistence.persistRoute(runtime.commanderName, routeName, legs, runtime.store.getSnapshot());
        }

        onStateChanged(runtime, changes);
        response.status(201).json({ routeLoaded: true, routeName, legs: legs.length });
      } catch (error) {
        runtime.store.restoreCheckpoint(checkpoint);
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  return router;
};
