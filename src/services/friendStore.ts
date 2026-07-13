import { MissionState, StateSnapshot } from "../types/state";
import { TenantRuntime } from "../state/runtimeRegistry";

export type FriendRelationshipStatus = "none" | "pending_sent" | "pending_received" | "accepted" | "self";

export interface FriendSummary {
  tenantId: string;
  tenantLabel: string;
  keyFingerprint: string;
  lastSeenAt: string;
  activeStatus: "online" | "recent" | "inactive";
  relationshipStatus: FriendRelationshipStatus;
  ship: Pick<
    StateSnapshot["ship"],
    "shipType" | "shipName" | "shipIdent" | "fuel" | "fuelCapacityMain" | "cargo" | "hull" | "shields" | "updatedAt"
  >;
  location: Pick<
    StateSnapshot["location"],
    "starSystem" | "bodyName" | "stationName" | "docked" | "supercruise" | "updatedAt"
  >;
  missions: {
    active: MissionState[];
    updatedAt: string | null;
  };
}

export interface FriendRequestSummary {
  id: string;
  fromTenantId: string;
  fromTenantLabel: string;
  toTenantId: string;
  toTenantLabel: string;
  status: "pending" | "accepted";
  createdAt: string;
  updatedAt: string;
}

export interface FriendsDashboard {
  generatedAt: string;
  activeWindowDays: number;
  users: FriendSummary[];
  friends: FriendSummary[];
  pendingIncoming: FriendRequestSummary[];
  pendingOutgoing: FriendRequestSummary[];
}

interface FriendRequestRecord {
  id: string;
  fromTenantId: string;
  toTenantId: string;
  status: "pending" | "accepted";
  createdAt: string;
  updatedAt: string;
}

const ACTIVE_WINDOW_DAYS = 30;
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const ACTIVE_WINDOW_MS = ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

const pairKey = (leftTenantId: string, rightTenantId: string): string =>
  [leftTenantId, rightTenantId].sort().join("|");

const getRuntimeUpdatedAt = (snapshot: StateSnapshot, runtime: TenantRuntime): string => {
  return snapshot.ship.updatedAt
    ?? snapshot.location.updatedAt
    ?? snapshot.missions.updatedAt
    ?? runtime.lastSeenAt;
};

const getActiveStatus = (lastSeenAt: string, nowMs: number): FriendSummary["activeStatus"] => {
  const ageMs = nowMs - Date.parse(lastSeenAt);
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return "recent";
  }

  if (ageMs <= ONLINE_WINDOW_MS) {
    return "online";
  }

  return ageMs <= ACTIVE_WINDOW_MS ? "recent" : "inactive";
};

export class FriendStore {
  private readonly requests = new Map<string, FriendRequestRecord>();

  createRequest(fromTenantId: string, toTenantId: string): FriendRequestRecord {
    if (fromTenantId === toTenantId) {
      throw new Error("Cannot send a friend request to yourself.");
    }

    const key = pairKey(fromTenantId, toTenantId);
    const existing = this.requests.get(key);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const request: FriendRequestRecord = {
      id: key,
      fromTenantId,
      toTenantId,
      status: "pending",
      createdAt: now,
      updatedAt: now
    };

    this.requests.set(key, request);
    return request;
  }

  acceptRequest(currentTenantId: string, fromTenantId: string): FriendRequestRecord | null {
    const key = pairKey(currentTenantId, fromTenantId);
    const existing = this.requests.get(key);
    if (!existing || existing.toTenantId !== currentTenantId) {
      return null;
    }

    existing.status = "accepted";
    existing.updatedAt = new Date().toISOString();
    return existing;
  }

  buildDashboard(currentTenantId: string, runtimes: TenantRuntime[]): FriendsDashboard {
    const now = Date.now();
    const activeCutoffMs = now - ACTIVE_WINDOW_MS;
    const runtimesByTenantId = new Map(runtimes.map((runtime) => [runtime.tenantId, runtime]));
    const activeRuntimes = runtimes.filter((runtime) => {
      const snapshot = runtime.store.getSnapshot();
      const updatedAt = getRuntimeUpdatedAt(snapshot, runtime);
      return Date.parse(updatedAt) >= activeCutoffMs;
    });

    const summaries = activeRuntimes
      .map((runtime) => this.toFriendSummary(currentTenantId, runtime, now))
      .sort((left, right) => Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt));

    const requestSummaries = [...this.requests.values()]
      .filter((request) => request.fromTenantId === currentTenantId || request.toTenantId === currentTenantId)
      .map((request) => this.toRequestSummary(request, runtimesByTenantId));

    return {
      generatedAt: new Date(now).toISOString(),
      activeWindowDays: ACTIVE_WINDOW_DAYS,
      users: summaries.filter((summary) => summary.relationshipStatus !== "self"),
      friends: summaries.filter((summary) => summary.relationshipStatus === "accepted"),
      pendingIncoming: requestSummaries.filter(
        (request) => request.status === "pending" && request.toTenantId === currentTenantId
      ),
      pendingOutgoing: requestSummaries.filter(
        (request) => request.status === "pending" && request.fromTenantId === currentTenantId
      )
    };
  }

  private getRelationshipStatus(currentTenantId: string, targetTenantId: string): FriendRelationshipStatus {
    if (currentTenantId === targetTenantId) {
      return "self";
    }

    const request = this.requests.get(pairKey(currentTenantId, targetTenantId));
    if (!request) {
      return "none";
    }

    if (request.status === "accepted") {
      return "accepted";
    }

    return request.fromTenantId === currentTenantId ? "pending_sent" : "pending_received";
  }

  private toFriendSummary(currentTenantId: string, runtime: TenantRuntime, nowMs: number): FriendSummary {
    const snapshot = runtime.store.getSnapshot();
    const lastSeenAt = getRuntimeUpdatedAt(snapshot, runtime);

    return {
      tenantId: runtime.tenantId,
      tenantLabel: runtime.tenantLabel,
      keyFingerprint: runtime.keyFingerprint,
      lastSeenAt,
      activeStatus: getActiveStatus(lastSeenAt, nowMs),
      relationshipStatus: this.getRelationshipStatus(currentTenantId, runtime.tenantId),
      ship: {
        shipType: snapshot.ship.shipType,
        shipName: snapshot.ship.shipName,
        shipIdent: snapshot.ship.shipIdent,
        fuel: { ...snapshot.ship.fuel },
        fuelCapacityMain: snapshot.ship.fuelCapacityMain,
        cargo: snapshot.ship.cargo,
        hull: snapshot.ship.hull,
        shields: snapshot.ship.shields,
        updatedAt: snapshot.ship.updatedAt
      },
      location: {
        starSystem: snapshot.location.starSystem,
        bodyName: snapshot.location.bodyName,
        stationName: snapshot.location.stationName,
        docked: snapshot.location.docked,
        supercruise: snapshot.location.supercruise,
        updatedAt: snapshot.location.updatedAt
      },
      missions: {
        active: snapshot.missions.active,
        updatedAt: snapshot.missions.updatedAt
      }
    };
  }

  private toRequestSummary(
    request: FriendRequestRecord,
    runtimesByTenantId: Map<string, TenantRuntime>
  ): FriendRequestSummary {
    return {
      id: request.id,
      fromTenantId: request.fromTenantId,
      fromTenantLabel: runtimesByTenantId.get(request.fromTenantId)?.tenantLabel ?? request.fromTenantId,
      toTenantId: request.toTenantId,
      toTenantLabel: runtimesByTenantId.get(request.toTenantId)?.tenantLabel ?? request.toTenantId,
      status: request.status,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt
    };
  }
}
