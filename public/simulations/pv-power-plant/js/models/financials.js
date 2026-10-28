/**
 * financials.js
 * Multi-year project financial model for a PV power plant.
 *
 * Given Year-1 AC energy output from the simulation, computes:
 *   - Year-by-year energy yield (applying annual degradation)
 *   - Year-by-year revenue, O&M cost, and net cash flow
 *   - Cumulative cash flow trajectory
 *   - Summary KPIs: NPV, IRR, simple payback, 25-yr totals
 */

import { PLANT, DERIVED } from "../core/plant.js";

/**
 * Calculate full project lifetime financials.
 *
 * @param {number} annualAcEnergy_kWh — Year-1 AC energy from simulation [kWh/yr]
 * @returns {{ capex, years[], summary }}
 */
export function calculateFinancials(annualAcEnergy_kWh) {
  const {
    dcCapacityKwp,
    acCapacityKw,
    capitalCostUsdPerKwp,
    opexUsdPerKwPerYear,
    electricityPriceUsdPerKwh,
    priceEscalationRate,
    discountRate,
    projectLifeYears,
    degradationRatePerYear,
  } = PLANT;

  const capex   = capitalCostUsdPerKwp * dcCapacityKwp;
  const opex0   = opexUsdPerKwPerYear * acCapacityKw;

  // Cash-flow array: index 0 = year 0 (capex outlay, negative)
  const cashFlows = [-capex];
  const years = [];

  let cumulative   = -capex;
  let paybackYear  = null;
  let totalRevenue = 0;
  let totalEnergy  = 0;

  for (let yr = 1; yr <= projectLifeYears; yr++) {
    const energyYr  = annualAcEnergy_kWh * Math.pow(1 - degradationRatePerYear, yr - 1);
    const priceYr   = electricityPriceUsdPerKwh * Math.pow(1 + priceEscalationRate, yr - 1);
    const revenueYr = energyYr * priceYr;
    const opexYr    = opex0 * Math.pow(1 + priceEscalationRate, yr - 1);
    const cfYr      = revenueYr - opexYr;

    cumulative += cfYr;
    if (paybackYear === null && cumulative >= 0) paybackYear = yr;

    totalRevenue += revenueYr;
    totalEnergy  += energyYr;
    cashFlows.push(cfYr);

    years.push({
      year:                    yr,
      energy_MWh:              energyYr / 1000,
      revenue_usd:             revenueYr,
      opex_usd:                opexYr,
      cashFlow_usd:            cfYr,
      cumulativeCashFlow_usd:  cumulative,
    });
  }

  const npv    = cashFlows.reduce((s, cf, t) => s + cf / Math.pow(1 + discountRate, t), 0);
  const irrVal = computeIRR(cashFlows);

  return {
    capex,
    years,
    summary: {
      npv,
      irr:               irrVal,
      paybackYear,
      totalRevenue_usd:  totalRevenue,
      totalEnergy_MWh:   totalEnergy / 1000,
    },
  };
}

/**
 * Bisection IRR solver. Returns the discount rate that zeroes NPV.
 * Returns NaN if no sign change is found (project never profitable).
 */
function computeIRR(cashFlows, tol = 1e-6, maxIter = 200) {
  const npvAt = (r) => cashFlows.reduce((s, cf, t) => s + cf / Math.pow(1 + r, t), 0);
  let lo = -0.999, hi = 10.0;
  if (npvAt(lo) * npvAt(hi) > 0) return NaN;
  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    if (npvAt(mid) > 0) lo = mid; else hi = mid;
    if (hi - lo < tol) return (lo + hi) / 2;
  }
  return (lo + hi) / 2;
}
