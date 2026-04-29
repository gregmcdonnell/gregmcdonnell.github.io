/**
 * simulation.js
 * Top-level simulation engine.
 *
 * Orchestrates the full physics pipeline:
 *   Climate → Solar geometry → PV array → Inverter → KPIs
 *
 * Exposes two main functions:
 *   simulateDay(locationKey, monthIndex) — hourly profile for one day
 *   simulateYear(locationKey)            — monthly + annual aggregates
 */

import { getClimate, MONTH_DOY, MONTH_NAMES } from "../core/climate.js";
import { PLANT, DERIVED } from "../core/plant.js";
import { hourlyProfile } from "./solar.js";
import { dailyDcProfile } from "./pvarray.js";
import { dailyAcProfile } from "./inverter.js";

/**
 * Run full hourly simulation for one representative day of a given month.
 *
 *  locationKey — key from LOCATIONS object
 *  monthIndex  — 0–11
 *
 * Returns array of 24 hourly result objects with all intermediate values.
 */
export function simulateDay(locationKey, monthIndex) {
  const climate = getClimate(locationKey);
  const month = climate.months[monthIndex];
  const doy = MONTH_DOY[monthIndex];

  const solar = hourlyProfile(
    climate.lat, doy, month.ghi,
    PLANT.tiltDeg, PLANT.azimuthDeg
  );
  const dc = dailyDcProfile(solar, month.tAmb, month.wind);
  const ac = dailyAcProfile(dc);

  return ac;
}

/**
 * Aggregate a daily AC profile into summary statistics.
 * Returns { energyAc_kWh, energyDc_kWh, peakAc_kW, totalLosses_kWh, ... }
 */
function aggregateDay(hourly) {
  let energyDc = 0, energyAc = 0, peakAc = 0, peakDc = 0;
  let soiling = 0, shading = 0, mismatch = 0, wiring = 0, clipped = 0;

  for (const h of hourly) {
    energyDc += h.netDc_kW;
    energyAc += h.acOutput_kW;
    peakAc    = Math.max(peakAc, h.acOutput_kW);
    peakDc    = Math.max(peakDc, h.netDc_kW);
    soiling  += h.soilingLoss_kW;
    shading  += h.shadingLoss_kW;
    mismatch += h.mismatchLoss_kW;
    wiring   += h.wiringLoss_kW;
    clipped  += h.clipped_kW;
  }

  // All in kWh (hourly = 1h intervals)
  return {
    energyAc_kWh: energyAc,
    energyDc_kWh: energyDc,
    peakAc_kW: peakAc,
    peakDc_kW: peakDc,
    losses: { soiling, shading, mismatch, wiring, clipped },
  };
}

/**
 * Run annual simulation for a location.
 * Simulates the representative day for each month and scales to monthly totals.
 *
 * Returns:
 *  monthly  — array of 12 monthly result objects
 *  annual   — aggregated annual totals
 *  kpis     — Performance Ratio, Capacity Factor, Specific Yield, LCOE
 */
