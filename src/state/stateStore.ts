import { JournalPayload, StatusPayload } from "../types/ingest";
import { interpretStatusFlags } from "../services/flags";
import {
  ColonizationCommodityNeed,
  ColonizationState,
  MissionBoardState,
  MissionReward,
  MissionState,
  RouteLeg,
  RouteState,
  StateChangeSet,
  StateSnapshot
} from "../types/state";

const EVENT_HISTORY_LIMIT = 2_000;

const normalizeTimestamp = (timestamp: string | undefined): string => {
  if (!timestamp) {
    return new Date().toISOString();
  }

  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
};

const isOutOfOrder = (incoming: string, current: string | null): boolean => {
  if (!current) {
    return false;
  }

  return Date.parse(incoming) < Date.parse(current);
};

const normalizeSystem = (value: string): string => value.trim().toLowerCase();
const normalizeText = (value: string | undefined): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

export interface StoreCheckpoint {
  snapshot: StateSnapshot;
  seenEventQueue: string[];
}

export class StateStore {
  private ship: StateSnapshot["ship"] = {
    shipType: null,
    shipName: null,
    shipIdent: null,
    shipId: null,
    cargoCapacity: null,
    fuelCapacityMain: null,
    fuelCapacityReserve: null,
    maxJumpRange: null,
    lastJumpDistance: null,
    flags: null,
    interpretedFlags: {
      docked: false,
      supercruise: false,
      landingGearDown: false,
      fsdCharging: false
    },
    fuel: { main: null, reserve: null },
    cargo: null,
    hull: null,
    shields: null,
    updatedAt: null
  };

  private location: StateSnapshot["location"] = {
    starSystem: null,
    bodyName: null,
    stationName: null,
    fleetCarrier: null,
    docked: false,
    supercruise: false,
    updatedAt: null
  };

  private route: RouteState = {
    routeLoaded: false,
    routeName: null,
    legs: [],
    currentIndex: null,
    nextLeg: null,
    previousLeg: null,
    routeMismatch: false,
    updatedAt: null
  };

  private missions: MissionBoardState = {
    active: [],
    history: [],
    updatedAt: null
  };

  private colonization: ColonizationState = {
    isColonizing: false,
    systemName: null,
    marketId: null,
    constructionProgress: null,
    constructionComplete: false,
    constructionFailed: false,
    requiredCommodities: [],
    updatedAt: null
  };

  private seenEventKeys: Set<string> = new Set();
  private seenEventQueue: string[] = [];

  getSnapshot(): StateSnapshot {
    return {
      ship: {
        ...this.ship,
        interpretedFlags: { ...this.ship.interpretedFlags },
        fuel: { ...this.ship.fuel }
      },
      location: { ...this.location },
      route: {
        ...this.route,
        legs: [...this.route.legs],
        nextLeg: this.route.nextLeg ? { ...this.route.nextLeg } : null,
        previousLeg: this.route.previousLeg ? { ...this.route.previousLeg } : null
      },
      missions: {
        updatedAt: this.missions.updatedAt,
        active: this.missions.active.map((mission) => this.cloneMission(mission)),
        history: this.missions.history.map((mission) => this.cloneMission(mission))
      },
      colonization: {
        ...this.colonization,
        requiredCommodities: this.colonization.requiredCommodities.map((item) => ({ ...item }))
      }
    };
  }

  setSnapshot(snapshot: StateSnapshot): void {
    this.applySnapshot(snapshot);
    this.seenEventKeys.clear();
    this.seenEventQueue = [];
  }

  createCheckpoint(): StoreCheckpoint {
    return {
      snapshot: this.getSnapshot(),
      seenEventQueue: [...this.seenEventQueue]
    };
  }

  restoreCheckpoint(checkpoint: StoreCheckpoint): void {
    this.applySnapshot(checkpoint.snapshot);
    this.seenEventQueue = [...checkpoint.seenEventQueue];
    this.seenEventKeys = new Set(checkpoint.seenEventQueue);
  }

