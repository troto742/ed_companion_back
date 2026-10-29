export interface CommoditySearchStation {
  marketId: number | null;
  systemName: string;
  stationName: string;
  distanceLy: number | null;
  price: number | null;
  supply: number | null;
  demand: number | null;
  updatedAt: string | null;
}

export interface CommoditySearchResult {
  sourceSystem: string;
  commodity: string;
  best: CommoditySearchStation[];
  cheapest: CommoditySearchStation[];
  nearest: CommoditySearchStation[];
}

const ARDENT_BASE_URL = "https://api.ardent-insight.com/v2";
const REQUEST_TIMEOUT_MS = 12_000;

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

const readString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeCommodity = (value: string): string => {
  return value.trim().toLowerCase().replace(/\s+/g, "");
};

const normalizeSystem = (value: string): string => value.trim();

const toStationModel = (raw: Record<string, unknown>): CommoditySearchStation | null => {
  const systemName = readString(raw.systemName ?? raw.starSystem ?? raw.system);
  const stationName = readString(raw.stationName ?? raw.station);
  if (!systemName || !stationName) {
    return null;
  }

  return {
    marketId: readNumber(raw.marketId ?? raw.marketID),
    systemName,
    stationName,
    distanceLy: readNumber(raw.distance ?? raw.distanceLy),
    price: readNumber(raw.sellPrice ?? raw.buyPrice ?? raw.price),
    supply: readNumber(raw.supply ?? raw.stock),
    demand: readNumber(raw.demand),
    updatedAt: readString(raw.updatedAt ?? raw.timestamp)
  };
};

const getStations = async (
  sourceSystem: string,
  commodity: string,
  minSupply: number,
  maxDistance: number,
  maxDaysAgo: number
): Promise<CommoditySearchStation[]> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = new URL(
      `${ARDENT_BASE_URL}/system/name/${encodeURIComponent(sourceSystem)}/commodity/name/${encodeURIComponent(commodity)}/nearby/exports`
    );
    url.searchParams.set("maxDistance", String(maxDistance));
    url.searchParams.set("maxDaysAgo", String(maxDaysAgo));
    url.searchParams.set("minVolume", String(Math.max(1, Math.floor(minSupply))));
    url.searchParams.set("fleetCarriers", "0");

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "elite-companion-backend"
      }
    });

    if (!response.ok) {
      throw new Error(`Commodity search failed with status ${response.status}.`);
    }

    const payload = await response.json() as unknown;
    if (!Array.isArray(payload)) {
      return [];
    }

    return payload
      .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
      .map((entry) => toStationModel(entry))
      .filter((entry): entry is CommoditySearchStation => entry !== null);
  } finally {
    clearTimeout(timeout);
  }
};

const compareNullableNumber = (left: number | null, right: number | null): number => {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return left - right;
};

const parseUpdatedAtMillis = (value: string | null): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const compareByFreshness = (left: CommoditySearchStation, right: CommoditySearchStation): number => {
  const leftMs = parseUpdatedAtMillis(left.updatedAt);
  const rightMs = parseUpdatedAtMillis(right.updatedAt);

  if (leftMs === null && rightMs === null) {
    return 0;
  }

  if (leftMs === null) {
    return 1;
  }

  if (rightMs === null) {
    return -1;
  }

  return rightMs - leftMs;
};

const getComparablePrice = (value: number | null): number => {
  return value === null || !Number.isFinite(value) ? Number.MAX_SAFE_INTEGER : value;
};

const getComparableDistance = (value: number | null): number => {
  return value === null || !Number.isFinite(value) ? Number.MAX_SAFE_INTEGER : value;
};

const buildBestMissionRank = (stations: CommoditySearchStation[]): CommoditySearchStation[] => {
  const priced = stations
    .map((station) => getComparablePrice(station.price))
    .filter((price) => price !== Number.MAX_SAFE_INTEGER)
    .sort((left, right) => left - right);

  const cheapestPrice = priced[0] ?? 0;

  return [...stations].sort((left, right) => {
    const leftDistance = getComparableDistance(left.distanceLy);
    const rightDistance = getComparableDistance(right.distanceLy);
    const leftPrice = getComparablePrice(left.price);
    const rightPrice = getComparablePrice(right.price);

    const leftPricePremium = cheapestPrice > 0 && leftPrice !== Number.MAX_SAFE_INTEGER
      ? (leftPrice - cheapestPrice) / cheapestPrice
      : 0;
    const rightPricePremium = cheapestPrice > 0 && rightPrice !== Number.MAX_SAFE_INTEGER
      ? (rightPrice - cheapestPrice) / cheapestPrice
      : 0;

    const leftScore = leftDistance + (leftPricePremium * 35);
    const rightScore = rightDistance + (rightPricePremium * 35);

    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }

    const byDistance = compareNullableNumber(left.distanceLy, right.distanceLy);
    if (byDistance !== 0) {
      return byDistance;
    }

    const byPrice = compareNullableNumber(left.price, right.price);
    if (byPrice !== 0) {
      return byPrice;
    }

    return compareByFreshness(left, right);
  });
};

export const searchCommodityMarkets = async (
  sourceSystemInput: string,
  commodityInput: string,
  limit: number = 10,
  minSupply: number = 1,
  maxDistance: number = 120,
  maxDaysAgo: number = 14
): Promise<CommoditySearchResult> => {
  const sourceSystem = normalizeSystem(sourceSystemInput);
  const commodity = normalizeCommodity(commodityInput);

  if (!sourceSystem || !commodity) {
    return {
      sourceSystem,
      commodity,
      best: [],
      cheapest: [],
      nearest: []
    };
  }

  const stations = (await getStations(sourceSystem, commodity, minSupply, maxDistance, maxDaysAgo))
    .filter((entry) => entry.supply !== null && entry.supply >= minSupply);

  const best = buildBestMissionRank(stations).slice(0, limit);

  const cheapest = [...stations]
    .sort((left, right) => {
      const byPrice = compareNullableNumber(left.price, right.price);
      if (byPrice !== 0) {
        return byPrice;
      }

      const byDistance = compareNullableNumber(left.distanceLy, right.distanceLy);
      if (byDistance !== 0) {
        return byDistance;
      }

      return compareByFreshness(left, right);
    })
    .slice(0, limit);

  const nearest = [...stations]
    .sort((left, right) => {
      const byDistance = compareNullableNumber(left.distanceLy, right.distanceLy);
      if (byDistance !== 0) {
        return byDistance;
      }

      const byPrice = compareNullableNumber(left.price, right.price);
      if (byPrice !== 0) {
        return byPrice;
      }

      return compareByFreshness(left, right);
    })
    .slice(0, limit);

  return {
    sourceSystem,
    commodity,
    best,
    cheapest,
    nearest
  };
};
