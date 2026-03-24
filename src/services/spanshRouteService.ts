import { RouteLeg } from "../types/state";
import { parseSpanshShipBuild } from "./spanshShipBuildParser";

const SPANSH_BASE_URL = "https://spansh.co.uk";
const DEFAULT_ROUTE_TIMEOUT_MS = 45_000;
const DEFAULT_EXACT_ROUTE_TIMEOUT_MS = 5 * 60_000;
const INITIAL_POLL_INTERVAL_MS = 1_000;
const MAX_POLL_INTERVAL_MS = 5_000;
const MAX_BODY_SEARCH_PAGE_SIZE = 500;

export interface SpanshRouteRequest {
  sourceSystem: string;
  destinationSystem: string;
  jumpRange: number;
  efficiency: number;
  via: string[];
}

export interface SpanshRoutePreviewRow {
  systemName: string;
  distance: number | null;
  distanceRemaining: number | null;
  estimatedJumps: number | null;
  refuel: boolean;
  neutronStar: boolean;
}

export interface SpanshExobiologyBodyCandidate {
  bodyName: string;
  distanceToArrivalLs: number | null;
  subtype: string | null;
  atmosphere: string | null;
}

export interface SpanshExobiologySystemCandidate {
  systemName: string;
  distanceLy: number | null;
  nearestBodyLs: number | null;
  bodies: SpanshExobiologyBodyCandidate[];
}

interface SpanshJobResponse {
  job: string;
  status: string;
}

interface SpanshResultSystemJump {
  system: string;
  distance_jumped: number;
  distance_left: number;
  jumps: number;
  neutron_star: boolean;
}

interface SpanshResultPayload {
  status: string;
  result?: {
    source_system: string;
    destination_system: string;
    system_jumps: SpanshResultSystemJump[];
  };
  error?: string;
}

interface SpanshExactJump {
  name: string;
  distance: number;
  distance_to_destination: number;
  fuel_in_tank: number;
  fuel_used: number;
  must_refuel: boolean;
  has_neutron: boolean;
}

interface SpanshExactResultPayload {
  status: string;
  result?: {
    jumps?: SpanshExactJump[];
    reason?: string;
  };
  error?: string;
}

export interface SpanshRouteResult {
  routeName: string;
  legs: RouteLeg[];
  previewRows: SpanshRoutePreviewRow[];
  exobiologySystems?: SpanshExobiologySystemCandidate[];
}

export interface SpanshExactRouteRequest {
  sourceSystem: string;
  destinationSystem: string;
  shipBuild: string;
  cargo: number;
  fuelReserveSize: number;
  useSupercharge: boolean;
  useInjections: boolean;
  excludeSecondary: boolean;
  refuelEveryScoopable: boolean;
  isSupercharged: boolean;
  algorithm: "optimistic" | "guided" | "fuel" | "fuel_jumps" | "pessimistic";
}

export interface SpanshExobiologyRouteRequest {
  search: Record<string, unknown>;
  reference?: {
    id64?: number | string;
    name?: string;
    x?: number;
    y?: number;
    z?: number;
  };
  searchReference?: string;
}

interface SpanshBodySearchReference {
  name?: string;
}

interface SpanshBodySearchResult {
  name?: string;
  system_name?: string;
  distance?: number;
  distance_to_arrival?: number;
  subtype?: string;
  atmosphere?: string;
}

interface SpanshBodySearchPagePayload {
  count?: number;
  from?: number;
  size?: number;
  search_reference?: string;
  reference?: SpanshBodySearchReference;
  results?: SpanshBodySearchResult[];
}