  applyStatus(payload: StatusPayload): StateChangeSet {
    const timestamp = normalizeTimestamp(payload.timestamp);
    if (isOutOfOrder(timestamp, this.ship.updatedAt)) {
      return {
        shipUpdated: false,
        locationUpdated: false,
        routeUpdated: false,
        missionsUpdated: false,
        colonizationUpdated: false,
        ignored: true,
        reason: "out_of_order"
      };
    }

    let shipUpdated = false;
    let locationUpdated = false;

    if (typeof payload.flags === "number") {
      this.ship.flags = payload.flags;
      this.ship.interpretedFlags = interpretStatusFlags(payload.flags);
      this.location.docked = this.ship.interpretedFlags.docked;
      this.location.supercruise = this.ship.interpretedFlags.supercruise;
      locationUpdated = true;
      shipUpdated = true;
    }

    if (typeof payload.fsdCharging === "boolean") {
      if (this.ship.interpretedFlags.fsdCharging !== payload.fsdCharging) {
        this.ship.interpretedFlags = {
          ...this.ship.interpretedFlags,
          fsdCharging: payload.fsdCharging
        };
        shipUpdated = true;
      }
    }

    if (payload.fuel) {
      if (typeof payload.fuel.main === "number") {
        this.ship.fuel.main = payload.fuel.main;
        shipUpdated = true;
      }
      if (typeof payload.fuel.reserve === "number") {
        this.ship.fuel.reserve = payload.fuel.reserve;
        shipUpdated = true;
      }
    }

    if (typeof payload.cargo === "number") {
      this.ship.cargo = payload.cargo;
      shipUpdated = true;
    }

    if (typeof payload.hull === "number") {
      this.ship.hull = payload.hull;
      shipUpdated = true;
    }

    if (typeof payload.shields === "number") {
      this.ship.shields = payload.shields;
      shipUpdated = true;
    }

    const statusStarSystem = normalizeText(payload.starSystem);
    if (statusStarSystem && statusStarSystem !== this.location.starSystem) {
      this.location.starSystem = statusStarSystem;
      locationUpdated = true;
    }

    const statusBodyName = normalizeText(payload.bodyName);
    if (statusBodyName && statusBodyName !== this.location.bodyName) {
      this.location.bodyName = statusBodyName;
      locationUpdated = true;
    }

    const statusStationName = normalizeText(payload.stationName);
    if (statusStationName && statusStationName !== this.location.stationName) {
      this.location.stationName = statusStationName;
      locationUpdated = true;
    }

    if (shipUpdated) {
      this.ship.updatedAt = timestamp;
    }

    if (locationUpdated) {
      this.location.updatedAt = timestamp;
    }

    return {
      shipUpdated,
      locationUpdated,
      routeUpdated: false,
      missionsUpdated: false,
      colonizationUpdated: false,
      ignored: false
    };
  }

