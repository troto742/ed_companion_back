export interface CoriolisFrameShiftDriveData {
  class: number;
  rating: string;
  symbol: string;
  fuelmul: number;
  fuelpower: number;
  maxfuel: number;
  optmass: number;
}

export interface CoriolisGuardianBoosterData {
  class: number;
  symbol: string;
  jumpboost: number;
}

export interface CoriolisModifierActionData {
  optmass?: number;
  maxfuel?: number;
}

export const FRAME_SHIFT_DRIVES: CoriolisFrameShiftDriveData[] = [
  {
    "class": 7,
    "rating": "E",
    "symbol": "Int_Hyperdrive_Size7_Class1",
    "fuelmul": 0.011,
    "fuelpower": 2.75,
    "maxfuel": 8.5,
    "optmass": 1440
  },
  {
    "class": 7,
    "rating": "D",
    "symbol": "Int_Hyperdrive_Size7_Class2",
    "fuelmul": 0.01,
    "fuelpower": 2.75,
    "maxfuel": 8.5,
    "optmass": 1620
  },
  {
    "class": 7,
    "rating": "C",
    "symbol": "Int_Hyperdrive_Size7_Class3",
    "fuelmul": 0.008,
    "fuelpower": 2.75,
    "maxfuel": 8.5,
    "optmass": 1800
  },
  {
    "class": 7,
    "rating": "B",
    "symbol": "Int_Hyperdrive_Size7_Class4",
    "fuelmul": 0.01,
    "fuelpower": 2.75,
    "maxfuel": 10.6,
    "optmass": 2250
  },
  {
    "class": 7,
    "rating": "A",
    "symbol": "Int_Hyperdrive_Size7_Class5",
    "fuelmul": 0.012,
    "fuelpower": 2.75,
    "maxfuel": 12.8,
    "optmass": 2700
  },
  {
    "class": 6,
    "rating": "E",
    "symbol": "Int_Hyperdrive_Size6_Class1",
    "fuelmul": 0.011,
    "fuelpower": 2.6,
    "maxfuel": 5.3,
    "optmass": 960
  },
  {
    "class": 6,
    "rating": "D",
    "symbol": "Int_Hyperdrive_Size6_Class2",
    "fuelmul": 0.01,
    "fuelpower": 2.6,
    "maxfuel": 5.3,
    "optmass": 1080
  },
  {
    "class": 6,
    "rating": "C",
    "symbol": "Int_Hyperdrive_Size6_Class3",
    "fuelmul": 0.008,
    "fuelpower": 2.6,
    "maxfuel": 5.3,
    "optmass": 1200
  },
  {
    "class": 6,
    "rating": "B",
    "symbol": "Int_Hyperdrive_Size6_Class4",
    "fuelmul": 0.01,
    "fuelpower": 2.6,
    "maxfuel": 6.6,
    "optmass": 1500
  },
  {
    "class": 6,
    "rating": "A",
    "symbol": "Int_Hyperdrive_Size6_Class5",
    "fuelmul": 0.012,
    "fuelpower": 2.6,
    "maxfuel": 8,
    "optmass": 1800
  },
  {
    "class": 5,
    "rating": "E",
    "symbol": "Int_Hyperdrive_Size5_Class1",
    "fuelmul": 0.011,
    "fuelpower": 2.45,
    "maxfuel": 3.3,
    "optmass": 560
  },
  {
    "class": 5,
    "rating": "D",
    "symbol": "Int_Hyperdrive_Size5_Class2",
    "fuelmul": 0.01,
    "fuelpower": 2.45,
    "maxfuel": 3.3,
    "optmass": 630
  },
  {
    "class": 5,
    "rating": "C",
    "symbol": "Int_Hyperdrive_Size5_Class3",
    "fuelmul": 0.008,
    "fuelpower": 2.45,
    "maxfuel": 3.3,
    "optmass": 700
  },
  {
    "class": 5,
    "rating": "B",
    "symbol": "Int_Hyperdrive_Size5_Class4",
    "fuelmul": 0.01,
    "fuelpower": 2.45,
    "maxfuel": 4.1,
    "optmass": 875
  },
  {
    "class": 5,
    "rating": "A",
    "symbol": "Int_Hyperdrive_Size5_Class5",
    "fuelmul": 0.012,
    "fuelpower": 2.45,
    "maxfuel": 5,
    "optmass": 1050
  },
  {
    "class": 5,
    "rating": "A",
    "symbol": "Int_Hyperdrive_Size5_Class5",
    "fuelmul": 0.012,
    "fuelpower": 2.45,
    "maxfuel": 5,
    "optmass": 1050
  },
  {
    "class": 4,
    "rating": "E",
    "symbol": "Int_Hyperdrive_Size4_Class1",
    "fuelmul": 0.011,
    "fuelpower": 2.3,
    "maxfuel": 2,
    "optmass": 280
  },
  {
    "class": 4,
    "rating": "D",
    "symbol": "Int_Hyperdrive_Size4_Class2",
    "fuelmul": 0.01,
    "fuelpower": 2.3,
    "maxfuel": 2,
    "optmass": 315
  },
  {
    "class": 4,
    "rating": "C",
    "symbol": "Int_Hyperdrive_Size4_Class3",
    "fuelmul": 0.008,
    "fuelpower": 2.3,
    "maxfuel": 2,
    "optmass": 350
  },
  {
    "class": 4,
    "rating": "B",
    "symbol": "Int_Hyperdrive_Size4_Class4",
    "fuelmul": 0.01,
    "fuelpower": 2.3,
    "maxfuel": 2.5,
    "optmass": 437.5
  },
  {
    "class": 4,
    "rating": "A",
    "symbol": "Int_Hyperdrive_Size4_Class5",
    "fuelmul": 0.012,
    "fuelpower": 2.3,
    "maxfuel": 3,
    "optmass": 525
  },
  {
    "class": 3,
    "rating": "E",
    "symbol": "Int_Hyperdrive_Size3_Class1",
    "fuelmul": 0.011,
    "fuelpower": 2.15,
    "maxfuel": 1.2,
    "optmass": 80
  },
  {
    "class": 3,
    "rating": "D",
    "symbol": "Int_Hyperdrive_Size3_Class2",
    "fuelmul": 0.01,
    "fuelpower": 2.15,
    "maxfuel": 1.2,
    "optmass": 90
  },
  {
    "class": 3,
    "rating": "C",
    "symbol": "Int_Hyperdrive_Size3_Class3",
    "fuelmul": 0.008,
    "fuelpower": 2.15,
    "maxfuel": 1.2,
    "optmass": 100
  },
  {
    "class": 3,
    "rating": "B",
    "symbol": "Int_Hyperdrive_Size3_Class4",
    "fuelmul": 0.01,
    "fuelpower": 2.15,
    "maxfuel": 1.5,
    "optmass": 125
  },
  {
    "class": 3,
    "rating": "A",
    "symbol": "Int_Hyperdrive_Size3_Class5",
    "fuelmul": 0.012,
    "fuelpower": 2.15,
    "maxfuel": 1.8,
    "optmass": 150
  },
  {
    "class": 2,
    "rating": "E",
    "symbol": "Int_Hyperdrive_Size2_Class1",
    "fuelmul": 0.011,
    "fuelpower": 2,
    "maxfuel": 0.6,
    "optmass": 48
  },
  {
    "class": 2,
    "rating": "D",
    "symbol": "Int_Hyperdrive_Size2_Class2",
    "fuelmul": 0.01,
    "fuelpower": 2,
    "maxfuel": 0.6,
    "optmass": 54
  },
  {
    "class": 2,
    "rating": "C",
    "symbol": "Int_Hyperdrive_Size2_Class3",
    "fuelmul": 0.008,
    "fuelpower": 2,
    "maxfuel": 0.6,
    "optmass": 60
  },
  {
    "class": 2,
    "rating": "B",
    "symbol": "Int_Hyperdrive_Size2_Class4",
    "fuelmul": 0.01,
    "fuelpower": 2,
    "maxfuel": 0.8,
    "optmass": 75
  },
  {
    "class": 2,
    "rating": "A",
    "symbol": "Int_Hyperdrive_Size2_Class5",
    "fuelmul": 0.012,
    "fuelpower": 2,
    "maxfuel": 0.9,
    "optmass": 90
  },
  {
    "class": 8,
    "rating": "A",
    "symbol": "Int_Hyperdrive_Overcharge_Size8_Class5_Overchargebooster_MkII",
    "fuelmul": 0.011,
    "fuelpower": 2.5025,
    "maxfuel": 6.8,
    "optmass": 4670
  },
  {
    "class": 8,
    "rating": "A",
    "symbol": "Int_Hyperdrive_Overcharge_Size8_Class5",
    "fuelmul": 0.013,
    "fuelpower": 2.9,
    "maxfuel": 20.7,
    "optmass": 4670
  },
  {
    "class": 8,
    "rating": "B",
    "symbol": "Int_Hyperdrive_Overcharge_Size8_Class4",
    "fuelmul": 0.012,
    "fuelpower": 2.9,
    "maxfuel": 20.4,
    "optmass": 4200
  },
  {
    "class": 8,
    "rating": "C",
    "symbol": "Int_Hyperdrive_Overcharge_Size8_Class3",
    "fuelmul": 0.012,
    "fuelpower": 2.9,
    "maxfuel": 20.4,
    "optmass": 4200
  },
  {
    "class": 8,
    "rating": "D",
    "symbol": "Int_Hyperdrive_Overcharge_Size8_Class2",
    "fuelmul": 0.012,
    "fuelpower": 2.9,
    "maxfuel": 20.4,
    "optmass": 4200
  },
  {
    "class": 8,
    "rating": "E",
    "symbol": "Int_Hyperdrive_Overcharge_Size8_Class1",
    "fuelmul": 0.008,
    "fuelpower": 2.9,
    "maxfuel": 13.6,
    "optmass": 2800
  },
  {
    "class": 7,
    "rating": "A",
    "symbol": "Int_Hyperdrive_Overcharge_Size7_Class5",
    "fuelmul": 0.013,
    "fuelpower": 2.75,
    "maxfuel": 13.1,
    "optmass": 3000
  },
  {
    "class": 7,
    "rating": "B",
    "symbol": "Int_Hyperdrive_Overcharge_Size7_Class4",
    "fuelmul": 0.012,
    "fuelpower": 2.75,
    "maxfuel": 12.8,
    "optmass": 2700
  },
  {
    "class": 7,
    "rating": "C",
    "symbol": "Int_Hyperdrive_Overcharge_Size7_Class3",
    "fuelmul": 0.012,
    "fuelpower": 2.75,
    "maxfuel": 12.8,
    "optmass": 2700
  },
  {
    "class": 7,
    "rating": "D",
    "symbol": "Int_Hyperdrive_Overcharge_Size7_Class2",
    "fuelmul": 0.012,
    "fuelpower": 2.75,
    "maxfuel": 12.8,
    "optmass": 2700
  },
  {
    "class": 7,
    "rating": "E",
    "symbol": "Int_Hyperdrive_Overcharge_Size7_Class1",
    "fuelmul": 0.008,
    "fuelpower": 2.75,
    "maxfuel": 8.5,
    "optmass": 1800
  },
  {
    "class": 7,
    "rating": "A",
    "symbol": "Int_Hyperdrive_Overcharge_Size7_Class5",
    "fuelmul": 0.013,
    "fuelpower": 2.75,
    "maxfuel": 13.1,
    "optmass": 3000
  },
  {
    "class": 6,
    "rating": "A",
    "symbol": "Int_Hyperdrive_Overcharge_Size6_Class5",
    "fuelmul": 0.013,
    "fuelpower": 2.6,
    "maxfuel": 8.3,
    "optmass": 2000
  },
  {
    "class": 6,
    "rating": "B",
    "symbol": "Int_Hyperdrive_Overcharge_Size6_Class4",
    "fuelmul": 0.012,
    "fuelpower": 2.6,
    "maxfuel": 8,
    "optmass": 1800
  },
  {
    "class": 6,
    "rating": "C",
    "symbol": "Int_Hyperdrive_Overcharge_Size6_Class3",
    "fuelmul": 0.012,
    "fuelpower": 2.6,
    "maxfuel": 8,
    "optmass": 1800
  },
  {
    "class": 6,
    "rating": "D",
    "symbol": "Int_Hyperdrive_Overcharge_Size6_Class2",
    "fuelmul": 0.012,
    "fuelpower": 2.6,
    "maxfuel": 8,
    "optmass": 1800
  },
  {
    "class": 6,
    "rating": "E",
    "symbol": "Int_Hyperdrive_Overcharge_Size6_Class1",
    "fuelmul": 0.008,
    "fuelpower": 2.6,
    "maxfuel": 5.3,
    "optmass": 1200
  },
  {
    "class": 6,
    "rating": "A",
    "symbol": "Int_Hyperdrive_Overcharge_Size6_Class5",
    "fuelmul": 0.013,
    "fuelpower": 2.6,
    "maxfuel": 8.3,
    "optmass": 2000
  },
  {
    "class": 5,
    "rating": "A",
    "symbol": "Int_Hyperdrive_Overcharge_Size5_Class5",
    "fuelmul": 0.013,
    "fuelpower": 2.45,
    "maxfuel": 5.2,
    "optmass": 1175
  },
  {
    "class": 5,
    "rating": "B",
    "symbol": "Int_Hyperdrive_Overcharge_Size5_Class4",
    "fuelmul": 0.012,
    "fuelpower": 2.45,
    "maxfuel": 5,
    "optmass": 1050
  },
  {
    "class": 5,
    "rating": "C",
    "symbol": "Int_Hyperdrive_Overcharge_Size5_Class3",
    "fuelmul": 0.012,
    "fuelpower": 2.45,
    "maxfuel": 5,
    "optmass": 1050
  },
  {
    "class": 5,
    "rating": "D",
    "symbol": "Int_Hyperdrive_Overcharge_Size5_Class2",
    "fuelmul": 0.012,
    "fuelpower": 2.45,
    "maxfuel": 5,
    "optmass": 1050
  },
  {
    "class": 5,
    "rating": "E",
    "symbol": "Int_Hyperdrive_Overcharge_Size5_Class1",
    "fuelmul": 0.008,
    "fuelpower": 2.45,
    "maxfuel": 3.3,
    "optmass": 700
  },
  {
    "class": 5,
    "rating": "A",
    "symbol": "Int_Hyperdrive_Overcharge_Size5_Class5",
    "fuelmul": 0.012,
    "fuelpower": 2.45,
    "maxfuel": 5.2,
    "optmass": 1175
  },
  {
    "class": 4,
    "rating": "A",
    "symbol": "Int_Hyperdrive_Overcharge_Size4_Class5",
    "fuelmul": 0.013,
    "fuelpower": 2.3,
    "maxfuel": 3.2,
    "optmass": 585
  },
  {
    "class": 4,
    "rating": "B",
    "symbol": "Int_Hyperdrive_Overcharge_Size4_Class4",
    "fuelmul": 0.012,
    "fuelpower": 2.3,
    "maxfuel": 3,
    "optmass": 525
  },
  {
    "class": 4,
    "rating": "C",
    "symbol": "Int_Hyperdrive_Overcharge_Size4_Class3",
    "fuelmul": 0.012,
    "fuelpower": 2.3,
    "maxfuel": 3,
    "optmass": 525
  },
  {
    "class": 4,
    "rating": "D",
    "symbol": "Int_Hyperdrive_Overcharge_Size4_Class2",
    "fuelmul": 0.012,
    "fuelpower": 2.3,
    "maxfuel": 3,
    "optmass": 525
  },
  {
    "class": 4,
    "rating": "E",
    "symbol": "Int_Hyperdrive_Overcharge_Size4_Class1",
    "fuelmul": 0.008,
    "fuelpower": 2.3,
    "maxfuel": 2,
    "optmass": 350
  },
  {
    "class": 4,
    "rating": "A",
    "symbol": "Int_Hyperdrive_Overcharge_Size4_Class5",
    "fuelmul": 0.013,
    "fuelpower": 2.3,
    "maxfuel": 3.2,
    "optmass": 585
  },
  {
    "class": 3,
    "rating": "A",
    "symbol": "Int_Hyperdrive_Overcharge_Size3_Class5",
    "fuelmul": 0.013,
    "fuelpower": 2.15,
    "maxfuel": 1.9,
    "optmass": 167
  },
  {
    "class": 3,
    "rating": "B",
    "symbol": "Int_Hyperdrive_Overcharge_Size3_Class4",
    "fuelmul": 0.012,
    "fuelpower": 2.15,
    "maxfuel": 1.8,
    "optmass": 150
  },
  {
    "class": 3,
    "rating": "C",
    "symbol": "Int_Hyperdrive_Overcharge_Size3_Class3",
    "fuelmul": 0.012,
    "fuelpower": 2.15,
    "maxfuel": 1.8,
    "optmass": 150
  },
  {
    "class": 3,
    "rating": "D",
    "symbol": "Int_Hyperdrive_Overcharge_Size3_Class2",
    "fuelmul": 0.012,
    "fuelpower": 2.15,
    "maxfuel": 1.8,
    "optmass": 150
  },
  {
    "class": 3,
    "rating": "E",
    "symbol": "Int_Hyperdrive_Overcharge_Size3_Class1",
    "fuelmul": 0.008,
    "fuelpower": 2.15,
    "maxfuel": 1.2,
    "optmass": 100
  },
  {
    "class": 3,
    "rating": "A",
    "symbol": "Int_Hyperdrive_Overcharge_Size3_Class5",
    "fuelmul": 0.013,
    "fuelpower": 2.15,
    "maxfuel": 1.9,
    "optmass": 167
  },
  {
    "class": 2,
    "rating": "A",
    "symbol": "Int_Hyperdrive_Overcharge_Size2_Class5",
    "fuelmul": 0.013,
    "fuelpower": 2.0,
    "maxfuel": 1,
    "optmass": 100
  },
  {
    "class": 2,
    "rating": "B",
    "symbol": "Int_Hyperdrive_Overcharge_Size2_Class4",
    "fuelmul": 0.012,
    "fuelpower": 2.0,
    "maxfuel": 0.9,
    "optmass": 90
  },
  {
    "class": 2,
    "rating": "C",
    "symbol": "Int_Hyperdrive_Overcharge_Size2_Class3",
    "fuelmul": 0.012,
    "fuelpower": 2.0,
    "maxfuel": 0.9,
    "optmass": 90
  },
  {
    "class": 2,
    "rating": "D",
    "symbol": "Int_Hyperdrive_Overcharge_Size2_Class2",
    "fuelmul": 0.012,
    "fuelpower": 2.0,
    "maxfuel": 0.9,
    "optmass": 90
  },
  {
    "class": 2,
    "rating": "E",
    "symbol": "Int_Hyperdrive_Overcharge_Size2_Class1",
    "fuelmul": 0.008,
    "fuelpower": 2.0,
    "maxfuel": 0.6,
    "optmass": 60
  },
  {
    "class": 2,
    "rating": "A",
    "symbol": "Int_Hyperdrive_Overcharge_Size2_Class5",
    "fuelmul": 0.013,
    "fuelpower": 2.0,
    "maxfuel": 1,
    "optmass": 100
  },
  {
    "class": 0,
    "rating": "Z",
    "symbol": "Int_Missing_Hyperdrive",
    "fuelmul": 0,
    "fuelpower": 0,
    "maxfuel": 0,
    "optmass": 0
  }
] as CoriolisFrameShiftDriveData[];

