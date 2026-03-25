import { Router } from "express";
import multer from "multer";
import { basename, extname } from "node:path";
import { z } from "zod";
import { PersistenceStore } from "../db/postgresPersistence";
import { getApiAuthFromRequest, getApiKeyFromRequest } from "../middleware/apiKey";
import { parseRouteFile } from "../services/routeParser";
import { generateSpanshExactRoute, generateSpanshExobiologyRoute, generateSpanshRoute } from "../services/spanshRouteService";
import { TenantRuntime } from "../state/runtimeRegistry";
import { RouteLeg, StateChangeSet } from "../types/state";

interface RouteRouteDependencies {
  resolveRuntime: (apiKey: string, tenantLabel?: string | null, keyFingerprint?: string | null) => Promise<TenantRuntime>;
  onStateChanged: (runtime: TenantRuntime, changes: StateChangeSet) => void;
  persistence?: PersistenceStore | null;
}

const upload = multer({ storage: multer.memoryStorage() });

const supportedExtensions = new Set([".csv", ".xlsx"]);
const spanshRouteSchema = z.object({
  sourceSystem: z.string().trim().min(1, "Source system is required."),
  destinationSystem: z.string().trim().min(1, "Destination system is required."),
  jumpRange: z.coerce.number().positive("Jump range must be greater than zero."),
  efficiency: z.coerce.number().min(1, "Efficiency must be between 1 and 100.").max(100, "Efficiency must be between 1 and 100.").default(25),
  via: z.array(z.string().trim().min(1)).max(20).optional().default([])
});

const spanshExactRouteSchema = z.object({
  sourceSystem: z.string().trim().min(1, "Source system is required."),
  destinationSystem: z.string().trim().min(1, "Destination system is required."),
  shipBuild: z.string().trim().min(1, "Ship build is required."),
  cargo: z.coerce.number().min(0).default(0),
  fuelReserveSize: z.coerce.number().min(0).default(0),
  useSupercharge: z.coerce.boolean().default(true),
  useInjections: z.coerce.boolean().default(false),
  excludeSecondary: z.coerce.boolean().default(false),
  refuelEveryScoopable: z.coerce.boolean().default(true),
  isSupercharged: z.coerce.boolean().default(false),
  algorithm: z.enum(["optimistic", "guided", "fuel", "fuel_jumps", "pessimistic"]).default("optimistic")
});

