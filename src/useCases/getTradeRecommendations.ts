import { fetchCommodityExports, fetchCommodityImports } from "../services/ardentMarketData";
import {
  buildTradeRecommendations,
  TradeMarketEntry,
  TradeRecommendation
} from "../domain/tradeRecommendationEngine";

export interface GetTradeRecommendationsParams {
  topN: number;
  minProfit: number;
  maxDistance: number | null;
  commodityId: string;
  minSupply: number;
  minDemand: number;
  maxDaysAgo: number;
  includeFleetCarriers: boolean;
  useFleetCarrier: boolean;
  onlyStations: boolean;
}

export interface TradeRecommendationsResponse {
  sourceSystem: string | null;
  filters: {
    topN: number;
    minProfit: number;
    maxDistance: number | null;
    commodityId: string | null;
    minSupply: number;
    minDemand: number;
    maxDaysAgo: number;
  };
  recommendations: TradeRecommendation[];
}

const normalizeCommodity = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, "");
const normalizeSystemKey = (value: string): string => value.trim().toLowerCase();
const LARGE_PAD_SIZE = 3;
const isPlanetaryStationType = (stationType: string | null): boolean => {
  if (!stationType) {
    return false;
  }

  const normalized = stationType.trim().toLowerCase();
  return normalized.includes("planetary")
    || normalized.includes("settlement")
    || normalized.includes("surface");
};

const supportsLargePad = (maxLandingPadSize: number | null): boolean => maxLandingPadSize === LARGE_PAD_SIZE;
const hasPlanetaryBody = (bodyName: string | null): boolean => Boolean(bodyName && bodyName.trim().length > 0);
const isOnlyStationEligible = (entry: TradeMarketEntry): boolean => {
  return !isPlanetaryStationType(entry.stationType) && !hasPlanetaryBody(entry.bodyName);
};

const safeVolume = (value: number | null): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value);
};

const getBuyPrice = (entry: TradeMarketEntry): number | null => {
  if (typeof entry.sellPrice === "number" && entry.sellPrice > 0) {
    return entry.sellPrice;
  }

  if (typeof entry.buyPrice === "number" && entry.buyPrice > 0) {
    return entry.buyPrice;
  }

  return null;
};

const getSellPrice = (entry: TradeMarketEntry): number | null => {
  if (typeof entry.buyPrice === "number" && entry.buyPrice > 0) {
    return entry.buyPrice;
  }

  if (typeof entry.sellPrice === "number" && entry.sellPrice > 0) {
    return entry.sellPrice;
  }

  return null;
};

const computeDistanceLy = (origin: TradeMarketEntry, destination: TradeMarketEntry): number | null => {
  const ox = origin.systemX;
  const oy = origin.systemY;
  const oz = origin.systemZ;
  const dx = destination.systemX;
  const dy = destination.systemY;
  const dz = destination.systemZ;

  if (
    ox === null || oy === null || oz === null
    || dx === null || dy === null || dz === null
  ) {
    return null;
  }

  const distance = Math.sqrt(((dx - ox) ** 2) + ((dy - oy) ** 2) + ((dz - oz) ** 2));
  return Number.isFinite(distance) ? distance : null;
};

const dedupeByDestinationSystem = (rows: TradeRecommendation[]): TradeRecommendation[] => {
  const unique = new Map<string, TradeRecommendation>();
  for (const row of rows) {
    const key = normalizeSystemKey(row.destination.systemName);
    if (!key) {
      continue;
    }

    if (!unique.has(key)) {
      unique.set(key, row);
    }
  }

  return [...unique.values()];
};

const toMarketEntry = (entry: {
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
}): TradeMarketEntry => ({
  commodityId: normalizeCommodity(entry.commodityName),
  commodityName: entry.commodityName,
  systemName: entry.systemName,
  stationName: entry.stationName,
  stationType: entry.stationType,
  bodyName: entry.bodyName,
  maxLandingPadSize: entry.maxLandingPadSize,
  marketId: entry.marketId,
  systemX: entry.systemX,
  systemY: entry.systemY,
  systemZ: entry.systemZ,
  buyPrice: entry.buyPrice,
  sellPrice: entry.sellPrice,
  supply: entry.stock,
  demand: entry.demand,
  distanceLy: entry.distanceLy,
  updatedAt: entry.updatedAt
});