  applyJournal(payload: JournalPayload): StateChangeSet {
    const timestamp = normalizeTimestamp(payload.timestamp);
    const data = payload.data ?? {};
    const eventType = payload.eventType;
    const event = eventType.trim().toLowerCase();
    const isMissionEvent = event === "missions" || event.startsWith("mission");
    const lastRelevantTimestamp = isMissionEvent ? this.missions.updatedAt : this.location.updatedAt;
    if (isOutOfOrder(timestamp, lastRelevantTimestamp)) {
      return {
        shipUpdated: false,
        locationUpdated: false,
        routeUpdated: false,
        missionsUpdated: false,
        colonizationUpdated: false,
        ignored: true,
        reason: "out_of_order"
      };
    }

    const eventKey = `${timestamp}|${eventType}|${JSON.stringify(data)}`;
    if (this.seenEventKeys.has(eventKey)) {
      return {
        shipUpdated: false,
        locationUpdated: false,
        routeUpdated: false,
        missionsUpdated: false,
        colonizationUpdated: false,
        ignored: true,
        reason: "duplicate"
      };
    }

    this.seenEventKeys.add(eventKey);
    this.seenEventQueue.push(eventKey);
    if (this.seenEventQueue.length > EVENT_HISTORY_LIMIT) {
      const oldest = this.seenEventQueue.shift();
      if (oldest) {
        this.seenEventKeys.delete(oldest);
      }
    }

    let locationPatchApplied = false;
    let shipPatchApplied = false;
    let routeUpdated = false;
    let missionsUpdated = false;
    let colonizationUpdated = false;

    const updateLocationFromPatch = (patch: Partial<StateSnapshot["location"]>): boolean => {
      const nextLocation = { ...this.location, ...patch, updatedAt: timestamp };
      const changed = JSON.stringify(nextLocation) !== JSON.stringify(this.location);
      if (changed) {
        this.location = nextLocation;
      }
      return changed;
    };

    const updateShipFromPatch = (patch: Partial<StateSnapshot["ship"]>): boolean => {
      const nextShip = { ...this.ship, ...patch, updatedAt: timestamp };
      const changed = JSON.stringify(nextShip) !== JSON.stringify(this.ship);
      if (changed) {
        this.ship = nextShip;
      }
      return changed;
    };

    switch (event) {
      case "loadgame": {
        shipPatchApplied = updateShipFromPatch({
          shipType: this.readString(data, ["Ship", "ShipType", "ship"], this.ship.shipType),
          shipName: this.readString(data, ["ShipName", "Ship_Localised", "shipName"], this.ship.shipName),
          shipIdent: this.readString(data, ["ShipIdent", "ShipIDent", "shipIdent"], this.ship.shipIdent),
          shipId: this.readNumber(data, ["ShipID", "ShipId", "shipId"], this.ship.shipId),
          fuelCapacityMain: this.readNumber(data, ["FuelCapacity", "fuelCapacity"], this.ship.fuelCapacityMain)
        });
        break;
      }
      case "loadout": {
        shipPatchApplied = updateShipFromPatch({
          shipType: this.readString(data, ["Ship", "ShipType", "ship"], this.ship.shipType),
          shipName: this.readString(data, ["ShipName", "Ship_Localised", "shipName"], this.ship.shipName),
          shipIdent: this.readString(data, ["ShipIdent", "ShipIDent", "shipIdent"], this.ship.shipIdent),
          shipId: this.readNumber(data, ["ShipID", "ShipId", "shipId"], this.ship.shipId),
          cargoCapacity: this.readNumber(data, ["CargoCapacity", "cargoCapacity"], this.ship.cargoCapacity),
          fuelCapacityMain: this.readNestedNumber(
            data,
            [["FuelCapacity", "Main"], ["FuelCapacity", "MainFuel"], ["fuelCapacity", "main"]],
            this.ship.fuelCapacityMain
          ),
          fuelCapacityReserve: this.readNestedNumber(
            data,
            [["FuelCapacity", "Reserve"], ["FuelCapacity", "ReserveFuel"], ["fuelCapacity", "reserve"]],
            this.ship.fuelCapacityReserve
          ),
          maxJumpRange: this.readNumber(data, ["MaxJumpRange", "maxJumpRange"], this.ship.maxJumpRange)
        });
        break;
      }
      case "fsdjump": {
        shipPatchApplied = updateShipFromPatch({
          lastJumpDistance: this.readNumber(data, ["JumpDist", "JumpDistance", "jumpDist"], this.ship.lastJumpDistance)
        });

        const starSystem = String(data.StarSystem ?? "").trim();
        locationPatchApplied = updateLocationFromPatch({
          starSystem: starSystem || this.location.starSystem,
          bodyName: null,
          stationName: null,
          fleetCarrier: null,
          docked: false,
          supercruise: false
        });

        if (starSystem) {
          routeUpdated = this.syncRoute(starSystem, timestamp);
        }
        break;
      }
      case "location": {
        const starSystem = String(data.StarSystem ?? "").trim();
        locationPatchApplied = updateLocationFromPatch({
          starSystem: starSystem || this.location.starSystem,
          bodyName: this.readString(data, ["Body", "BodyName"], this.location.bodyName),
          stationName: this.readString(data, ["StationName"], this.location.stationName),
          fleetCarrier: this.readString(data, ["StationType"], this.location.fleetCarrier),
          docked: this.readBoolean(data, ["Docked"], this.location.docked),
          supercruise: this.readBoolean(data, ["InSupercruise", "Supercruise"], this.location.supercruise)
        });

        if (starSystem) {
          routeUpdated = this.syncRoute(starSystem, timestamp);
        }
        break;
      }
      case "docked": {
        locationPatchApplied = updateLocationFromPatch({
          docked: true,
          stationName: this.readString(data, ["StationName"], this.location.stationName),
          fleetCarrier: this.readString(data, ["StationType"], this.location.fleetCarrier)
        });
        break;
      }
      case "undocked": {
        locationPatchApplied = updateLocationFromPatch({
          docked: false,
          stationName: null,
          fleetCarrier: null
        });
        break;
      }
      case "supercruiseentry": {
        locationPatchApplied = updateLocationFromPatch({ supercruise: true });
        break;
      }
      case "supercruiseexit": {
        locationPatchApplied = updateLocationFromPatch({ supercruise: false });
        break;
      }
      case "missionaccepted": {
        missionsUpdated = this.upsertMissionFromAccepted(data, timestamp);
        break;
      }
      case "missionredirected": {
        missionsUpdated = this.updateMissionFromRedirected(data, timestamp);
        break;
      }
      case "cargodepot": {
        missionsUpdated = this.updateMissionFromCargoDepot(data, timestamp);
        break;
      }
      case "colonisationconstructiondepot": {
        colonizationUpdated = this.updateColonizationFromConstructionDepot(data, timestamp);
        break;
      }
      case "colonisationcontribution": {
        colonizationUpdated = this.updateColonizationFromContribution(data, timestamp);
        break;
      }
      case "missioncompleted": {
        missionsUpdated = this.finishMission(data, "completed", timestamp);
        break;
      }
      case "missionfailed": {
        missionsUpdated = this.finishMission(data, "failed", timestamp);
        break;
      }
      case "missionabandoned": {
        missionsUpdated = this.finishMission(data, "abandoned", timestamp);
        break;
      }
      case "missions": {
        missionsUpdated = this.syncActiveMissionsFromList(data, timestamp);
        break;
      }
      default: {
        const starSystem = String(data.StarSystem ?? "").trim();
        if (starSystem) {
          locationPatchApplied = updateLocationFromPatch({ starSystem });
          routeUpdated = this.syncRoute(starSystem, timestamp);
        }
      }
    }

    return {
      shipUpdated: shipPatchApplied,
      locationUpdated: locationPatchApplied,
      routeUpdated,
      missionsUpdated,
      colonizationUpdated,
      ignored: false
    };
  }

