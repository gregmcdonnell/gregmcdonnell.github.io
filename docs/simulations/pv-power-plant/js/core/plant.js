/**
 * plant.js
 * Reference design parameters for the simulated solar power plant.
 * These represent a realistic utility-scale system (1 MWp DC).
 * Only location changes; all physical specs are fixed by the plant design.
 */

export const PLANT = {
  // --- Array ---
  dcCapacityKwp: 1000,          // DC nameplate capacity [kWp]
  modulePmaxWp: 400,            // Module rated power [Wp] (STC)
  moduleVoc: 49.8,              // Open-circuit voltage [V] at STC
  moduleIsc: 10.2,              // Short-circuit current [A] at STC
  moduleVmp: 41.2,              // Voltage at max power [V] at STC
  moduleImp: 9.71,              // Current at max power [A] at STC
  moduleTempCoeffPmax: -0.0034, // Power temp coefficient [/°C] (–0.34%/°C)
  moduleTempCoeffVoc: -0.0029,  // Voc temp coefficient [/°C]
  moduleTempCoeffIsc:  0.00045, // Isc temp coefficient [/°C]
  tiltDeg: 25,                  // Array tilt from horizontal [°]
  azimuthDeg: 180,              // Array azimuth (180 = south-facing)
  groundCoverageRatio: 0.40,    // GCR (used for self-shading estimate)

  // --- Losses (fixed, applied in waterfall) ---
  soilingLoss: 0.020,           // 2.0 % soiling
  wiringLoss: 0.015,            // 1.5 % DC wiring resistance
  mismatchLoss: 0.010,          // 1.0 % cell/module mismatch
  shadingLoss: 0.005,           // 0.5 % near-shading
  iamLoss: 0.030,               // 3.0 % incidence angle modifier
  degradationRatePerYear: 0.005,// 0.5 %/yr annual degradation

  // --- Inverter ---
  acCapacityKw: 800,            // AC inverter capacity [kW]
  // DC:AC ratio = dcCapacityKwp / acCapacityKw = 1.25
  inverterEfficiencyCurve: [
    // [loadFraction, efficiency]  — piecewise linear S-curve
    [0.00, 0.000],
    [0.02, 0.820],
    [0.05, 0.930],
    [0.10, 0.960],
    [0.20, 0.975],
    [0.30, 0.980],
    [0.50, 0.982],
    [0.75, 0.981],
    [1.00, 0.979],
    [1.25, 0.977], // overload (clipping kicks in above 1.0)
  ],

  // --- Faiman thermal model coefficients ---
  faiman_U0: 25.0,  // [W/m²/°C] constant heat loss
  faiman_U1: 6.84,  // [W/m²/°C / (m/s)] wind-driven heat loss

  // --- Economics ---
  capitalCostUsdPerKwp: 900,    // $/kWp installed
  opexUsdPerKwPerYear: 15,      // $/kW/yr O&M
  discountRate: 0.06,           // 6% WACC
  projectLifeYears: 25,
  electricityPriceUsdPerKwh: 0.065, // $/kWh PPA or wholesale
};

/** Derived convenient values */
export const DERIVED = {
  dcAcRatio: PLANT.dcCapacityKwp / PLANT.acCapacityKw,
  moduleCount: Math.round(PLANT.dcCapacityKwp * 1000 / PLANT.modulePmaxWp),
  totalCapitalUsd: PLANT.capitalCostUsdPerKwp * PLANT.dcCapacityKwp,
};
