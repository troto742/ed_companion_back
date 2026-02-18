import { InterpretedFlags } from "../types/state";

interface FlagDefinition {
  key: string;
  bit: number;
}

const flagDefinitions: FlagDefinition[] = [
  { key: "docked", bit: 1 << 0 },
  { key: "landingGearDown", bit: 1 << 2 },
  { key: "supercruise", bit: 1 << 4 },
  { key: "fsdMassLocked", bit: 1 << 16 },
  { key: "fsdCharging", bit: 1 << 17 },
  { key: "fsdCooldown", bit: 1 << 18 },
  { key: "shieldsUp", bit: 1 << 3 },
  { key: "flightAssistOff", bit: 1 << 5 },
  { key: "hardpointsDeployed", bit: 1 << 6 },
  { key: "lightsOn", bit: 1 << 8 },
  { key: "cargoScoopDeployed", bit: 1 << 9 },
  { key: "silentRunning", bit: 1 << 10 },
  { key: "scoopingFuel", bit: 1 << 11 },
  { key: "lowFuel", bit: 1 << 19 }
];

export const interpretStatusFlags = (flags: number | null | undefined): InterpretedFlags => {
  const numericFlags = typeof flags === "number" ? flags : 0;
  const interpreted: InterpretedFlags = {
    docked: false,
    supercruise: false,
    landingGearDown: false,
    fsdCharging: false
  };

  for (const definition of flagDefinitions) {
    interpreted[definition.key] = (numericFlags & definition.bit) === definition.bit;
  }

  return interpreted;
};
