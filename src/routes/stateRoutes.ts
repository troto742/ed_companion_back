import { Router } from "express";
import { z } from "zod";
import { getApiAuthFromRequest, getApiKeyFromRequest } from "../middleware/apiKey";
import { searchCommodityMarkets } from "../services/commodityMarketSearch";
import { TenantRuntime } from "../state/runtimeRegistry";

interface StateRouteDependencies {
  resolveRuntime: (apiKey: string, tenantLabel?: string | null, keyFingerprint?: string | null) => Promise<TenantRuntime>;
}

export const createStateRoutes = (dependencies: StateRouteDependencies): Router => {
  const router = Router();
  const { resolveRuntime } = dependencies;
  const commoditySearchQuerySchema = z.object({
    sourceSystem: z.string().trim().min(1),
    commodity: z.string().trim().min(1),
    limit: z.coerce.number().int().min(1).max(25).default(10),
    minSupply: z.coerce.number().int().min(1).max(100_000).default(1),
    maxDistance: z.coerce.number().int().min(5).max(500).default(120),
    maxDaysAgo: z.coerce.number().int().min(1).max(90).default(14)
  });

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

  router.get("/commodities/search", async (request, response, next) => {
    const parsed = commoditySearchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid commodities search query", details: parsed.error.flatten() });
      return;
    }

    try {
      // Preserve auth/tenant checks on this route.
      const authContext = getApiAuthFromRequest(request);
      const apiKey = authContext?.apiKey ?? getApiKeyFromRequest(request);
      await resolveRuntime(apiKey, authContext?.tenantLabel, authContext?.keyFingerprint);

      const result = await searchCommodityMarkets(
        parsed.data.sourceSystem,
        parsed.data.commodity,
        parsed.data.limit,
        parsed.data.minSupply,
        parsed.data.maxDistance,
        parsed.data.maxDaysAgo
      );
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
};
