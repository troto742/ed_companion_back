import { Router } from "express";
import { z } from "zod";
import { getApiAuthFromRequest, getApiKeyFromRequest } from "../middleware/apiKey";
import { TenantRuntime } from "../state/runtimeRegistry";
import { getTradeRecommendations } from "../useCases/getTradeRecommendations";

interface TradeRouteDependencies {
  resolveRuntime: (apiKey: string, tenantLabel?: string | null, keyFingerprint?: string | null) => Promise<TenantRuntime>;
}

const tradeQuerySchema = z.object({
  topN: z.coerce.number().int().min(1).max(100).default(25),
  minProfit: z.coerce.number().int().min(1).max(10_000_000).default(1),
  maxDistance: z.coerce.number().int().min(1).max(500).optional(),
  commodityId: z.string().trim().min(1),
  minSupply: z.coerce.number().int().min(1).max(100_000).default(1),
  minDemand: z.coerce.number().int().min(1).max(100_000).default(1),
  maxDaysAgo: z.coerce.number().int().min(1).max(90).default(14),
  useFleetCarrier: z.coerce.boolean().default(false),
  onlyStations: z.coerce.boolean().default(false),
  includeFleetCarriers: z.coerce.boolean().default(false)
});

export const createTradeRoutes = (dependencies: TradeRouteDependencies): Router => {
  const router = Router();
  const { resolveRuntime } = dependencies;

  router.get("/recommendations", async (request, response, next) => {
    const parsed = tradeQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid trade recommendations query", details: parsed.error.flatten() });
      return;
    }

    try {
      const authContext = getApiAuthFromRequest(request);
      const apiKey = authContext?.apiKey ?? getApiKeyFromRequest(request);
      const runtime = await resolveRuntime(apiKey, authContext?.tenantLabel, authContext?.keyFingerprint);
      void runtime;

      const result = await getTradeRecommendations({
        topN: parsed.data.topN,
        minProfit: parsed.data.minProfit,
        maxDistance: parsed.data.maxDistance ?? null,
        commodityId: parsed.data.commodityId,
        minSupply: parsed.data.minSupply,
        minDemand: parsed.data.minDemand,
        maxDaysAgo: parsed.data.maxDaysAgo,
        useFleetCarrier: parsed.data.useFleetCarrier,
        onlyStations: parsed.data.onlyStations,
        includeFleetCarriers: parsed.data.includeFleetCarriers
      });

      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
};