export function simulateYear(locationKey) {
  const climate = getClimate(locationKey);
  const DAYS_PER_MONTH = [31,28,31,30,31,30,31,31,30,31,30,31];

  const monthly = [];
  const annualLosses = { soiling: 0, shading: 0, mismatch: 0, wiring: 0, clipped: 0, inverter: 0 };
  let totalAc_kWh = 0, totalDc_kWh = 0;

  for (let m = 0; m < 12; m++) {
    const hourly = simulateDay(locationKey, m);
    const day = aggregateDay(hourly);
    const days = DAYS_PER_MONTH[m];

    const monthAc  = day.energyAc_kWh * days;
    const monthDc  = day.energyDc_kWh * days;
    const monthGhi = climate.months[m].ghi * days; // kWh/m²/month

    // Inverter loss = DC in - AC out
    const invLoss = (day.energyDc_kWh - day.energyAc_kWh) * days;

    totalAc_kWh += monthAc;
    totalDc_kWh += monthDc;

    for (const k of Object.keys(day.losses)) {
      annualLosses[k] = (annualLosses[k] ?? 0) + day.losses[k] * days;
    }
    annualLosses.inverter += invLoss;

    monthly.push({
      month: m,
      name: MONTH_NAMES[m],
      energyAc_kWh: monthAc,
      energyDc_kWh: monthDc,
      ghi_kWh: monthGhi,
      tAmb: climate.months[m].tAmb,
      peakAc_kW: day.peakAc_kW,
      capacityFactor: day.peakAc_kW > 0
        ? (day.energyAc_kWh / (PLANT.acCapacityKw * 24)) * 100
        : 0,
    });
  }

  // --- KPIs ---
  const annualGhi_kWh = climate.months.reduce((s, m, i) => s + m.ghi * DAYS_PER_MONTH[i], 0);

  // Performance Ratio: AC yield / (GHI × array area × STC efficiency)
  // Simplified: PR = netAC / (POA × systemPower_STC)
  const pr = totalAc_kWh / (annualGhi_kWh * PLANT.dcCapacityKwp) * 100;

  // Capacity Factor: annual AC energy / (AC capacity × 8760h)
  const cf = (totalAc_kWh / (PLANT.acCapacityKw * 8760)) * 100;

  // Specific Yield: annual AC energy per kWp DC installed
  const specificYield = totalAc_kWh / PLANT.dcCapacityKwp;

  // LCOE: (Capital + NPV of O&M) / NPV of energy
  const capital = DERIVED.totalCapitalUsd;
  const opex = PLANT.opexUsdPerKwPerYear * PLANT.acCapacityKw;
  const r = PLANT.discountRate;
  const n = PLANT.projectLifeYears;
  const crf = (r * (1 + r) ** n) / ((1 + r) ** n - 1); // capital recovery factor
  const annualisedCapital = capital * crf;
  const degradedYearlyEnergy = totalAc_kWh *
    (1 - (1 - PLANT.degradationRatePerYear) ** (n / 2)); // midpoint degraded
  const lcoe = (annualisedCapital + opex) / Math.max(1, totalAc_kWh); // $/kWh

  // Annual revenue
  const revenue = totalAc_kWh * PLANT.electricityPriceUsdPerKwh;

  // Gross DC (pre-loss) for waterfall
  const grossDc_kWh = totalAc_kWh +
    Object.values(annualLosses).reduce((a, b) => a + b, 0);

  return {
    location: climate,
    monthly,
    annual: {
      totalAc_kWh,
      totalDc_kWh,
      grossDc_kWh,
      annualGhi_kWh,
      losses: annualLosses,
      revenue_usd: revenue,
    },
    kpis: { pr, cf, specificYield, lcoe: lcoe * 1000 }, // lcoe in $/MWh
  };
}

/**
 * Build loss waterfall data from annual simulation result.
 * Returns ordered array of { label, value_kWh, percent } for charting.
 */
export function lossWaterfall(annualResult) {
  const { annual } = annualResult;
  const gross = annual.grossDc_kWh;

  const steps = [
    { label: "Gross DC (STC)",    value: gross,                    type: "start"  },
    { label: "IAM losses",        value: annual.losses.soiling,    type: "loss"   }, // bundled with soiling for simplicity
    { label: "Soiling",           value: annual.losses.soiling,    type: "loss"   },
    { label: "Near-shading",      value: annual.losses.shading,    type: "loss"   },
    { label: "Mismatch",          value: annual.losses.mismatch,   type: "loss"   },
    { label: "DC wiring",         value: annual.losses.wiring,     type: "loss"   },
    { label: "Inverter losses",   value: annual.losses.inverter,   type: "loss"   },
    { label: "Clipping",          value: annual.losses.clipped,    type: "loss"   },
    { label: "Net AC output",     value: annual.totalAc_kWh,       type: "end"    },
  ];

  return steps.map((s) => ({
    ...s,
    percent: gross > 0 ? (s.value / gross) * 100 : 0,
  }));
}


export function yearSunTimes(location) {
  const days = Array.from(Array(365).keys());
  let date = new Date(2026, 0, 1);
  return days.map((i) => {
    date.setDate(date.getDate() + 1);
    return SunCalc.getTimes(date, location.lat, location.lon, location.altitude);
  });
}