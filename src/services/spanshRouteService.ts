import { RouteLeg } from "../types/state";

const SPANSH_BASE_URL = "https://spansh.co.uk";
const DEFAULT_TIMEOUT_MS = 45_000;
const POLL_INTERVAL_MS = 1_000;

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
  neutronStar: boolean;
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

export interface SpanshRouteResult {
  routeName: string;
  legs: RouteLeg[];
  previewRows: SpanshRoutePreviewRow[];
}

const delay = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

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
  neutronStar: jump.neutron_star === true
});

export const generateSpanshRoute = async (
  request: SpanshRouteRequest,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
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

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const resultResponse = await fetch(`${SPANSH_BASE_URL}/api/results/${submittedJob.job}`);
    if (!resultResponse.ok) {
      throw new Error(`Spansh result request failed with HTTP ${resultResponse.status}.`);
    }

    const resultPayload = await resultResponse.json() as SpanshResultPayload;
    if (resultPayload.status === "ok" && resultPayload.result) {
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
    }

    if (resultPayload.status === "error") {
      throw new Error(resultPayload.error || "Spansh could not generate a route.");
    }

    await delay(POLL_INTERVAL_MS);
  }

  throw new Error("Spansh route generation timed out.");
};