  loadRoute(routeName: string, legs: RouteLeg[], timestamp: string = new Date().toISOString()): StateChangeSet {
    const safeTimestamp = normalizeTimestamp(timestamp);
    this.route = {
      routeLoaded: true,
      routeName,
      legs,
      currentIndex: null,
      nextLeg: legs[0] ?? null,
      previousLeg: null,
      routeMismatch: false,
      updatedAt: safeTimestamp
    };

    if (this.location.starSystem) {
      this.syncRoute(this.location.starSystem, safeTimestamp);
    }

    return {
      shipUpdated: false,
      locationUpdated: false,
      routeUpdated: true,
      missionsUpdated: false,
      colonizationUpdated: false,
      ignored: false
    };
  }

  private cloneMission(mission: MissionState): MissionState {
    return {
      ...mission,
      rewards: mission.rewards.map((reward) => ({ ...reward }))
    };
  }

  private readFiniteNumber(data: Record<string, unknown>, keys: string[]): number | null {
    for (const key of keys) {
      const value = data[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
    }

    return null;
  }

  private readMissionId(data: Record<string, unknown>): number | null {
    return this.readFiniteNumber(data, ["MissionID", "MissionId", "missionId"]);
  }

  private parseRewards(data: Record<string, unknown>): MissionReward[] {
    const rewards: MissionReward[] = [];
    const materialRewards = data.MaterialsReward;
    const commodityRewards = data.CommodityReward;

    if (Array.isArray(materialRewards)) {
      for (const reward of materialRewards) {
        if (!reward || typeof reward !== "object") {
          continue;
        }

        const item = reward as Record<string, unknown>;
        const name = this.readString(item, ["Name", "Name_Localised", "name"], "");
        if (!name) {
          continue;
        }

        rewards.push({
          type: "material",
          name,
          count: this.readFiniteNumber(item, ["Count", "count"])
        });
      }
    }

    if (Array.isArray(commodityRewards)) {
      for (const reward of commodityRewards) {
        if (!reward || typeof reward !== "object") {
          continue;
        }

        const item = reward as Record<string, unknown>;
        const name = this.readString(item, ["Name", "Name_Localised", "name"], "");
        if (!name) {
          continue;
        }

        rewards.push({
          type: "commodity",
          name,
          count: this.readFiniteNumber(item, ["Count", "count"])
        });
      }
    }

    return rewards;
  }

  private extractCommodityFromMissionText(
    localizedName: string | null,
    name: string | null
  ): { commodity: string | null; commodityCount: number | null } {
    const sourceText = localizedName?.trim() || name?.trim() || "";
    if (!sourceText) {
      return { commodity: null, commodityCount: null };
    }

    const normalized = sourceText.replace(/\s+/g, " ").trim();
    const patterns = [
      /(?:source and return|mine|deliver|acquire)\s+([\d,.\s]+)\s+units?\s+of\s+(.+)$/i,
      /(?:source and return|mine|deliver|acquire)\s+([\d,.\s]+)\s+(.+)$/i,
      /(?:localiza y trae|localizar y traer|entrega|entregar|compra|comprar|mina|minar)\s+([\d,.\s]+)\s+unidades?\s+de\s+(.+)$/i,
      /(?:localiza y trae|localizar y traer|entrega|entregar|compra|comprar|mina|minar)\s+([\d,.\s]+)\s+(.+)$/i
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (!match) {
        continue;
      }

      const count = Number((match[1] ?? "").replace(/[.,\s]/g, ""));
      const commodity = (match[2]?.trim() ?? "").replace(/[.!?]+$/g, "").trim();
      if (!Number.isFinite(count) || !commodity) {
        continue;
      }

      return {
        commodity,
        commodityCount: count
      };
    }

    return { commodity: null, commodityCount: null };
  }

  private extractMaxCreditsReward(data: Record<string, unknown>, fallback: number | null = null): number | null {
    const candidates: number[] = [];

    const direct = this.readFiniteNumber(data, ["Reward", "reward", "Donation"]);
    if (direct !== null) {
      candidates.push(direct);
    }

    const rewardOptions = data.Rewards;
    if (Array.isArray(rewardOptions)) {
      for (const option of rewardOptions) {
        if (!option || typeof option !== "object") {
          continue;
        }

        const item = option as Record<string, unknown>;
        const value = this.readFiniteNumber(item, ["Reward", "reward", "Credits", "credits", "Value", "value"]);
        if (value !== null) {
          candidates.push(value);
        }
      }
    }

    if (candidates.length === 0) {
      return fallback;
    }

    return candidates.reduce((max, current) => (current > max ? current : max), candidates[0]);
  }

  private upsertMissionFromAccepted(data: Record<string, unknown>, timestamp: string): boolean {
    const missionId = this.readMissionId(data);
    if (missionId === null) {
      return false;
    }

    const existing = this.missions.active.find((mission) => mission.missionId === missionId) ?? null;
    const resolvedName = this.readString(data, ["Name", "name"], existing?.name ?? null);
    const resolvedLocalizedName = this.readString(
      data,
      ["LocalisedName", "Name_Localised", "LocalizedName", "localizedName"],
      existing?.localizedName ?? null
    );
    const derivedCommodity = this.extractCommodityFromMissionText(resolvedLocalizedName, resolvedName);
    const acceptedAt = existing?.acceptedAt ?? timestamp;
    const nextMission: MissionState = {
      missionId,
      name: resolvedName,
      localizedName: resolvedLocalizedName,
      faction: this.readString(data, ["Faction", "faction"], existing?.faction ?? null),
      originSystem: this.readString(data, ["OriginSystem"], existing?.originSystem ?? this.location.starSystem),
      originStation: this.readString(data, ["OriginStation"], existing?.originStation ?? this.location.stationName),
      destinationSystem: this.readString(data, ["DestinationSystem"], existing?.destinationSystem ?? null),
      destinationStation: this.readString(data, ["DestinationStation"], existing?.destinationStation ?? null),
      targetFaction: this.readString(data, ["TargetFaction"], existing?.targetFaction ?? null),
      targetType: this.readString(
        data,
        ["TargetType_Localised", "TargetType", "targetType"],
        existing?.targetType ?? null
      ),
      commodity: this.readString(
        data,
        ["Commodity_Localised", "Commodity", "commodity"],
        existing?.commodity ?? derivedCommodity.commodity
      ),
      commodityCount: this.readNumber(
        data,
        ["Count", "CommodityCount"],
        existing?.commodityCount ?? derivedCommodity.commodityCount
      ),
      passengerCount: this.readNumber(data, ["PassengerCount"], existing?.passengerCount ?? null),
      passengerType: this.readString(
        data,
        ["PassengerType_Localised", "PassengerType"],
        existing?.passengerType ?? null
      ),
      influence: this.readString(data, ["Influence"], existing?.influence ?? null),
      reputation: this.readString(data, ["Reputation"], existing?.reputation ?? null),
      wing: this.readBoolean(data, ["Wing"], existing?.wing ?? false),
      expiry: this.readString(data, ["Expiry"], existing?.expiry ?? null),
      status: "active",
      reward: this.extractMaxCreditsReward(data, existing?.reward ?? null),
      rewards: existing?.rewards ?? [],
      updatedAt: timestamp,
      acceptedAt,
      completedAt: null,
      failedAt: null,
      abandonedAt: null
    };

    return this.upsertActiveMission(nextMission, timestamp);
  }

  private updateMissionFromRedirected(data: Record<string, unknown>, timestamp: string): boolean {
    const missionId = this.readMissionId(data);
    if (missionId === null) {
      return false;
    }

    const existing = this.missions.active.find((mission) => mission.missionId === missionId);
    if (!existing) {
      return false;
    }

    const nextMission: MissionState = {
      ...existing,
      destinationSystem: this.readString(
        data,
        ["NewDestinationSystem", "DestinationSystem"],
        existing.destinationSystem
      ),
      destinationStation: this.readString(
        data,
        ["NewDestinationStation", "DestinationStation"],
        existing.destinationStation
      ),
      updatedAt: timestamp
    };

    return this.upsertActiveMission(nextMission, timestamp);
  }

  private finishMission(
    data: Record<string, unknown>,
    status: "completed" | "failed" | "abandoned",
    timestamp: string
  ): boolean {
    const missionId = this.readMissionId(data);
    if (missionId === null) {
      return false;
    }

    const index = this.missions.active.findIndex((mission) => mission.missionId === missionId);
    const existing = index >= 0 ? this.missions.active[index] : null;
    const acceptedAt = existing?.acceptedAt ?? null;

    const finished: MissionState = {
      missionId,
      name: this.readString(data, ["Name", "name"], existing?.name ?? null),
      localizedName: this.readString(
        data,
        ["LocalisedName", "Name_Localised", "LocalizedName", "localizedName"],
        existing?.localizedName ?? null
      ),
      faction: existing?.faction ?? null,
      originSystem: existing?.originSystem ?? null,
      originStation: existing?.originStation ?? null,
      destinationSystem: this.readString(data, ["DestinationSystem"], existing?.destinationSystem ?? null),
      destinationStation: this.readString(data, ["DestinationStation"], existing?.destinationStation ?? null),
      targetFaction: existing?.targetFaction ?? null,
      targetType: existing?.targetType ?? null,
      commodity: existing?.commodity ?? null,
      commodityCount: existing?.commodityCount ?? null,
      passengerCount: existing?.passengerCount ?? null,
      passengerType: existing?.passengerType ?? null,
      influence: existing?.influence ?? null,
      reputation: existing?.reputation ?? null,
      wing: existing?.wing ?? false,
      expiry: existing?.expiry ?? null,
      status,
      reward: this.extractMaxCreditsReward(data, existing?.reward ?? null),
      rewards: this.parseRewards(data),
      updatedAt: timestamp,
      acceptedAt,
      completedAt: status === "completed" ? timestamp : null,
      failedAt: status === "failed" ? timestamp : null,
      abandonedAt: status === "abandoned" ? timestamp : null
    };

    if (index >= 0) {
      this.missions.active.splice(index, 1);
    }

    this.missions.history = [
      finished,
      ...this.missions.history.filter((mission) => mission.missionId !== missionId)
    ].slice(0, 200);
    this.missions.updatedAt = timestamp;
    return true;
  }

  private updateMissionFromCargoDepot(data: Record<string, unknown>, timestamp: string): boolean {
    const missionId = this.readMissionId(data);
    if (missionId === null) {
      return false;
    }

    const existing = this.missions.active.find((mission) => mission.missionId === missionId) ?? null;
    const totalItemsToDeliver = this.readNumber(
      data,
      ["TotalItemsToDeliver", "Count", "ItemsDelivered"],
      existing?.commodityCount ?? null
    );

    const nextMission: MissionState = {
      missionId,
      name: existing?.name ?? null,
      localizedName: existing?.localizedName ?? null,
      faction: existing?.faction ?? null,
      originSystem: existing?.originSystem ?? this.location.starSystem,
      originStation: existing?.originStation ?? this.location.stationName,
      destinationSystem: existing?.destinationSystem ?? null,
      destinationStation: existing?.destinationStation ?? null,
      targetFaction: existing?.targetFaction ?? null,
      targetType: existing?.targetType ?? null,
      commodity: this.readString(
        data,
        ["CargoType_Localised", "CargoType", "Commodity_Localised", "Commodity"],
        existing?.commodity ?? null
      ),
      commodityCount: totalItemsToDeliver,
      passengerCount: existing?.passengerCount ?? null,
      passengerType: existing?.passengerType ?? null,
      influence: existing?.influence ?? null,
      reputation: existing?.reputation ?? null,
      wing: existing?.wing ?? false,
      expiry: existing?.expiry ?? null,
      status: "active",
      reward: existing?.reward ?? null,
      rewards: existing?.rewards ?? [],
      updatedAt: timestamp,
      acceptedAt: existing?.acceptedAt ?? null,
      completedAt: null,
      failedAt: null,
      abandonedAt: null
    };

    return this.upsertActiveMission(nextMission, timestamp);
  }

  private readColonizationNeeds(data: Record<string, unknown>): ColonizationCommodityNeed[] {
    const rawResources = data.ResourcesRequired;
    if (!Array.isArray(rawResources)) {
      return [];
    }

    return rawResources
      .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
      .map((entry) => {
        const requiredAmount = this.readNumber(entry, ["RequiredAmount"], null);
        const providedAmount = this.readNumber(entry, ["ProvidedAmount"], null);
        const remainingAmount = requiredAmount !== null
          ? Math.max(0, requiredAmount - (providedAmount ?? 0))
          : null;

        return {
          name: this.readString(entry, ["Name_Localised", "Name"], "Unknown") ?? "Unknown",
          requiredAmount,
          providedAmount,
          remainingAmount,
          payment: this.readNumber(entry, ["Payment"], null)
        };
      });
  }

  private updateColonizationFromConstructionDepot(data: Record<string, unknown>, timestamp: string): boolean {
    const next: ColonizationState = {
      ...this.colonization,
      isColonizing: !this.readBoolean(data, ["ConstructionComplete"], false)
        && !this.readBoolean(data, ["ConstructionFailed"], false),
      systemName: this.location.starSystem ?? this.colonization.systemName,
      marketId: this.readNumber(data, ["MarketID"], this.colonization.marketId),
      constructionProgress: this.readNumber(data, ["ConstructionProgress"], this.colonization.constructionProgress),
      constructionComplete: this.readBoolean(data, ["ConstructionComplete"], this.colonization.constructionComplete),
      constructionFailed: this.readBoolean(data, ["ConstructionFailed"], this.colonization.constructionFailed),
      requiredCommodities: this.readColonizationNeeds(data),
      updatedAt: timestamp
    };

    const changed = JSON.stringify(next) !== JSON.stringify(this.colonization);
    if (changed) {
      this.colonization = next;
    }

    return changed;
  }

  private updateColonizationFromContribution(data: Record<string, unknown>, timestamp: string): boolean {
    if (!this.colonization.isColonizing || this.colonization.requiredCommodities.length === 0) {
      return false;
    }

    const contributionsRaw = data.Contributions;
    if (!Array.isArray(contributionsRaw)) {
      return false;
    }

    const nextNeeds = this.colonization.requiredCommodities.map((item) => ({ ...item }));
    for (const entry of contributionsRaw) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const raw = entry as Record<string, unknown>;
      const name = this.readString(raw, ["Name_Localised", "Name"], null);
      const amount = this.readNumber(raw, ["Amount"], null);
      if (!name || amount === null || amount <= 0) {
        continue;
      }

      const target = nextNeeds.find(
        (need) => need.name.toLowerCase() === name.toLowerCase()
      );
      if (!target) {
        continue;
      }

      const provided = (target.providedAmount ?? 0) + amount;
      target.providedAmount = provided;
      target.remainingAmount = target.requiredAmount !== null
        ? Math.max(0, target.requiredAmount - provided)
        : target.remainingAmount;
    }

    const next: ColonizationState = {
      ...this.colonization,
      requiredCommodities: nextNeeds,
      updatedAt: timestamp
    };

    const changed = JSON.stringify(next) !== JSON.stringify(this.colonization);
    if (changed) {
      this.colonization = next;
    }

    return changed;
  }