const delay = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toFiniteNumberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const fetchBodySearchPage = async (
  search: Record<string, unknown>,
  page: number,
  size: number
): Promise<Required<Pick<SpanshBodySearchPagePayload, "count" | "from" | "size" | "results">>> => {
  const body = {
    ...search,
    page: Math.max(0, Math.trunc(page)),
    size: Math.min(MAX_BODY_SEARCH_PAGE_SIZE, Math.max(1, Math.trunc(size)))
  };

  const response = await fetch(`${SPANSH_BASE_URL}/api/bodies/search`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Spansh exobiology bulk search failed with HTTP ${response.status}.`);
  }

  const payload = await response.json() as SpanshBodySearchPagePayload;
  const results = Array.isArray(payload.results) ? payload.results : [];

  return {
    count: toFiniteNumberOrNull(payload.count) ?? results.length,
    from: toFiniteNumberOrNull(payload.from) ?? 0,
    size: toFiniteNumberOrNull(payload.size) ?? results.length,
    results
  };
};

const mapSystemJumpToLeg = (jump: SpanshResultSystemJump): RouteLeg => ({
  systemName: jump.system,
  distance: Number.isFinite(jump.distance_jumped) ? jump.distance_jumped : null,
  distanceRemaining: Number.isFinite(jump.distance_left) ? jump.distance_left : null,
  fuelLeft: null,
  fuelUsed: null,
  refuel: false,
  neutronStar: jump.neutron_star === true
});

const mapSystemJumpToPreviewRow = (jump: SpanshResultSystemJump): SpanshRoutePreviewRow => ({
  systemName: jump.system,
  distance: Number.isFinite(jump.distance_jumped) ? jump.distance_jumped : null,
  distanceRemaining: Number.isFinite(jump.distance_left) ? jump.distance_left : null,
  estimatedJumps: Number.isFinite(jump.jumps) ? jump.jumps : null,
  refuel: false,
  neutronStar: jump.neutron_star === true
});

const pollSpanshJob = async <TResult extends { status: string; error?: string }>(
  jobId: string,
  timeoutMs: number,
  buildPendingError: () => string
): Promise<TResult> => {
  const startedAt = Date.now();
  let pollIntervalMs = INITIAL_POLL_INTERVAL_MS;

  while (Date.now() - startedAt < timeoutMs) {
    const resultResponse = await fetch(`${SPANSH_BASE_URL}/api/results/${jobId}`);
    if (!resultResponse.ok) {
      throw new Error(`Spansh result request failed with HTTP ${resultResponse.status}.`);
    }

    const resultPayload = await resultResponse.json() as TResult;
    if (resultPayload.status === "ok") {
      return resultPayload;
    }

    if (resultPayload.status === "error") {
      throw new Error(resultPayload.error || "Spansh job failed.");
    }

    await delay(pollIntervalMs);
    pollIntervalMs = Math.min(pollIntervalMs + 500, MAX_POLL_INTERVAL_MS);
  }

  throw new Error(buildPendingError());
};

export const generateSpanshRoute = async (
  request: SpanshRouteRequest,
  timeoutMs: number = DEFAULT_ROUTE_TIMEOUT_MS
): Promise<SpanshRouteResult> => {
  const body = new URLSearchParams();
  body.set("from", request.sourceSystem);
  body.set("to", request.destinationSystem);
  body.set("range", String(request.jumpRange));
  body.set("efficiency", String(request.efficiency));

  for (const viaSystem of request.via) {
    body.append("via", viaSystem);
  }

  const submitResponse = await fetch(`${SPANSH_BASE_URL}/api/route`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8"
    },
    body: body.toString()
  });

  if (!submitResponse.ok) {
    throw new Error(`Spansh route request failed with HTTP ${submitResponse.status}.`);
  }

  const submittedJob = await submitResponse.json() as SpanshJobResponse;
  if (!submittedJob.job) {
    throw new Error("Spansh did not return a valid route job id.");
  }

  const resultPayload = await pollSpanshJob<SpanshResultPayload>(
    submittedJob.job,
    timeoutMs,
    () => "Spansh route generation timed out."
  );

  if (!resultPayload.result) {
    throw new Error("Spansh returned no route payload.");
  }

  const { result } = resultPayload;
  const legs = result.system_jumps.map(mapSystemJumpToLeg);
  if (legs.length === 0) {
    throw new Error("Spansh returned an empty route.");
  }

  return {
    routeName: `${result.source_system} -> ${result.destination_system}`,
    legs,
    previewRows: result.system_jumps.map(mapSystemJumpToPreviewRow)
  };
};

export const generateSpanshExactRoute = async (
  request: SpanshExactRouteRequest,
  timeoutMs: number = DEFAULT_EXACT_ROUTE_TIMEOUT_MS
): Promise<SpanshRouteResult> => {
  const ship = parseSpanshShipBuild(request.shipBuild);
  const body = new URLSearchParams();
  body.set("source", request.sourceSystem);
  body.set("destination", request.destinationSystem);
  body.set("ship_build", request.shipBuild);
  body.set("cargo", String(request.cargo));
  body.set("reserve_size", String(request.fuelReserveSize));
  body.set("is_supercharged", request.isSupercharged ? "1" : "0");
  body.set("use_supercharge", request.useSupercharge ? "1" : "0");
  body.set("use_injections", request.useInjections ? "1" : "0");
  body.set("exclude_secondary", request.excludeSecondary ? "1" : "0");
  body.set("refuel_every_scoopable", request.refuelEveryScoopable ? "1" : "0");
  body.set("algorithm", request.algorithm);
  body.set("fuel_power", String(ship.fuelPower));
  body.set("fuel_multiplier", String(ship.fuelMultiplier));
  body.set("optimal_mass", String(ship.optimalMass));
  body.set("base_mass", String(ship.baseMass));
  body.set("tank_size", String(ship.tankSize));
  body.set("internal_tank_size", String(ship.reservoirSize));
  body.set("max_fuel_per_jump", String(ship.maxFuelPerJump));
  body.set("range_boost", String(ship.rangeBoost));
  body.set("supercharge_multiplier", String(ship.superchargeMultiplier));
  body.set("injection_multiplier", String(ship.injectionMultiplier));

  const submitResponse = await fetch(`${SPANSH_BASE_URL}/api/generic/route`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8"
    },
    body: body.toString()
  });

  if (!submitResponse.ok) {
    const failedBody = await submitResponse.text();
    throw new Error(`Spansh exact route request failed: ${failedBody}`);
  }

  const submittedJob = await submitResponse.json() as SpanshJobResponse;
  if (!submittedJob.job) {
    throw new Error("Spansh did not return a valid exact route job id.");
  }

  const resultPayload = await pollSpanshJob<SpanshExactResultPayload>(
    submittedJob.job,
    timeoutMs,
    () => "Spansh exact route generation timed out after 5 minutes. Long-range exact routes can take substantially longer on Spansh."
  );

  const jumps = Array.isArray(resultPayload.result?.jumps) ? resultPayload.result.jumps : [];
  if (jumps.length === 0) {
    throw new Error(resultPayload.result?.reason || "Spansh exact route returned no jumps.");
  }

  const legs: RouteLeg[] = jumps.map((jump) => ({
    systemName: jump.name,
    distance: Number.isFinite(jump.distance) ? jump.distance : null,
    distanceRemaining: Number.isFinite(jump.distance_to_destination) ? jump.distance_to_destination : null,
    fuelLeft: Number.isFinite(jump.fuel_in_tank) ? jump.fuel_in_tank : null,
    fuelUsed: Number.isFinite(jump.fuel_used) ? jump.fuel_used : null,
    refuel: jump.must_refuel === true,
    neutronStar: jump.has_neutron === true
  }));

  const previewRows: SpanshRoutePreviewRow[] = jumps.map((jump, index) => ({
    systemName: jump.name,
    distance: Number.isFinite(jump.distance) ? jump.distance : null,
    distanceRemaining: Number.isFinite(jump.distance_to_destination) ? jump.distance_to_destination : null,
    estimatedJumps: jumps.length - index - 1,
    refuel: jump.must_refuel === true,
    neutronStar: jump.has_neutron === true
  }));

  return {
    routeName: `${request.sourceSystem} -> ${request.destinationSystem} (Exact)`,
    legs,
    previewRows
  };
};

export const generateSpanshExobiologyRoute = async (
  request: SpanshExobiologyRouteRequest
): Promise<SpanshRouteResult> => {
  if (!isRecord(request.search)) {
    throw new Error("Spansh exobiology search payload is required.");
  }

  // Keep the user filters, but force larger page size for efficient bulk import.
  const pageSize = MAX_BODY_SEARCH_PAGE_SIZE;

  const firstPage = await fetchBodySearchPage(request.search, 0, pageSize);
  const totalRows = Math.max(0, firstPage.count);
  if (totalRows === 0 && firstPage.results.length === 0) {
    throw new Error("Spansh exobiology search returned no results.");
  }

  interface MutableSystemCandidate {
    systemName: string;
    distanceLy: number | null;
    nearestBodyLs: number | null;
    bodiesByName: Map<string, SpanshExobiologyBodyCandidate>;
  }

  const systemsByName = new Map<string, MutableSystemCandidate>();
  const tryAppendPage = (rows: SpanshBodySearchResult[]): void => {
    for (const row of rows) {
      const systemName = typeof row.system_name === "string" ? row.system_name.trim() : "";
      if (!systemName) {
        continue;
      }

      const normalizedSystem = systemName.toLowerCase();
      const distanceLy = toFiniteNumberOrNull(row.distance);
      const distanceToArrivalLs = toFiniteNumberOrNull(row.distance_to_arrival);
      const bodyName = typeof row.name === "string" ? row.name.trim() : "";
      const bodySubtype = typeof row.subtype === "string" ? row.subtype.trim() : "";
      const bodyAtmosphere = typeof row.atmosphere === "string" ? row.atmosphere.trim() : "";

      const existingSystem = systemsByName.get(normalizedSystem);
      const systemCandidate: MutableSystemCandidate = existingSystem ?? {
        systemName,
        distanceLy,
        nearestBodyLs: distanceToArrivalLs,
        bodiesByName: new Map<string, SpanshExobiologyBodyCandidate>()
      };

      if (distanceLy !== null && (systemCandidate.distanceLy === null || distanceLy < systemCandidate.distanceLy)) {
        systemCandidate.distanceLy = distanceLy;
      }

      if (distanceToArrivalLs !== null && (systemCandidate.nearestBodyLs === null || distanceToArrivalLs < systemCandidate.nearestBodyLs)) {
        systemCandidate.nearestBodyLs = distanceToArrivalLs;
      }

      if (bodyName) {
        const normalizedBodyName = bodyName.toLowerCase();
        const existingBody = systemCandidate.bodiesByName.get(normalizedBodyName);
        if (!existingBody) {
          systemCandidate.bodiesByName.set(normalizedBodyName, {
            bodyName,
            distanceToArrivalLs,
            subtype: bodySubtype || null,
            atmosphere: bodyAtmosphere || null
          });
        } else {
          if (distanceToArrivalLs !== null && (existingBody.distanceToArrivalLs === null || distanceToArrivalLs < existingBody.distanceToArrivalLs)) {
            existingBody.distanceToArrivalLs = distanceToArrivalLs;
          }
          if (!existingBody.subtype && bodySubtype) {
            existingBody.subtype = bodySubtype;
          }
          if (!existingBody.atmosphere && bodyAtmosphere) {
            existingBody.atmosphere = bodyAtmosphere;
          }
        }
      }

      systemsByName.set(normalizedSystem, systemCandidate);
    }
  };

  const totalPages = Math.max(1, Math.ceil(Math.max(totalRows, firstPage.results.length) / pageSize));
  for (let page = 0; page < totalPages; page += 1) {
    const pagePayload = page === 0
      ? firstPage
      : await fetchBodySearchPage(request.search, page, pageSize);
    tryAppendPage(pagePayload.results);
  }

  const exobiologySystems: SpanshExobiologySystemCandidate[] = Array.from(systemsByName.values()).map((system) => {
    const bodies = Array.from(system.bodiesByName.values()).sort((left, right) => {
      const leftLs = left.distanceToArrivalLs;
      const rightLs = right.distanceToArrivalLs;

      if (leftLs === null && rightLs === null) {
        return left.bodyName.localeCompare(right.bodyName);
      }
      if (leftLs === null) {
        return 1;
      }
      if (rightLs === null) {
        return -1;
      }

      return leftLs - rightLs;
    });

    const nearestBodyLs = system.nearestBodyLs ?? bodies.find((body) => body.distanceToArrivalLs !== null)?.distanceToArrivalLs ?? null;

    return {
      systemName: system.systemName,
      distanceLy: system.distanceLy,
      nearestBodyLs,
      bodies
    };
  }).sort((left, right) => {
    const leftLy = left.distanceLy;
    const rightLy = right.distanceLy;

    if (leftLy === null && rightLy !== null) {
      return 1;
    }
    if (leftLy !== null && rightLy === null) {
      return -1;
    }
    if (leftLy !== null && rightLy !== null && leftLy !== rightLy) {
      return leftLy - rightLy;
    }

    const leftLs = left.nearestBodyLs;
    const rightLs = right.nearestBodyLs;
    if (leftLs === null && rightLs !== null) {
      return 1;
    }
    if (leftLs !== null && rightLs === null) {
      return -1;
    }
    if (leftLs !== null && rightLs !== null && leftLs !== rightLs) {
      return leftLs - rightLs;
    }

    return left.systemName.localeCompare(right.systemName);
  });

  if (exobiologySystems.length === 0) {
    throw new Error("Spansh exobiology search did not contain valid system rows.");
  }

  const uniqueSystems = exobiologySystems.map((system) => ({
    systemName: system.systemName,
    distance: system.distanceLy
  }));

  const legs: RouteLeg[] = uniqueSystems.map((system) => ({
    systemName: system.systemName,
    distance: system.distance,
    distanceRemaining: null,
    fuelLeft: null,
    fuelUsed: null,
    refuel: false,
    neutronStar: false
  }));

  const previewRows: SpanshRoutePreviewRow[] = uniqueSystems.map((system, index) => ({
    systemName: system.systemName,
    distance: system.distance,
    distanceRemaining: null,
    estimatedJumps: uniqueSystems.length - index - 1,
    refuel: false,
    neutronStar: false
  }));

  const referenceSystemValue = typeof request.search.reference_system === "string"
    ? request.search.reference_system.trim()
    : "";
  const routeLabel = referenceSystemValue
    || request.reference?.name?.trim()
    || request.searchReference?.trim()
    || "Filtered search";

  return {
    routeName: `Exobiology ${routeLabel}`,
    legs,
    previewRows,
    exobiologySystems
  };
};
