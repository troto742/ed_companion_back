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

export interface StateSnapshot {
  ship: ShipState;
  location: LocationState;
  route: RouteState;
}

export interface StateChangeSet {
  shipUpdated: boolean;
  locationUpdated: boolean;
  routeUpdated: boolean;
  ignored: boolean;
  reason?: "duplicate" | "out_of_order";
}
