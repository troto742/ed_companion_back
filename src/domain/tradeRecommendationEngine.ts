export interface TradeMarketEntry {
  commodityId: string;
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
  supply: number | null;
  demand: number | null;
  distanceLy: number | null;
  updatedAt: string | null;
}

export interface TradeRecommendation {
  commodityId: string;
  commodityName: string;
  origin: {
    systemName: string;
    stationName: string;
    marketId: number | null;
  };
  destination: {
    systemName: string;
    stationName: string;
    marketId: number | null;
  };
  buyPrice: number;
  sellPrice: number;
  profitPerUnit: number;
  distanceLy: number | null;
  sourceSupply: number;
  destinationDemand: number;
  estimatedVolume: number;
  score: number;
  explanation: string;
}

export interface TradeRecommendationEngineOptions {
  minProfitPerUnit: number;
  minSupply: number;
  minDemand: number;
  maxDistanceLy: number | null;
  maxOriginCandidatesPerCommodity: number;
  maxDestinationCandidatesPerCommodity: number;
}

const parseDateMs = (value: string | null): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getPriceToBuyFromMarket = (entry: TradeMarketEntry): number | null => {
  if (typeof entry.sellPrice === "number" && entry.sellPrice > 0) {
    return entry.sellPrice;
  }

  if (typeof entry.buyPrice === "number" && entry.buyPrice > 0) {
    return entry.buyPrice;
  }

  return null;
};

const getPriceToSellToMarket = (entry: TradeMarketEntry): number | null => {
  if (typeof entry.buyPrice === "number" && entry.buyPrice > 0) {
    return entry.buyPrice;
  }

  if (typeof entry.sellPrice === "number" && entry.sellPrice > 0) {
    return entry.sellPrice;
  }

  return null;
};

const safeVolume = (value: number | null): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value);
};