export const GUARDIAN_FSD_BOOSTERS: CoriolisGuardianBoosterData[] = [
  {
    "class": 1,
    "symbol": "Int_GuardianFSDBooster_Size1",
    "jumpboost": 4
  },
  {
    "class": 2,
    "symbol": "Int_GuardianFSDBooster_Size2",
    "jumpboost": 6
  },
  {
    "class": 3,
    "symbol": "Int_GuardianFSDBooster_Size3",
    "jumpboost": 7.75
  },
  {
    "class": 4,
    "symbol": "Int_GuardianFSDBooster_Size4",
    "jumpboost": 9.25
  },
  {
    "class": 5,
    "symbol": "Int_GuardianFSDBooster_Size5",
    "jumpboost": 10.5
  }
] as CoriolisGuardianBoosterData[];

export const MODIFIER_ACTIONS: Record<string, CoriolisModifierActionData> = {
  "OutfittingFieldType_EngineOptimalMass": {
    "optmass": 1
  },
  "OutfittingFieldType_FSDMaxFuelPerJump": {
    "maxfuel": 1
  },
  "OutfittingFieldType_FSDOptimalMass": {
    "optmass": 1
  },
  "OutfittingFieldType_ShieldGenOptimalMass": {
    "optmass": 1
  },
  "special_engine_haulage": {
    "optmass": 0.1
  },
  "special_fsd_fuelcapacity": {
    "power": 0.05,
    "maxfuel": 0.1
  },
  "special_fsd_heavy": {
    "integrity": -0.08,
    "optmass": 0.04
  },
  "trade_fsd_fuel_per_jump_fsd_heat": {
    "maxfuel": 0.5,
    "thermload": 1
  },
  "trade_passive_power_engine_curve": {
    "optmass": -0.66,
    "power": -1
  },
  "trade_shield_curve_shield_curve_mult": {
    "optmass": -1,
    "optmul": -0.8
  }
} as Record<string, CoriolisModifierActionData>;