  private syncActiveMissionsFromList(data: Record<string, unknown>, timestamp: string): boolean {
    const activeRaw = data.Active;
    if (!Array.isArray(activeRaw)) {
      return false;
    }

    const missionRows = activeRaw
      .map((entry): Record<string, unknown> | null => {
        if (typeof entry === "number" && Number.isFinite(entry)) {
          return { MissionID: entry };
        }

        if (entry && typeof entry === "object") {
          return entry as Record<string, unknown>;
        }

        return null;
      })
      .filter((entry): entry is Record<string, unknown> => entry !== null);

    const activeIds = missionRows
      .map((entry) => this.readMissionId(entry))
      .filter((missionId): missionId is number => missionId !== null);
    const activeSet = new Set(activeIds);
    const existingById = new Map(
      this.missions.active
        .filter((mission) => activeSet.has(mission.missionId))
        .map((mission) => [mission.missionId, mission] as const)
    );

    const nextActive: MissionState[] = [];
    for (const row of missionRows) {
      const missionId = this.readMissionId(row);
      if (missionId === null) {
        continue;
      }

      const existing = existingById.get(missionId) ?? null;
      const resolvedName = this.readString(row, ["Name", "name"], existing?.name ?? null);
      const resolvedLocalizedName = this.readString(
        row,
        ["LocalisedName", "Name_Localised", "LocalizedName", "localizedName"],
        existing?.localizedName ?? null
      );
      const derivedCommodity = this.extractCommodityFromMissionText(resolvedLocalizedName, resolvedName);
      const merged: MissionState = {
        missionId,
        name: resolvedName,
        localizedName: resolvedLocalizedName,
        faction: this.readString(row, ["Faction", "faction"], existing?.faction ?? null),
        originSystem: existing?.originSystem ?? this.location.starSystem,
        originStation: existing?.originStation ?? this.location.stationName,
        destinationSystem: this.readString(row, ["DestinationSystem"], existing?.destinationSystem ?? null),
        destinationStation: this.readString(row, ["DestinationStation"], existing?.destinationStation ?? null),
        targetFaction: this.readString(row, ["TargetFaction"], existing?.targetFaction ?? null),
        targetType: this.readString(
          row,
          ["TargetType_Localised", "TargetType", "targetType"],
          existing?.targetType ?? null
        ),
        commodity: this.readString(
          row,
          ["Commodity_Localised", "Commodity", "commodity"],
          existing?.commodity ?? derivedCommodity.commodity
        ),
        commodityCount: this.readNumber(
          row,
          ["Count", "CommodityCount"],
          existing?.commodityCount ?? derivedCommodity.commodityCount
        ),
        passengerCount: this.readNumber(row, ["PassengerCount"], existing?.passengerCount ?? null),
        passengerType: this.readString(
          row,
          ["PassengerType_Localised", "PassengerType"],
          existing?.passengerType ?? null
        ),
        influence: this.readString(row, ["Influence"], existing?.influence ?? null),
        reputation: this.readString(row, ["Reputation"], existing?.reputation ?? null),
        wing: this.readBoolean(row, ["Wing"], existing?.wing ?? false),
        expiry: this.readString(row, ["Expiry"], existing?.expiry ?? null),
        status: "active",
        reward: this.extractMaxCreditsReward(row, existing?.reward ?? null),
        rewards: existing?.rewards ?? [],
        updatedAt: timestamp,
        acceptedAt: existing?.acceptedAt ?? null,
        completedAt: null,
        failedAt: null,
        abandonedAt: null
      };

      existingById.delete(missionId);
      nextActive.push(merged);
    }

    if (JSON.stringify(nextActive) === JSON.stringify(this.missions.active)) {
      return false;
    }

    this.missions.active = nextActive;
    this.missions.updatedAt = timestamp;
    return true;
  }