const compareNullableAscending = (left: number | null, right: number | null): number => {
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

const compareFreshnessDescending = (left: TradeMarketEntry, right: TradeMarketEntry): number => {
  const leftMs = parseDateMs(left.updatedAt);
  const rightMs = parseDateMs(right.updatedAt);
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

const computePairDistanceLy = (origin: TradeMarketEntry, destination: TradeMarketEntry): number | null => {
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
    return destination.distanceLy;
  }

  const distance = Math.sqrt(((dx - ox) ** 2) + ((dy - oy) ** 2) + ((dz - oz) ** 2));
  return Number.isFinite(distance) ? distance : null;
};

const buildExplanation = (profitPerUnit: number, volume: number, distanceLy: number | null): string => {
  const profitTag = profitPerUnit >= 25_000 ? "high profit" : profitPerUnit >= 10_000 ? "solid profit" : "positive margin";
  const volumeTag = volume >= 500 ? "strong volume" : volume >= 150 ? "good volume" : "limited volume";
  const distanceTag =
    distanceLy === null ? "unknown distance" : distanceLy <= 30 ? "short distance" : distanceLy <= 80 ? "medium distance" : "long distance";
  return `${profitTag}, ${distanceTag}, ${volumeTag}`;
};

const computeScore = (
  profitPerUnit: number,
  estimatedVolume: number,
  distanceLy: number | null,
  sourceUpdatedAt: string | null,
  destinationUpdatedAt: string | null
): number => {
  const distanceFactor = distanceLy !== null && distanceLy >= 0 ? distanceLy / 25 : 2;
  const volumeFactor = Math.log10(estimatedVolume + 10);

  const now = Date.now();
  const sourceMs = parseDateMs(sourceUpdatedAt);
  const destinationMs = parseDateMs(destinationUpdatedAt);
  const freshnessHoursSource = sourceMs === null ? 999 : Math.max(0, (now - sourceMs) / (1000 * 60 * 60));
  const freshnessHoursDestination = destinationMs === null ? 999 : Math.max(0, (now - destinationMs) / (1000 * 60 * 60));
  const freshnessFactor = 1 / (1 + (freshnessHoursSource + freshnessHoursDestination) / 48);

  return (profitPerUnit * volumeFactor * freshnessFactor) / (1 + distanceFactor);
};

interface CommodityRecsInput {
  commodityId: string;
  commodityName: string;
  origins: TradeMarketEntry[];
  destinations: TradeMarketEntry[];
  options: TradeRecommendationEngineOptions;
}

const computeCommodityRecommendations = (input: CommodityRecsInput): TradeRecommendation[] => {
  const { commodityId, commodityName, origins, destinations, options } = input;

  const candidateOrigins = origins
    .filter((entry) => {
      const buyPrice = getPriceToBuyFromMarket(entry);
      const supply = safeVolume(entry.supply);
      return buyPrice !== null && supply >= options.minSupply;
    })
    .sort((left, right) => {
      const leftPrice = getPriceToBuyFromMarket(left);
      const rightPrice = getPriceToBuyFromMarket(right);
      const byPrice = compareNullableAscending(leftPrice, rightPrice);
      if (byPrice !== 0) {
        return byPrice;
      }

      const bySupply = safeVolume(right.supply) - safeVolume(left.supply);
      if (bySupply !== 0) {
        return bySupply;
      }

      return compareFreshnessDescending(left, right);
    })
    .slice(0, options.maxOriginCandidatesPerCommodity);

  const candidateDestinations = destinations
    .filter((entry) => {
      const sellPrice = getPriceToSellToMarket(entry);
      const demand = safeVolume(entry.demand);
      if (sellPrice === null || demand < options.minDemand) {
        return false;
      }

      return true;
    })
    .sort((left, right) => {
      const leftPrice = getPriceToSellToMarket(left);
      const rightPrice = getPriceToSellToMarket(right);
      const byPrice = compareNullableAscending(rightPrice, leftPrice);
      if (byPrice !== 0) {
        return byPrice;
      }

      const byDemand = safeVolume(right.demand) - safeVolume(left.demand);
      if (byDemand !== 0) {
        return byDemand;
      }

      return compareFreshnessDescending(left, right);
    })
    .slice(0, options.maxDestinationCandidatesPerCommodity);

  const recommendations: TradeRecommendation[] = [];

  for (const origin of candidateOrigins) {
    const buyPrice = getPriceToBuyFromMarket(origin);
    if (buyPrice === null) {
      continue;
    }

    const sourceSupply = safeVolume(origin.supply);

    for (const destination of candidateDestinations) {
      if (origin.marketId !== null && destination.marketId !== null && origin.marketId === destination.marketId) {
        continue;
      }

      const sellPrice = getPriceToSellToMarket(destination);
      if (sellPrice === null) {
        continue;
      }

      const profitPerUnit = sellPrice - buyPrice;
      if (profitPerUnit <= 0 || profitPerUnit < options.minProfitPerUnit) {
        continue;
      }

      const destinationDemand = safeVolume(destination.demand);
      const estimatedVolume = Math.min(sourceSupply, destinationDemand);
      if (estimatedVolume < 1) {
        continue;
      }

      const distanceLy = computePairDistanceLy(origin, destination);
      if (options.maxDistanceLy !== null) {
        if (distanceLy === null) {
          continue;
        }
        if (distanceLy > options.maxDistanceLy) {
          continue;
        }
      }

      const score = computeScore(profitPerUnit, estimatedVolume, distanceLy, origin.updatedAt, destination.updatedAt);
      recommendations.push({
        commodityId,
        commodityName,
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
        explanation: buildExplanation(profitPerUnit, estimatedVolume, distanceLy)
      });
    }
  }

  recommendations.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    if (right.profitPerUnit !== left.profitPerUnit) {
      return right.profitPerUnit - left.profitPerUnit;
    }
    return compareNullableAscending(left.distanceLy, right.distanceLy);
  });

  return recommendations;
};

export const buildTradeRecommendations = (
  originsByCommodity: Map<string, TradeMarketEntry[]>,
  destinationsByCommodity: Map<string, TradeMarketEntry[]>,
  options: TradeRecommendationEngineOptions
): TradeRecommendation[] => {
  const recommendations: TradeRecommendation[] = [];

  for (const [commodityId, origins] of originsByCommodity.entries()) {
    const destinations = destinationsByCommodity.get(commodityId) ?? [];
    if (origins.length === 0 || destinations.length === 0) {
      continue;
    }

    const commodityName = origins[0]?.commodityName ?? commodityId;
    const commodityRecommendations = computeCommodityRecommendations({
      commodityId,
      commodityName,
      origins,
      destinations,
      options
    });

    recommendations.push(...commodityRecommendations);
  }

  recommendations.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return right.profitPerUnit - left.profitPerUnit;
  });

  return recommendations;
};