const buildFleetCarrierRecommendations = (
  commodityId: string,
  origins: TradeMarketEntry[],
  destinations: TradeMarketEntry[],
  topN: number,
  minProfit: number,
  minSupply: number,
  minDemand: number,
  maxDistanceLy: number
): TradeRecommendation[] => {
  const originCandidates = origins
    .filter((entry) => {
      const buyPrice = getBuyPrice(entry);
      return buyPrice !== null && safeVolume(entry.supply) >= minSupply;
    })
    .sort((left, right) => {
      const bySupply = safeVolume(right.supply) - safeVolume(left.supply);
      if (bySupply !== 0) {
        return bySupply;
      }

      const leftBuy = getBuyPrice(left) ?? Number.MAX_SAFE_INTEGER;
      const rightBuy = getBuyPrice(right) ?? Number.MAX_SAFE_INTEGER;
      return leftBuy - rightBuy;
    })
    .slice(0, 140);

  const destinationCandidates = destinations
    .filter((entry) => {
      const sellPrice = getSellPrice(entry);
      return sellPrice !== null && safeVolume(entry.demand) >= minDemand;
    })
    .sort((left, right) => {
      const byDemand = safeVolume(right.demand) - safeVolume(left.demand);
      if (byDemand !== 0) {
        return byDemand;
      }

      const leftSell = getSellPrice(left) ?? 0;
      const rightSell = getSellPrice(right) ?? 0;
      return rightSell - leftSell;
    })
    .slice(0, 160);

  const recommendations: TradeRecommendation[] = [];

  for (const origin of originCandidates) {
    const buyPrice = getBuyPrice(origin);
    if (buyPrice === null) {
      continue;
    }

    const sourceSupply = safeVolume(origin.supply);

    for (const destination of destinationCandidates) {
      if (origin.marketId !== null && destination.marketId !== null && origin.marketId === destination.marketId) {
        continue;
      }

      const sellPrice = getSellPrice(destination);
      if (sellPrice === null) {
        continue;
      }

      const distanceLy = computeDistanceLy(origin, destination);
      if (distanceLy === null || distanceLy > maxDistanceLy) {
        continue;
      }

      const profitPerUnit = sellPrice - buyPrice;
      if (profitPerUnit <= 0 || profitPerUnit < minProfit) {
        continue;
      }

      const destinationDemand = safeVolume(destination.demand);
      const estimatedVolume = Math.min(sourceSupply, destinationDemand);
      if (estimatedVolume < 1) {
        continue;
      }

      const score = (
        profitPerUnit
        * Math.log10(estimatedVolume + 10)
        * (1 + (sourceSupply / 10000))
        * (1 + (destinationDemand / 10000))
      ) / (1 + (distanceLy / 120));

      recommendations.push({
        commodityId,
        commodityName: origin.commodityName,
        origin: {
          systemName: origin.systemName,
          stationName: origin.stationName,
          marketId: origin.marketId
        },
        destination: {
          systemName: destination.systemName,
          stationName: destination.stationName,
          marketId: destination.marketId
        },
        buyPrice,
        sellPrice,
        profitPerUnit,
        distanceLy,
        sourceSupply,
        destinationDemand,
        estimatedVolume,
        score,
        explanation: "Fleet Carrier mode: high supply source + high demand destination within 500 ly"
      });
    }
  }

  recommendations.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    if (right.destinationDemand !== left.destinationDemand) {
      return right.destinationDemand - left.destinationDemand;
    }

    if (right.sourceSupply !== left.sourceSupply) {
      return right.sourceSupply - left.sourceSupply;
    }

    return right.profitPerUnit - left.profitPerUnit;
  });

  return dedupeByDestinationSystem(recommendations).slice(0, topN);
};

export const getTradeRecommendations = async (
  params: GetTradeRecommendationsParams
): Promise<TradeRecommendationsResponse> => {
  const commodityFilter = normalizeCommodity(params.commodityId);
  if (!commodityFilter) {
    return {
      sourceSystem: null,
      filters: {
        topN: params.topN,
        minProfit: params.minProfit,
        maxDistance: params.maxDistance,
        commodityId: null,
        minSupply: params.minSupply,
        minDemand: params.minDemand,
        maxDaysAgo: params.maxDaysAgo
      },
      recommendations: []
    };
  }

  const [exports, imports] = await Promise.all([
    fetchCommodityExports(
      commodityFilter,
      params.maxDaysAgo,
      params.minSupply,
      params.includeFleetCarriers
    ),
    fetchCommodityImports(
      commodityFilter,
      params.maxDaysAgo,
      params.minDemand,
      params.includeFleetCarriers
    )
  ]);

  const origins = exports
    .map((entry) => toMarketEntry(entry))
    .filter((entry) => supportsLargePad(entry.maxLandingPadSize))
    .filter((entry) => !params.onlyStations || isOnlyStationEligible(entry));
  const destinations = imports
    .map((entry) => toMarketEntry(entry))
    .filter((entry) => supportsLargePad(entry.maxLandingPadSize))
    .filter((entry) => !params.onlyStations || isOnlyStationEligible(entry));

  const effectiveMaxDistance = params.useFleetCarrier
    ? Math.min(params.maxDistance ?? 500, 500)
    : params.maxDistance;

  const recommendations = params.useFleetCarrier
    ? buildFleetCarrierRecommendations(
      commodityFilter,
      origins,
      destinations,
      params.topN,
      params.minProfit,
      params.minSupply,
      params.minDemand,
      effectiveMaxDistance ?? 500
    )
    : (() => {
      const originsByCommodity = new Map<string, TradeMarketEntry[]>(
        [[commodityFilter, origins]]
      );
      const destinationsByCommodity = new Map<string, TradeMarketEntry[]>(
        [[commodityFilter, destinations]]
      );

      const ranked = buildTradeRecommendations(originsByCommodity, destinationsByCommodity, {
        minProfitPerUnit: params.minProfit,
        minSupply: params.minSupply,
        minDemand: params.minDemand,
        maxDistanceLy: effectiveMaxDistance,
        maxOriginCandidatesPerCommodity: 120,
        maxDestinationCandidatesPerCommodity: 120
      });

      return dedupeByDestinationSystem(ranked).slice(0, params.topN);
    })();

  return {
    sourceSystem: null,
    filters: {
      topN: params.topN,
      minProfit: params.minProfit,
      maxDistance: effectiveMaxDistance,
      commodityId: commodityFilter,
      minSupply: params.minSupply,
      minDemand: params.minDemand,
      maxDaysAgo: params.maxDaysAgo
    },
    recommendations
  };
};
