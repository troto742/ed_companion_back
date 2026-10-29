import { Request, Router } from "express";
import { z } from "zod";
import { getApiAuthFromRequest, getApiKeyFromRequest } from "../middleware/apiKey";
import { FriendStore } from "../services/friendStore";
import { RuntimeRegistry, TenantRuntime } from "../state/runtimeRegistry";

interface FriendRouteDependencies {
  resolveRuntime: (apiKey: string, tenantLabel?: string | null, keyFingerprint?: string | null) => Promise<TenantRuntime>;
  runtimeRegistry: RuntimeRegistry;
  friendStore: FriendStore;
}

const targetTenantSchema = z.object({
  targetTenantId: z.string().trim().min(1)
});

const fromTenantSchema = z.object({
  fromTenantId: z.string().trim().min(1)
});

export const createFriendRoutes = (dependencies: FriendRouteDependencies): Router => {
  const router = Router();
  const { resolveRuntime, runtimeRegistry, friendStore } = dependencies;

  const getCurrentRuntime = async (request: Request): Promise<TenantRuntime> => {
    const authContext = getApiAuthFromRequest(request);
    const apiKey = authContext?.apiKey ?? getApiKeyFromRequest(request);
    return resolveRuntime(apiKey, authContext?.tenantLabel, authContext?.keyFingerprint);
  };

  router.get("/", async (request, response, next) => {
    try {
      const currentRuntime = await getCurrentRuntime(request);
      const runtimes = await runtimeRegistry.listRuntimes();
      response.json(friendStore.buildDashboard(currentRuntime.tenantId, runtimes));
    } catch (error) {
      next(error);
    }
  });

  router.post("/requests", async (request, response, next) => {
    const parsed = targetTenantSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid friend request", details: parsed.error.flatten() });
      return;
    }

    try {
      const currentRuntime = await getCurrentRuntime(request);
      const targetRuntime = (await runtimeRegistry.listRuntimes())
        .find((runtime) => runtime.tenantId === parsed.data.targetTenantId);

      if (!targetRuntime) {
        response.status(404).json({ error: "Target user is not active in this backend session." });
        return;
      }

      const requestRecord = friendStore.createRequest(currentRuntime.tenantId, targetRuntime.tenantId);
      response.status(201).json(requestRecord);
    } catch (error) {
      next(error);
    }
  });

  router.post("/requests/accept", async (request, response, next) => {
    const parsed = fromTenantSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid friend request accept body", details: parsed.error.flatten() });
      return;
    }

    try {
      const currentRuntime = await getCurrentRuntime(request);
      const accepted = friendStore.acceptRequest(currentRuntime.tenantId, parsed.data.fromTenantId);
      if (!accepted) {
        response.status(404).json({ error: "Pending request not found." });
        return;
      }

      response.json(accepted);
    } catch (error) {
      next(error);
    }
  });

  return router;
};
