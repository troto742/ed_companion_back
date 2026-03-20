import { FRAME_SHIFT_DRIVES, GUARDIAN_FSD_BOOSTERS, MODIFIER_ACTIONS } from "./spanshCoriolisData";

interface SpanshShipProfile {
  baseMass: number;
  fuelMultiplier: number;
  fuelPower: number;
  tankSize: number;
  reservoirSize: number;
  rangeBoost: number;
  optimalMass: number;
  maxFuelPerJump: number;
  superchargeMultiplier: number;
  injectionMultiplier: number;
}

type UnknownRecord = Record<string, any>;
type SLEFFrameShiftDriveProfile = {
  fuelmul: number;
  fuelpower: number;
  optmass: number;
  maxfuel: number;
  superchargeMultiplier?: number;
  injectionMultiplier?: number;
};

const RESERVOIR_SIZES: Record<string, number> = {
  Adder: 0.36,
  "Alliance Challenger": 0.77,
  "Alliance Chieftain": 0.77,
  "Alliance Crusader": 0.77,
  Anaconda: 1.07,
  "Asp Explorer": 0.63,
  "Asp Scout": 0.47,
  "Beluga Liner": 0.81,
  "Caspian Explorer": 1.14,
  "Diamondback Scout": 0.49,
  Dolphin: 0.5,
  Eagle: 0.34,
  "Federal Assault Ship": 0.72,
  "Federal Corvette": 1.13,
  "Federal Dropship": 0.83,
  "Federal Gunship": 0.82,
  "Fer-de-Lance": 0.67,
  Hauler: 0.25,
  "Imperial Clipper": 0.74,
  "Imperial Courier": 0.41,
  "Imperial Cutter": 1.16,
  "Imperial Eagle": 0.37,
  Keelback: 0.39,
  "Krait Mk II": 0.63,
  "Krait Phantom": 0.63,
  Mamba: 0.5,
  Mandalay: 0.5,
  Orca: 0.79,
  "Panther Clipper": 1.11,
  "Python Mk II": 0.83,
  Python: 0.83,
  Sidewinder: 0.3,
  "Type-10 Defender": 0.77,
  "Type-11 Prospector": 0.6,
  "Type-6 Transporter": 0.39,
  "Type-7 Transporter": 0.52,
  "Type-8 Transporter": 0.52,
  "Type-9 Heavy": 0.77,
  "Viper Mk IV": 0.46,
  Viper: 0.41,
  Vulture: 0.57,
};

const SLEF_FSD_OVERRIDES: Record<string, SLEFFrameShiftDriveProfile> = {
  int_hyperdrive_overcharge_size8_class1: { optmass: 2800, maxfuel: 13.6, fuelmul: 0.008, fuelpower: 2.9 },
  int_hyperdrive_overcharge_size8_class2: { optmass: 4200, maxfuel: 20.4, fuelmul: 0.012, fuelpower: 2.9 },
  int_hyperdrive_overcharge_size8_class3: { optmass: 4200, maxfuel: 20.4, fuelmul: 0.012, fuelpower: 2.9 },
  int_hyperdrive_overcharge_size8_class4: { optmass: 4200, maxfuel: 20.4, fuelmul: 0.012, fuelpower: 2.9 },
  int_hyperdrive_overcharge_size8_class5: { optmass: 4670, maxfuel: 20.7, fuelmul: 0.013, fuelpower: 2.9 },
  int_hyperdrive_overcharge_size8_class5_overchargebooster_mkii: {
    optmass: 4670,
    maxfuel: 6.8,
    fuelmul: 0.011,
    fuelpower: 2.5025,
    superchargeMultiplier: 6,
  },
};

const asArray = <T>(value: T | T[]): T[] => Array.isArray(value) ? value : [value];

const calculateReservoirSize = (shipName: string): number =>
  RESERVOIR_SIZES[shipName] ?? 0;

const parseJsonConfig = (configJson: string): UnknownRecord => {
  const parsed = JSON.parse(configJson);
  return Array.isArray(parsed) ? parsed[0] : parsed;
};

