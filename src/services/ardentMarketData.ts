const ARDENT_BASE_URL = "https://api.ardent-insight.com/v2";
const REQUEST_TIMEOUT_MS = 15_000;

export interface ArdentTradeOrder {
  commodityName: string;
  systemName: string;
  stationName: string;
  stationType: string | null;
  bodyName: string | null;
  maxLandingPadSize: number | null;
  marketId: number | null;
  systemX: number | null;
  systemY: number | null;
  systemZ: number | null;
  buyPrice: number | null;
  sellPrice: number | null;
  stock: number | null;
  demand: number | null;
  distanceLy: number | null;
  updatedAt: string | null;
}

const readString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const readNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const normalizeCommodity = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, "");
const normalizeSystem = (value: string): string => value.trim();

const toTradeOrder = (
  raw: Record<string, unknown>,
  commodityOverride: string | null = null
): ArdentTradeOrder | null => {
  const commodityName = readString(raw.commodityName ?? raw.commodity ?? commodityOverride);
  const systemName = readString(raw.systemName ?? raw.starSystem ?? raw.system);
  const stationName = readString(raw.stationName ?? raw.station);
  if (!commodityName || !systemName || !stationName) {
    return null;
  }

  return {
    commodityName: commodityName.trim(),
    systemName,
    stationName,
    stationType: readString(raw.stationType),
    bodyName: readString(raw.bodyName),
    maxLandingPadSize: readNumber(raw.maxLandingPadSize),
    marketId: readNumber(raw.marketId ?? raw.marketID),
    systemX: readNumber(raw.systemX),
    systemY: readNumber(raw.systemY),
    systemZ: readNumber(raw.systemZ),
    buyPrice: readNumber(raw.buyPrice ?? raw.price),
    sellPrice: readNumber(raw.sellPrice ?? raw.price),
    stock: readNumber(raw.stock ?? raw.supply),
    demand: readNumber(raw.demand),
    distanceLy: readNumber(raw.distance ?? raw.distanceLy),
    updatedAt: readString(raw.updatedAt ?? raw.timestamp)
  };
};

const requestJson = async (url: URL): Promise<unknown> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "elite-companion-backend"
      }
    });

    if (!response.ok) {
      throw new Error(`Ardent request failed (${response.status}) ${url.pathname}`);
    }

    return response.json() as Promise<unknown>;
  } finally {
    clearTimeout(timeout);
  }
};

export const fetchSystemExports = async (
  sourceSystemInput: string,
  maxDaysAgo: number,
  minVolume: number
): Promise<ArdentTradeOrder[]> => {
  const sourceSystem = normalizeSystem(sourceSystemInput);
  if (!sourceSystem) {
    return [];
  }

  const url = new URL(`${ARDENT_BASE_URL}/system/name/${encodeURIComponent(sourceSystem)}/commodities/exports`);
  url.searchParams.set("maxDaysAgo", String(maxDaysAgo));
  url.searchParams.set("minVolume", String(Math.max(1, Math.floor(minVolume))));
  url.searchParams.set("fleetCarriers", "0");

  const payload = await requestJson(url);
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    .map((entry) => toTradeOrder(entry))
    .filter((entry): entry is ArdentTradeOrder => entry !== null);
};

export const fetchNearbyImportsForCommodity = async (
  sourceSystemInput: string,
  commodityInput: string,
  maxDistance: number,
  maxDaysAgo: number,
  minVolume: number,
  minPrice: number
): Promise<ArdentTradeOrder[]> => {
  const sourceSystem = normalizeSystem(sourceSystemInput);
  const commodity = normalizeCommodity(commodityInput);
  if (!sourceSystem || !commodity) {
    return [];
  }

  const url = new URL(
    `${ARDENT_BASE_URL}/system/name/${encodeURIComponent(sourceSystem)}/commodity/name/${encodeURIComponent(commodity)}/nearby/imports`
  );
  url.searchParams.set("maxDistance", String(maxDistance));
  url.searchParams.set("maxDaysAgo", String(maxDaysAgo));
  url.searchParams.set("minVolume", String(Math.max(1, Math.floor(minVolume))));
  url.searchParams.set("minPrice", String(Math.max(1, Math.floor(minPrice))));
  url.searchParams.set("fleetCarriers", "0");

  const payload = await requestJson(url);
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    .map((entry) => toTradeOrder(entry, commodity))
    .filter((entry): entry is ArdentTradeOrder => entry !== null);
};

export const fetchCommodityExports = async (
  commodityInput: string,
  maxDaysAgo: number,
  minVolume: number,
  includeFleetCarriers: boolean = false
): Promise<ArdentTradeOrder[]> => {
  const commodity = normalizeCommodity(commodityInput);
  if (!commodity) {
    return [];
  }

  const url = new URL(`${ARDENT_BASE_URL}/commodity/name/${encodeURIComponent(commodity)}/exports`);
  url.searchParams.set("maxDaysAgo", String(maxDaysAgo));
  url.searchParams.set("minVolume", String(Math.max(1, Math.floor(minVolume))));
  url.searchParams.set("fleetCarriers", includeFleetCarriers ? "1" : "0");

  const payload = await requestJson(url);
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    .map((entry) => toTradeOrder(entry, commodity))
    .filter((entry): entry is ArdentTradeOrder => entry !== null);
};

export const fetchCommodityImports = async (
  commodityInput: string,
  maxDaysAgo: number,
  minVolume: number,
  includeFleetCarriers: boolean = false
): Promise<ArdentTradeOrder[]> => {
  const commodity = normalizeCommodity(commodityInput);
  if (!commodity) {
    return [];
  }

  const url = new URL(`${ARDENT_BASE_URL}/commodity/name/${encodeURIComponent(commodity)}/imports`);
  url.searchParams.set("maxDaysAgo", String(maxDaysAgo));
  url.searchParams.set("minVolume", String(Math.max(1, Math.floor(minVolume))));
  url.searchParams.set("fleetCarriers", includeFleetCarriers ? "1" : "0");

  const payload = await requestJson(url);
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    .map((entry) => toTradeOrder(entry, commodity))
    .filter((entry): entry is ArdentTradeOrder => entry !== null);
};
