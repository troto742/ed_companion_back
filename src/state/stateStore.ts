import { JournalPayload, StatusPayload } from "../types/ingest";
import { interpretStatusFlags } from "../services/flags";
import { RouteLeg, RouteState, StateChangeSet, StateSnapshot } from "../types/state";

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
      return { shipUpdated: false, locationUpdated: false, routeUpdated: false, ignored: true, reason: "out_of_order" };
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

    return { shipUpdated, locationUpdated, routeUpdated: false, ignored: false };
  }

  applyJournal(payload: JournalPayload): StateChangeSet {
    const timestamp = normalizeTimestamp(payload.timestamp);
    const data = payload.data ?? {};
    const eventType = payload.eventType;
    if (isOutOfOrder(timestamp, this.location.updatedAt)) {
      return { shipUpdated: false, locationUpdated: false, routeUpdated: false, ignored: true, reason: "out_of_order" };
    }

    const eventKey = `${timestamp}|${eventType}|${JSON.stringify(data)}`;
    if (this.seenEventKeys.has(eventKey)) {
      return { shipUpdated: false, locationUpdated: false, routeUpdated: false, ignored: true, reason: "duplicate" };
    }

    this.seenEventKeys.add(eventKey);
    this.seenEventQueue.push(eventKey);
    if (this.seenEventQueue.length > EVENT_HISTORY_LIMIT) {
      const oldest = this.seenEventQueue.shift();
      if (oldest) {
        this.seenEventKeys.delete(oldest);
      }
    }

    const event = eventType.trim().toLowerCase();
    let locationPatchApplied = false;
    let routeUpdated = false;

    const updateLocationFromPatch = (patch: Partial<StateSnapshot["location"]>): boolean => {
      const nextLocation = { ...this.location, ...patch, updatedAt: timestamp };
      const changed = JSON.stringify(nextLocation) !== JSON.stringify(this.location);
      if (changed) {
        this.location = nextLocation;
      }
      return changed;
    };

    switch (event) {
      case "fsdjump": {
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
      default: {
        const starSystem = String(data.StarSystem ?? "").trim();
        if (starSystem) {
          locationPatchApplied = updateLocationFromPatch({ starSystem });
          routeUpdated = this.syncRoute(starSystem, timestamp);
        }
      }
    }

    return {
      shipUpdated: false,
      locationUpdated: locationPatchApplied,
      routeUpdated,
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
      ignored: false
    };
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

  private applySnapshot(snapshot: StateSnapshot): void {
    this.ship = {
      ...snapshot.ship,
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
  }
}