const parseCoriolis = (configStruct: UnknownRecord): SpanshShipProfile => {
  if (!configStruct.components?.standard?.frameShiftDrive) {
    throw new Error("Could not find FSD in Coriolis build.");
  }

  const fsd = configStruct.components.standard.frameShiftDrive;
  const fsdModule = FRAME_SHIFT_DRIVES.find(
    (candidate: UnknownRecord) => candidate.class === fsd.class && candidate.rating === fsd.rating
  );

  if (!fsdModule) {
    throw new Error("Could not resolve FSD module from Coriolis build.");
  }

  let optimalMass = fsdModule.optmass;
  let maxFuelPerJump = fsdModule.maxfuel;

  if (fsd.modifications?.optmass) {
    optimalMass *= 1 + fsd.modifications.optmass / 10_000;
  }

  if (fsd.blueprint?.special?.edname) {
    const special = MODIFIER_ACTIONS[String(fsd.blueprint.special.edname)];
    if (special?.optmass) {
      optimalMass *= 1 + special.optmass;
    }
    if (special?.maxfuel) {
      maxFuelPerJump *= 1 + special.maxfuel;
    }
  }

  let rangeBoost = 0;
  for (const internalModule of configStruct.components.internal ?? []) {
    if (internalModule && internalModule.group === "Guardian Frame Shift Drive Booster") {
      const booster = GUARDIAN_FSD_BOOSTERS.find(
        (candidate: UnknownRecord) =>
          candidate.class === internalModule.class && candidate.rating === internalModule.rating
      );

      if (booster) {
        rangeBoost = booster.jumpboost;
      }
    }
  }

  const reservoirSize = calculateReservoirSize(configStruct.ship);

  return {
    baseMass: configStruct.stats.unladenMass + reservoirSize,
    fuelMultiplier: fsdModule.fuelmul,
    fuelPower: fsdModule.fuelpower,
    tankSize: configStruct.stats.fuelCapacity,
    reservoirSize,
    rangeBoost,
    optimalMass,
    maxFuelPerJump,
    superchargeMultiplier: 4,
    injectionMultiplier: 2,
  };
};

const parseSlef = (configStruct: UnknownRecord): SpanshShipProfile => {
  const modules = configStruct.data?.Modules;
  if (!Array.isArray(modules)) {
    throw new Error("Could not decode SLEF ship build.");
  }

  const fsd = modules.find((module: UnknownRecord) => module.Slot?.toLowerCase() === "frameshiftdrive");
  if (!fsd) {
    throw new Error("Could not find FSD in SLEF build.");
  }

  const fsdModule = FRAME_SHIFT_DRIVES.find(
    (candidate: UnknownRecord) => candidate.symbol.toLowerCase() === String(fsd.Item).toLowerCase()
  );
  const fsdOverride = SLEF_FSD_OVERRIDES[String(fsd.Item).toLowerCase()];
  const fsdProfile: SLEFFrameShiftDriveProfile | null = fsdModule
    ? {
        fuelmul: fsdModule.fuelmul,
        fuelpower: fsdModule.fuelpower,
        optmass: fsdModule.optmass,
        maxfuel: fsdModule.maxfuel,
      }
    : fsdOverride ?? null;

  if (!fsdProfile) {
    throw new Error("Could not resolve FSD module from SLEF build.");
  }

  let optimalMass = fsdProfile.optmass;
  let maxFuelPerJump = fsdProfile.maxfuel;
  const superchargeMultiplier = fsdProfile.superchargeMultiplier ?? 4;
  const injectionMultiplier = fsdProfile.injectionMultiplier ?? 2;

  for (const modifier of fsd.Engineering?.Modifiers ?? []) {
    switch (String(modifier.Label).toLowerCase()) {
      case "fsdoptimalmass":
        optimalMass = modifier.Value;
        break;
      case "maxfuelperjump":
        maxFuelPerJump = modifier.Value;
        break;
      default:
        break;
    }
  }

  let rangeBoost = 0;
  const boosterModule = modules.find((module: UnknownRecord) =>
    typeof module.Item === "string" && /^int_guardianfsdbooster/i.test(module.Item)
  );

  if (boosterModule) {
    const booster = GUARDIAN_FSD_BOOSTERS.find(
      (candidate: UnknownRecord) =>
        candidate.symbol.toLowerCase() === String(boosterModule.Item).toLowerCase()
    );

    if (booster) {
      rangeBoost = booster.jumpboost;
    }
  }

  return {
    baseMass: configStruct.data.UnladenMass + configStruct.data.FuelCapacity.Reserve,
    fuelMultiplier: fsdProfile.fuelmul,
    fuelPower: fsdProfile.fuelpower,
    tankSize: configStruct.data.FuelCapacity.Main,
    reservoirSize: configStruct.data.FuelCapacity.Reserve,
    rangeBoost,
    optimalMass,
    maxFuelPerJump,
    superchargeMultiplier,
    injectionMultiplier,
  };
};

export const parseSpanshShipBuild = (configJson: string): SpanshShipProfile => {
  const configStruct = parseJsonConfig(configJson);

  if (configStruct.$schema === "https://coriolis.io/schemas/ship-loadout/4.json#") {
    return parseCoriolis(configStruct);
  }

  if (configStruct.header) {
    return parseSlef(configStruct);
  }

  throw new Error("Unsupported ship build format. Expected Coriolis or SLEF export.");
};