  private upsertActiveMission(mission: MissionState, timestamp: string): boolean {
    const next = [...this.missions.active];
    const index = next.findIndex((existing) => existing.missionId === mission.missionId);
    if (index >= 0) {
      next[index] = mission;
    } else {
      next.unshift(mission);
    }

    const changed = JSON.stringify(next) !== JSON.stringify(this.missions.active);
    if (!changed) {
      return false;
    }

    this.missions.active = next;
    this.missions.updatedAt = timestamp;
    return true;
  }

  private syncRoute(starSystem: string, timestamp: string): boolean {
    if (!this.route.routeLoaded || this.route.legs.length === 0) {
      return false;
    }

    const normalized = normalizeSystem(starSystem);
    const matchedIndex = this.route.legs.findIndex((leg) => normalizeSystem(leg.systemName) === normalized);
    const nextRoute = { ...this.route };

    if (matchedIndex >= 0) {
      nextRoute.currentIndex = matchedIndex;
      nextRoute.previousLeg = matchedIndex > 0 ? this.route.legs[matchedIndex - 1] : null;
      nextRoute.nextLeg = matchedIndex < this.route.legs.length - 1 ? this.route.legs[matchedIndex + 1] : null;
      nextRoute.routeMismatch = false;
    } else {
      nextRoute.routeMismatch = true;
    }

    nextRoute.updatedAt = timestamp;
    const changed = JSON.stringify(nextRoute) !== JSON.stringify(this.route);
    if (changed) {
      this.route = nextRoute;
    }
    return changed;
  }

