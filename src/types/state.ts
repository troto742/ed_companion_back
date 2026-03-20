export interface FuelState {
  main: number | null;
  reserve: number | null;
}

export interface InterpretedFlags {
  docked: boolean;
  supercruise: boolean;
  landingGearDown: boolean;
  fsdCharging: boolean;
  [key: string]: boolean;
}

export interface ShipState {
  shipType: string | null;
  shipName: string | null;
  shipIdent: string | null;
  shipId: number | null;
  cargoCapacity: number | null;
  fuelCapacityMain: number | null;
  fuelCapacityReserve: number | null;
  maxJumpRange: number | null;
  lastJumpDistance: number | null;
  flags: number | null;
  interpretedFlags: InterpretedFlags;
  fuel: FuelState;
  cargo: number | null;
  hull: number | null;
  shields: number | null;
  updatedAt: string | null;
}

export interface LocationState {
  starSystem: string | null;
  bodyName: string | null;
  stationName: string | null;
  fleetCarrier: string | null;
  docked: boolean;
  supercruise: boolean;
  updatedAt: string | null;
}

export interface RouteLeg {
  systemName: string;
  distance: number | null;
  distanceRemaining: number | null;
  fuelLeft: number | null;
  fuelUsed: number | null;
  refuel: boolean;
  neutronStar: boolean;
}

export interface RouteState {
  routeLoaded: boolean;
  routeName: string | null;
  legs: RouteLeg[];
  currentIndex: number | null;
  nextLeg: RouteLeg | null;
  previousLeg: RouteLeg | null;
  routeMismatch: boolean;
  updatedAt: string | null;
}

export interface MissionReward {
  type: string;
  name: string;
  count: number | null;
}

export interface MissionState {
  missionId: number;
  name: string | null;
  localizedName: string | null;
  faction: string | null;
  originSystem: string | null;
  originStation: string | null;
  destinationSystem: string | null;
  destinationStation: string | null;
  targetFaction: string | null;
  targetType: string | null;
  commodity: string | null;
  commodityCount: number | null;
  passengerCount: number | null;
  passengerType: string | null;
  influence: string | null;
  reputation: string | null;
  wing: boolean;
  expiry: string | null;
  status: "active" | "completed" | "failed" | "abandoned";
  reward: number | null;
  rewards: MissionReward[];
  updatedAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  abandonedAt: string | null;
}

export interface MissionBoardState {
  active: MissionState[];
  history: MissionState[];
  updatedAt: string | null;
}

export interface ColonizationCommodityNeed {
  name: string;
  requiredAmount: number | null;
  providedAmount: number | null;
  remainingAmount: number | null;
  payment: number | null;
}

export interface ColonizationState {
  isColonizing: boolean;
  systemName: string | null;
  marketId: number | null;
  constructionProgress: number | null;
  constructionComplete: boolean;
  constructionFailed: boolean;
  requiredCommodities: ColonizationCommodityNeed[];
  updatedAt: string | null;
}

export interface StateSnapshot {
  ship: ShipState;
  location: LocationState;
  route: RouteState;
  missions: MissionBoardState;
  colonization: ColonizationState;
}

export interface StateChangeSet {
  shipUpdated: boolean;
  locationUpdated: boolean;
  routeUpdated: boolean;
  missionsUpdated: boolean;
  colonizationUpdated: boolean;
  ignored: boolean;
  reason?: "duplicate" | "out_of_order";
}
