import { Router } from "express";
import { getApiAuthFromRequest, getApiKeyFromRequest } from "../middleware/apiKey";
import { z } from "zod";
import { PersistenceStore } from "../db/postgresPersistence";
import { TenantRuntime } from "../state/runtimeRegistry";
import { JournalPayload } from "../types/ingest";
import { StateChangeSet } from "../types/state";

interface IngestRouteDependencies {
  resolveRuntime: (apiKey: string, tenantLabel?: string | null, keyFingerprint?: string | null) => Promise<TenantRuntime>;
  onStateChanged: (runtime: TenantRuntime, changes: StateChangeSet) => void;
  persistence?: PersistenceStore | null;
}

const journalSchema = z.object({
  timestamp: z.string().min(1),
  eventType: z.string().min(1),
  data: z.record(z.unknown()).default({})
});

const statusSchema = z.object({
  timestamp: z.string().min(1),
  flags: z.number().int().nonnegative().optional(),
  fsdCharging: z.boolean().optional(),
  fuel: z
    .object({
      main: z.number().nonnegative().optional(),
      reserve: z.number().nonnegative().optional()
    })
    .optional(),
  cargo: z.number().int().nonnegative().optional(),
  hull: z.number().nonnegative().optional(),
  shields: z.number().nonnegative().optional(),
  starSystem: z.string().min(1).optional(),
  bodyName: z.string().optional(),
  stationName: z.string().optional()
});

const batchSchema = z.union([z.array(journalSchema), z.object({ events: z.array(journalSchema) })]);

export const createIngestRoutes = (dependencies: IngestRouteDependencies): Router => {
  const router = Router();
  const { onStateChanged, persistence, resolveRuntime } = dependencies;

  router.post("/journal", async (request, response, next) => {
    const parsed = journalSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid journal payload", details: parsed.error.flatten() });
      return;
    }

    try {
      const authContext = getApiAuthFromRequest(request);
      const apiKey = authContext?.apiKey ?? getApiKeyFromRequest(request);
      const runtime = await resolveRuntime(apiKey, authContext?.tenantLabel, authContext?.keyFingerprint);
      const checkpoint = runtime.store.createCheckpoint();

      try {
        const changes = runtime.store.applyJournal(parsed.data);
        if (!changes.ignored) {
          if (persistence) {
            await persistence.persistJournal(runtime.commanderName, parsed.data, runtime.store.getSnapshot());
          }
          onStateChanged(runtime, changes);
        }

        response.status(202).json({ accepted: !changes.ignored, reason: changes.reason ?? null });
      } catch (error) {
        runtime.store.restoreCheckpoint(checkpoint);
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.post("/status", async (request, response, next) => {
    const parsed = statusSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid status payload", details: parsed.error.flatten() });
      return;
    }

    try {
      const authContext = getApiAuthFromRequest(request);
      const apiKey = authContext?.apiKey ?? getApiKeyFromRequest(request);
      const runtime = await resolveRuntime(apiKey, authContext?.tenantLabel, authContext?.keyFingerprint);
      const checkpoint = runtime.store.createCheckpoint();

      try {
        const changes = runtime.store.applyStatus(parsed.data);
        if (!changes.ignored) {
          if (persistence) {
            await persistence.persistStatus(runtime.commanderName, parsed.data, runtime.store.getSnapshot());
          }
          onStateChanged(runtime, changes);
        }

        response.status(202).json({ accepted: !changes.ignored, reason: changes.reason ?? null });
      } catch (error) {
        runtime.store.restoreCheckpoint(checkpoint);
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.post("/journal/batch", async (request, response, next) => {
    const parsed = batchSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid batch payload", details: parsed.error.flatten() });
      return;
    }

    try {
      const authContext = getApiAuthFromRequest(request);
      const apiKey = authContext?.apiKey ?? getApiKeyFromRequest(request);
      const runtime = await resolveRuntime(apiKey, authContext?.tenantLabel, authContext?.keyFingerprint);
      const checkpoint = runtime.store.createCheckpoint();

      try {
        const events = Array.isArray(parsed.data) ? parsed.data : parsed.data.events;
        const acceptedEvents: JournalPayload[] = [];
        let processed = 0;
        let ignored = 0;
        const aggregate: StateChangeSet = {
          shipUpdated: false,
          locationUpdated: false,
          routeUpdated: false,
          ignored: false
        };

        for (const event of events) {
          const changes = runtime.store.applyJournal(event);
          if (changes.ignored) {
            ignored += 1;
            continue;
          }

          acceptedEvents.push(event);
          processed += 1;
          aggregate.shipUpdated = aggregate.shipUpdated || changes.shipUpdated;
          aggregate.locationUpdated = aggregate.locationUpdated || changes.locationUpdated;
          aggregate.routeUpdated = aggregate.routeUpdated || changes.routeUpdated;
        }

        if (processed > 0) {
          if (persistence) {
            await persistence.persistJournalBatch(runtime.commanderName, acceptedEvents, runtime.store.getSnapshot());
          }
          onStateChanged(runtime, aggregate);
        }

        response.status(202).json({ accepted: processed > 0, processed, ignored });
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