  private readString(
    data: Record<string, unknown>,
    keys: string[],
    fallback: string | null
  ): string | null {
    for (const key of keys) {
      const rawValue = data[key];
      if (typeof rawValue === "string" && rawValue.trim()) {
        return rawValue.trim();
      }
    }

    return fallback;
  }

  private readBoolean(
    data: Record<string, unknown>,
    keys: string[],
    fallback: boolean
  ): boolean {
    for (const key of keys) {
      const rawValue = data[key];
      if (typeof rawValue === "boolean") {
        return rawValue;
      }
    }

    return fallback;
  }

  private readNumber(
    data: Record<string, unknown>,
    keys: string[],
    fallback: number | null
  ): number | null {
    for (const key of keys) {
      const rawValue = data[key];
      if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
        return rawValue;
      }
    }

    return fallback;
  }

  private readNestedNumber(
    data: Record<string, unknown>,
    paths: string[][],
    fallback: number | null
  ): number | null {
    for (const path of paths) {
      let current: unknown = data;

      for (const segment of path) {
        if (!current || typeof current !== "object") {
          current = undefined;
          break;
        }

        current = (current as Record<string, unknown>)[segment];
      }

      if (typeof current === "number" && Number.isFinite(current)) {
        return current;
      }
    }

    return fallback;
  }

  private applySnapshot(snapshot: StateSnapshot): void {
    this.ship = {
      ...snapshot.ship,
      shipType: snapshot.ship.shipType ?? null,
      shipName: snapshot.ship.shipName ?? null,
      shipIdent: snapshot.ship.shipIdent ?? null,
      shipId: snapshot.ship.shipId ?? null,
      cargoCapacity: snapshot.ship.cargoCapacity ?? null,
      fuelCapacityMain: snapshot.ship.fuelCapacityMain ?? null,
      fuelCapacityReserve: snapshot.ship.fuelCapacityReserve ?? null,
      maxJumpRange: snapshot.ship.maxJumpRange ?? null,
      lastJumpDistance: snapshot.ship.lastJumpDistance ?? null,
      interpretedFlags: { ...snapshot.ship.interpretedFlags },
      fuel: { ...snapshot.ship.fuel }
    };

    this.location = { ...snapshot.location };
    this.route = {
      ...snapshot.route,
      legs: [...snapshot.route.legs],
      nextLeg: snapshot.route.nextLeg ? { ...snapshot.route.nextLeg } : null,
      previousLeg: snapshot.route.previousLeg ? { ...snapshot.route.previousLeg } : null
    };
    this.missions = {
      updatedAt: snapshot.missions?.updatedAt ?? null,
      active: (snapshot.missions?.active ?? []).map((mission) => this.cloneMission(mission)),
      history: (snapshot.missions?.history ?? []).map((mission) => this.cloneMission(mission)).slice(0, 200)
    };
    this.colonization = {
      isColonizing: snapshot.colonization?.isColonizing ?? false,
      systemName: snapshot.colonization?.systemName ?? null,
      marketId: snapshot.colonization?.marketId ?? null,
      constructionProgress: snapshot.colonization?.constructionProgress ?? null,
      constructionComplete: snapshot.colonization?.constructionComplete ?? false,
      constructionFailed: snapshot.colonization?.constructionFailed ?? false,
      requiredCommodities: (snapshot.colonization?.requiredCommodities ?? []).map((item) => ({ ...item })),
      updatedAt: snapshot.colonization?.updatedAt ?? null
    };
  }
}
