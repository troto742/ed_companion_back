import { Router } from "express";
import { getApiAuthFromRequest, getApiKeyFromRequest } from "../middleware/apiKey";
import { TenantRuntime } from "../state/runtimeRegistry";

interface StateRouteDependencies {
  resolveRuntime: (apiKey: string, tenantLabel?: string | null, keyFingerprint?: string | null) => Promise<TenantRuntime>;
}

export const createStateRoutes = (dependencies: StateRouteDependencies): Router => {
  const router = Router();
  const { resolveRuntime } = dependencies;

  router.get("/state", async (request, response, next) => {
    try {
      const authContext = getApiAuthFromRequest(request);
      const apiKey = authContext?.apiKey ?? getApiKeyFromRequest(request);
      const runtime = await resolveRuntime(apiKey, authContext?.tenantLabel, authContext?.keyFingerprint);
      response.json(runtime.store.getSnapshot());
    } catch (error) {
      next(error);
    }
  });

  router.get("/whoami", async (request, response, next) => {
    try {
      const authContext = getApiAuthFromRequest(request);
      const apiKey = authContext?.apiKey ?? getApiKeyFromRequest(request);
      const runtime = await resolveRuntime(apiKey, authContext?.tenantLabel, authContext?.keyFingerprint);
      response.json({
        tenantId: runtime.tenantId,
        tenantLabel: runtime.tenantLabel,
        keyFingerprint: runtime.keyFingerprint,
        commanderName: runtime.commanderName,
        authSource: authContext?.source ?? null
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