const spanshExobiologyRouteSchema = z.object({
  reference: z.object({
    id64: z.union([z.number(), z.string()]).optional(),
    name: z.string().trim().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    z: z.number().optional()
  }).optional(),
  search: z.object({
    filters: z.object({
      atmosphere: z.object({
        value: z.array(z.string().trim().min(1)).min(1)
      }),
      distance: z.object({
        min: z.union([z.string(), z.number()]),
        max: z.union([z.string(), z.number()])
      }),
      gravity: z.object({
        comparison: z.string().trim().default("<=>"),
        value: z.tuple([z.union([z.string(), z.number()]), z.union([z.string(), z.number()])])
      }),
      subtype: z.object({
        value: z.array(z.string().trim().min(1)).min(1)
      }),
      updated_at: z.object({
        comparison: z.string().trim().default("<=>"),
        value: z.tuple([z.string().trim().min(1), z.string().trim().min(1)])
      })
    }),
    page: z.coerce.number().int().min(0).default(0),
    reference_system: z.string().trim().min(1, "Reference system is required."),
    reference_system_details: z.object({
      id64: z.union([z.number(), z.string()]).optional(),
      name: z.string().trim().min(1),
      x: z.number(),
      y: z.number(),
      z: z.number()
    }).optional(),
    size: z.coerce.number().int().min(1).max(30).default(30),
    sort: z.array(z.record(z.unknown())).min(1).default([{ distance: { direction: "asc" } }])
  }),
  searchReference: z.string().trim().optional()
}).superRefine((value, ctx) => {
  const distanceMin = Number(value.search.filters.distance.min);
  const distanceMax = Number(value.search.filters.distance.max);
  const gravityMin = Number(value.search.filters.gravity.value[0]);
  const gravityMax = Number(value.search.filters.gravity.value[1]);

  if (Number.isFinite(distanceMin) && Number.isFinite(distanceMax) && distanceMin > distanceMax) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Distance min cannot be greater than distance max.",
      path: ["search", "filters", "distance"]
    });
  }

  if (Number.isFinite(gravityMin) && Number.isFinite(gravityMax) && gravityMin > gravityMax) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Gravity min cannot be greater than gravity max.",
      path: ["search", "filters", "gravity"]
    });
  }
});

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

  router.post("/spansh", async (request, response, next) => {
    const parsedRequest = spanshRouteSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      response.status(400).json({ error: parsedRequest.error.issues[0]?.message ?? "Invalid Spansh route request." });
      return;
    }

    try {
      const authContext = getApiAuthFromRequest(request);
      const apiKey = authContext?.apiKey ?? getApiKeyFromRequest(request);
      const runtime = await resolveRuntime(apiKey, authContext?.tenantLabel, authContext?.keyFingerprint);
      const checkpoint = runtime.store.createCheckpoint();

      try {
        const generatedRoute = await generateSpanshRoute(parsedRequest.data);
        const changes = runtime.store.loadRoute(generatedRoute.routeName, generatedRoute.legs, new Date().toISOString());

        if (persistence) {
          await persistence.persistRoute(
            runtime.commanderName,
            generatedRoute.routeName,
            generatedRoute.legs,
            runtime.store.getSnapshot()
          );
        }

        onStateChanged(runtime, changes);
        response.status(201).json({
          routeLoaded: true,
          routeName: generatedRoute.routeName,
          legs: generatedRoute.legs.length,
          previewRows: generatedRoute.previewRows
        });
      } catch (error) {
        runtime.store.restoreCheckpoint(checkpoint);
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.post("/spansh/exact", async (request, response, next) => {
    const parsedRequest = spanshExactRouteSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      response.status(400).json({ error: parsedRequest.error.issues[0]?.message ?? "Invalid Spansh exact route request." });
      return;
    }

    try {
      const authContext = getApiAuthFromRequest(request);
      const apiKey = authContext?.apiKey ?? getApiKeyFromRequest(request);
      const runtime = await resolveRuntime(apiKey, authContext?.tenantLabel, authContext?.keyFingerprint);
      const checkpoint = runtime.store.createCheckpoint();

      try {
        const generatedRoute = await generateSpanshExactRoute(parsedRequest.data);
        const changes = runtime.store.loadRoute(generatedRoute.routeName, generatedRoute.legs, new Date().toISOString());

        if (persistence) {
          await persistence.persistRoute(
            runtime.commanderName,
            generatedRoute.routeName,
            generatedRoute.legs,
            runtime.store.getSnapshot()
          );
        }

        onStateChanged(runtime, changes);
        response.status(201).json({
          routeLoaded: true,
          routeName: generatedRoute.routeName,
          legs: generatedRoute.legs.length,
          previewRows: generatedRoute.previewRows
        });
      } catch (error) {
        runtime.store.restoreCheckpoint(checkpoint);
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.post("/spansh/exobiology", async (request, response, next) => {
    const parsedRequest = spanshExobiologyRouteSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      response.status(400).json({ error: parsedRequest.error.issues[0]?.message ?? "Invalid Spansh exobiology request." });
      return;
    }

    try {
      const authContext = getApiAuthFromRequest(request);
      const apiKey = authContext?.apiKey ?? getApiKeyFromRequest(request);
      const runtime = await resolveRuntime(apiKey, authContext?.tenantLabel, authContext?.keyFingerprint);
      const checkpoint = runtime.store.createCheckpoint();

      try {
        const generatedRoute = await generateSpanshExobiologyRoute(parsedRequest.data);
        const changes = runtime.store.loadRoute(generatedRoute.routeName, generatedRoute.legs, new Date().toISOString());

        if (persistence) {
          await persistence.persistRoute(
            runtime.commanderName,
            generatedRoute.routeName,
            generatedRoute.legs,
            runtime.store.getSnapshot()
          );
        }

        onStateChanged(runtime, changes);
        response.status(201).json({
          routeLoaded: true,
          routeName: generatedRoute.routeName,
          legs: generatedRoute.legs.length,
          previewRows: generatedRoute.previewRows,
          exobiologySystems: generatedRoute.exobiologySystems ?? []
        });
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
