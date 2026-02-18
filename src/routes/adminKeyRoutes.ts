import { Router } from "express";
import { z } from "zod";
import { ApiKeyStore } from "../services/apiKeyStore";

interface AdminKeyRouteDependencies {
  keyStore: ApiKeyStore;
}

const createKeySchema = z.object({
  label: z.string().trim().min(1),
  apiKey: z.string().trim().min(1).optional()
});

const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/)
});

export const createAdminKeyRoutes = (dependencies: AdminKeyRouteDependencies): Router => {
  const router = Router();
  const { keyStore } = dependencies;

  router.get("/keys", async (_request, response, next) => {
    try {
      const keys = await keyStore.listKeys();
      response.json({ keys });
    } catch (error) {
      next(error);
    }
  });

  router.post("/keys", async (request, response, next) => {
    const parsed = createKeySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid create key payload", details: parsed.error.flatten() });
      return;
    }

    try {
      const created = await keyStore.createKey(parsed.data.label, parsed.data.apiKey);
      response.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/keys/:id", async (request, response, next) => {
    const parsed = idParamSchema.safeParse(request.params);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid key id", details: parsed.error.flatten() });
      return;
    }

    try {
      const deleted = await keyStore.revokeKey(Number(parsed.data.id));
      if (!deleted) {
        response.status(404).json({ error: "Key not found or already revoked." });
        return;
      }

      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
};
