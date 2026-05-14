/**
 * simulation.js
 * NSRDB-based simulation engine.
 *
 * All calculations now derive directly from NSRDB CSV data.
 * Uses sun position (SunCalc) and real irradiance data to compute:
 *   - Hourly POA irradiance + power output
 *   - Daily/monthly energy totals
 *   - Annual KPIs and loss waterfall
 *
 * Exposes:
 *   calculateMonthlyFromNSRDB(dataset, month, tilt, azimuth, tracking)
 *   calculateAnnualFromNSRDB(dataset, tilt, azimuth, tracking)
 *   buildLossWaterfall(annualResult)
 */

import { MONTH_NAMES } from "../core/climate.js";
import { PLANT, DERIVED } from "../core/plant.js";
import { representativeUTC } from "../core/nsrdb.js";
import { cellTemperature } from "./pvarray.js";
import { inverterOutput } from "./inverter.js";
import { computeIncidence } from "./irradiance.js";

const DEG = Math.PI / 180;
const PI2 = Math.PI * 2;

/**
 * Calculate hourly profile + daily totals for one month from NSRDB.
 *
 * @param {object} dataset      — parsed NSRDB dataset from loadNSRDB()
 * @param {number} month        — 1-12
 * @param {number} tilt         — panel tilt [deg]
 * @param {number} azimuth      — panel azimuth from north [deg]
 * @param {boolean} tracking    — enable single-axis tracking
 * @returns hourly array (each hour has mean/min/max tracks)
 */
export function calculateMonthlyFromNSRDB(dataset, month, tilt, azimuth, tracking, backtracking) {
  const agg = dataset.byMonth[month].aggregate;
  
  const year = dataset.records[0]?.["Year"] ?? 2023;
  
  const hourly = processMonthForAverageDay(
    agg, dataset.lat, dataset.lon,
    month, year, dataset.timezone,
    tilt, azimuth,
    tracking, backtracking
  );
  return hourly;
}

/**
 * Calculate annual metrics directly from NSRDB data.
 *
 * @param {object} dataset      — parsed NSRDB dataset
 * @param {number} tilt         — panel tilt [deg]
 * @param {number} azimuth      — panel azimuth from north [deg]
 * @param {boolean} tracking    — enable tracking
 * @returns { monthly[], annual, kpis }
 */
export function calculateAnnualFromNSRDB(dataset, tilt, azimuth, tracking = false, backtracking = true) {
  const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const monthly = [];
  let totalAc_kWh = 0;
  let totalDc_kWh = 0;
  let totalPoa_Wh = 0;  // Plane-of-array irradiance [Wh/m²]
  let totalGhi_Wh = 0;  // Global horizontal irradiance [Wh/m²]

  for (let m = 1; m <= 12; m++) {
    const hourly = calculateMonthlyFromNSRDB(dataset, m, tilt, azimuth, tracking, backtracking);
    const daysInMonth = DAYS_PER_MONTH[m - 1];

    // Each hour in hourly is the mean across all days in that month
    // Sum 24 hours to get daily total, then multiply by days in month
    let dayAc_kWh = 0, dayDc_kWh = 0, dayPoa_Wh = 0, dayGhi_Wh = 0;
    let peakAc_kW = 0;
    
    for (const h of hourly) {
      dayAc_kWh  += h.mean.acOutput_kW;
      dayDc_kWh  += h.mean.netDc_kW;
      dayPoa_Wh  += h.mean.poa;
      dayGhi_Wh  += h.ghi.mean;
      peakAc_kW = Math.max(peakAc_kW, h.mean.acOutput_kW);
    }

    const monthAc_kWh = dayAc_kWh * daysInMonth;
    const monthDc_kWh = dayDc_kWh * daysInMonth;
    const monthPoa_Wh = dayPoa_Wh * daysInMonth;
    const monthGhi_Wh = dayGhi_Wh * daysInMonth;

    totalAc_kWh  += monthAc_kWh;
    totalDc_kWh  += monthDc_kWh;
    totalPoa_Wh  += monthPoa_Wh;
    totalGhi_Wh  += monthGhi_Wh;

    monthly.push({
      month: m,
      name: MONTH_NAMES[m - 1],
      energyAc_kWh: monthAc_kWh,
      energyDc_kWh: monthDc_kWh,
      ghi_kWh: monthGhi_Wh / 1000,  // convert Wh to kWh
      poa_kWh: monthPoa_Wh / 1000,  // convert Wh to kWh
      peakAc_kW: peakAc_kW,
    });
  }

  // --- Annual KPIs ---
  const totalPoa_kWhm2 = totalPoa_Wh / 1000;
  const pr = totalPoa_kWhm2 > 0
    ? (totalAc_kWh / (totalPoa_kWhm2 * PLANT.dcCapacityKwp)) * 100
    : 0;

  const cf = (totalAc_kWh / (PLANT.acCapacityKw * 8760)) * 100;
  const specificYield = totalAc_kWh / PLANT.dcCapacityKwp;

  // LCOE calculation
  const capital = DERIVED.totalCapitalUsd;
  const opex = PLANT.opexUsdPerKwPerYear * PLANT.acCapacityKw;
  const r = PLANT.discountRate;
  const n = PLANT.projectLifeYears;
  const crf = (r * (1 + r) ** n) / ((1 + r) ** n - 1);
  const annualisedCapital = capital * crf;
  const lcoe = (annualisedCapital + opex) / Math.max(1, totalAc_kWh); // $/kWh

  const revenue = totalAc_kWh * PLANT.electricityPriceUsdPerKwh;

  return {
    monthly,
    annual: {
      totalAc_kWh,
      totalDc_kWh,
      totalGhi_kWh: totalGhi_Wh / 1000,
      totalPoa_kWh: totalPoa_Wh / 1000,
      revenue_usd: revenue,
    },
    kpis: { pr, cf, specificYield, lcoe: lcoe * 1000 }, // lcoe in $/MWh
  };
}

/**
 * Compute hourly POA and power metrics for one hour of real NSRDB data.
 *
 *  hourData   — { hour, ghi:{mean,min,max}, dni:{...}, dhi:{...}, temp:{...} }
 *  sunPos     — { altitude, azimuth } from SunCalc (altitude in rad, az in rad from south)
 *  tiltDeg    — panel tilt [deg]
 *  azimuthDeg — panel azimuth from north [deg]
 *  windSpeed  — [m/s], default 3
 *
 * Returns extended object with poa, tCell, dc, ac fields for mean/min/max tracks.
 */
function computeHourPOA(hourData, sunVec, panelTilt, panelAz, windSpeed = 3) {
  const isBelowHorizon = sunVec.z <= 0;

  // console.log(hourData.hour);
  const shade = shadedFraction(PLANT.panelHeight, PLANT.rowSpacing, panelTilt, panelAz, sunVec);
  // panelTilt = !isNaN(backtrack) && backtrack > 0 ? backtrack: panelTilt;
  
  const normal = panelNormal(panelTilt, panelAz);

  // cos(incidence angle) = dot product of sun and panel normal
  const cosInc = Math.max(0, dot(sunVec, normal));
  const incDeg = Math.acos(Math.min(1, cosInc)) / DEG;
  const iam    = iamFactor(cosInc);

  const computeTrack = (ghiVal, dniVal, dhiVal, tempVal) => {
    if (isBelowHorizon || ghiVal <= 0) {
      return { poa: 0, tCell: tempVal, grossDc_kW: 0, netDc_kW: 0, acOutput_kW: 0 };
    }

    const poa = computeIncidence(ghiVal, dniVal, dhiVal, cosInc, sunVec.z, panelTilt, iam);
    
    // Cell temperature (Faiman)
    const tCell = cellTemperature(poa, tempVal, windSpeed);

    // DC power using plant capacity and temp-corrected efficiency
    const { moduleTempCoeffPmax, dcCapacityKwp, soilingLoss, wiringLoss, mismatchLoss } = PLANT;
    const stcEff  = 1000; // W/m² STC reference
    const dcRaw   = dcCapacityKwp * (poa / stcEff) * (1 + moduleTempCoeffPmax * (tCell - 25));
    const grossDc = Math.max(0, dcRaw);
    const netDc   = grossDc * (1 - soilingLoss) * (1 - wiringLoss) * (1 - mismatchLoss);
    // console.log("poa: ", poa, " gross dc power: ", grossDc, " net dc power: ", netDc);
    // gross dc power is ~100% of poa power, sometimes greater. -- WRONG!!


    const { acOutput_kW } = inverterOutput(netDc);

    return { poa, tCell, grossDc_kW: grossDc, netDc_kW: netDc, acOutput_kW };
  };

  const wind = windSpeed;
  const mean = computeTrack(hourData.ghi.mean, hourData.dni.mean, hourData.dhi.mean, hourData.temp.mean);
  const min  = computeTrack(hourData.ghi.min,  hourData.dni.min,  hourData.dhi.min,  hourData.temp.max); // min irrad + max temp = worst
  const max  = computeTrack(hourData.ghi.max,  hourData.dni.max,  hourData.dhi.max,  hourData.temp.min); // max irrad + min temp = best


  return {
    hour:   hourData.hour,
    panelTilt: panelTilt,
    panelAz: panelAz,
    sunVec: sunVec,
    cosInc,
    incDeg,
    iam,
    isBelowHorizon,
    shade,
    // Raw irradiance stats (W/m²)
    ghi:  hourData.ghi,
    dni:  hourData.dni,
    dhi:  hourData.dhi,
    temp: hourData.temp,
    // Computed tracks
    mean, min, max,
  };
}
/**
 * Process a full 24-hour aggregated month profile.
 *
 *  hourlyAgg  — output of aggregateMonth() — 24-element array
 *  lat, lon   — site coordinates
 *  month      — 1-12
 *  year       — e.g. 2022
 *  timezone   — UTC offset (e.g. -7 for MST)
 *  tiltDeg    — panel tilt
 *  azimuthDeg — panel azimuth from north
 *  SunCalc    — SunCalc library object (passed in to avoid import issues)
 *
 * Returns array of 24 enriched hourly objects.
 */
export function processMonthForAverageDay(hourlyAgg, lat, lon, month, year, timezone, panelTilt, panelAz, tracking = false, backtracking = true) {
  return hourlyAgg.map((hourData) => {
     const utcDate = representativeUTC(month, hourData.hour, year, timezone);
    // const utcDate = new Date(Date.UTC(year, month - 1, 15, hourData.hour, 30));
    const sunPos  = window.SunCalc.getPosition(utcDate, lat, lon);
    const sunAlt = sunPos.altitude;
    const sunAz  = sunCalcAzToCompass(sunPos.azimuth);
    const sunVec    = sunVector(Math.max(0, sunAlt), sunAz);
    // const sunVec    = sunVector(sunAlt, sunAz);

    if (tracking) {
      panelTilt = trackingTilt(sunVec, backtracking);
      panelAz = 270 * DEG;
    }
    const hrPOA = computeHourPOA(hourData, sunVec, panelTilt, panelAz);

    hrPOA.altDeg = sunAlt / DEG;
    hrPOA.azDeg = sunAz / DEG;
    return hrPOA;
  });
}

/**
 * Compute daily energy totals from an hourly profile (kWh, summing all 24 hours = 1h each).
 */
export function dailyTotals(profile) {
  let energyAc = 0, energyDc = 0, peakAc = 0, peakPoa = 0;
  let energyGhi = 0, totalIncident = 0, theoreticalMaxEnergyDC = 0;

  // console.log(profile);
  // tcell mean min and max need looking at, I saw min greater than max for some hours
  for (const h of profile) {
    totalIncident += h.mean.poa;
    theoreticalMaxEnergyDC += h.mean.grossDc_kW;
    energyAc  += h.mean.acOutput_kW;
    energyDc  += h.mean.netDc_kW;
    peakAc     = Math.max(peakAc, h.mean.acOutput_kW);
    peakPoa    = Math.max(peakPoa, h.mean.poa);
    energyGhi += h.ghi.mean;
  }
  const pr = energyAc / theoreticalMaxEnergyDC * 100;
  return { totalIncident, energyAc_kWh: energyAc, energyDc_kWh: energyDc, peakAc_kW: peakAc, peakPoa_Wm2: peakPoa, pr };
}

export function dailyPOA(profile) {
  let energyPOA = 0;
  for (const h of profile) {
    energyPOA += h.mean.poa;
  }
  return energyPOA;
}

/**
 * Build loss waterfall from annual result (placeholder for now).
 * With real data, loss categories come from the physics models.
 */
export function buildLossWaterfall(annualResult) {
  const { annual } = annualResult;
  
  // For NSRDB-based calculations, we estimate losses from DC→AC difference
  const estimatedLosses = annual.totalDc_kWh - annual.totalAc_kWh;
  const grossDc_kWh = annual.totalDc_kWh;

  const steps = [
    { label: "Gross DC (STC)", value: grossDc_kWh, type: "start" },
    { label: "IAM / soiling", value: estimatedLosses * 0.2, type: "loss" },
    { label: "Temperature loss", value: estimatedLosses * 0.3, type: "loss" },
    { label: "Inverter losses", value: estimatedLosses * 0.5, type: "loss" },
    { label: "Net AC output", value: annual.totalAc_kWh, type: "end" },
  ];

  return steps.map((s) => ({
    ...s,
    percent: grossDc_kWh > 0 ? (s.value / grossDc_kWh) * 100 : 0,
  }));
}


export function yearSunTimes(lat, lon, elev) {
  let date = new Date(2023, 0, 1);
  return Array.from({ length: 365 }, (_, i) => {
    date.setDate(date.getDate() + 1);
    return window.SunCalc.getTimes(date, lat, lon, elev);
  });
}

/**
 * Convert SunCalc azimuth (radians, from south, clockwise) to
 * radians from north, clockwise (standard compass bearing).
 */
function sunCalcAzToCompass(azRad) {
  // SunCalc: 0 = south, π/2 = west, π = north, 3π/2 = east
  const shifted = azRad + Math.PI;
  return ((shifted % PI2) + PI2) % PI2;
}


/**
 * Compute panel normal unit vector in ENU (East-North-Up) coordinates.
 *  tilt   — tilt from horizontal
 *  az — panel face direction, degrees from north (clockwise)
 */
function panelNormal(tilt, az) {
  // ENU: x=East, y=North, z=Up
  return {
    x:  Math.sin(tilt) * Math.sin(az),  // East component
    y:  Math.sin(tilt) * Math.cos(az),  // North component
    z:  Math.cos(tilt),                  // Up component
  };
}

/**
 * Compute sun unit vector in ENU coordinates.
 *  alt — solar altitude above horizon [deg]
 *  az  — solar azimuth from north, clockwise [deg]
 */
function sunVector(alt, az) {
  return {
    x:  Math.cos(alt) * Math.sin(az),   // East
    y:  Math.cos(alt) * Math.cos(az),   // North
    z:  Math.sin(alt),                   // Up
  };
}

/**
 * Dot product of two {x,y,z} vectors.
 */
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function dot2D(a, b) { return a.x * b.x + a.y * b.y; }

/**
 * Incidence angle modifier (Martin-Ruiz).
 */
function iamFactor(cosInc) {
  const ar = 0.16;
  if (cosInc <= 0) return 0;
  return 1 - Math.exp(-cosInc / ar) / (1 - Math.exp(-1 / ar));
}


/**
 * Calculate the fraction of the panel that is shaded from bottom-up due to low sun angle
 */
function shadedFraction(W, D, panelTilt, panelAz, sunVec) {
  const tilt = Math.abs(panelTilt);
  const pAz = panelAz;
  const halfW = W / 2;

  const panelHeading = {x: Math.sin(pAz), y: Math.cos(pAz)};
  const sdotp = sunVec.x * panelHeading.x + sunVec.y * panelHeading.y;
  // slope of a sun ray projected onto the plane normal to the panel tilt axis
  const sunRaySlope = -sunVec.z / Math.abs(sdotp);

  // Geometry of the casting edge (front/top edge)
  const pY = halfW * Math.sin(tilt);     // height above pivot
  const pX = halfW * Math.cos(tilt);     // horizontal offset

  // console.log(sdotp, -Math.tan(alt), sunRaySlope, sdotp > 0);
  const panelSlope = Math.tan(tilt);
  // Eq of sun ray: y - Py = sunRaySlope * (x - Px) -> y = sunRaySlope * (x - Px) + Py
  // Eq of next panel: y - 0 = panelSlope * (x - D)
  // panelSlope * (x - D) = sunRaySlope * (x - Px) + Py
  const intersectX = (panelSlope * D - sunRaySlope * pX + pY) / (panelSlope - sunRaySlope);
  const intersectXaboutD = intersectX - D;
  const c = intersectXaboutD / Math.cos(tilt);
  const fracShaded = c / W + 0.5;
  // console.log("shaded fraction: ", fracShaded);
  return Math.max(fracShaded, 0);
}

function backtrackAngle(W, D, sunSlope) {
  const A = W / (D * -sunSlope);
  const B = W / D;
  const phi = Math.atan2(B, A);
  const backtrack = Math.asin(1 / Math.sqrt(A*A + B*B)) - phi;
  // console.log("backtrack: " + backtrack * 180 / Math.PI);
  return backtrack;
}

function trackingTilt(sunVec, backtracking = true) {
  if (sunVec.z <= 0)
    return 0;

  const maxTilt = 60 * DEG;
  const trackTilt = -Math.atan2(sunVec.x, sunVec.z);
  if (!backtracking)
    return Math.min(Math.max(trackTilt, -maxTilt), maxTilt);
  
  const panelHeading = {x: -1, y: 0};
  const sdotp = sunVec.x * panelHeading.x + sunVec.y * panelHeading.y;
  // slope of a sun ray projected onto the plane normal to the panel tilt axis
  const sunRaySlope = -sunVec.z / Math.abs(sdotp);

  const backtrack = backtrackAngle(PLANT.panelHeight, PLANT.rowSpacing, sunRaySlope);
  const finalTilt = !isNaN(backtrack) && backtrack > 0 ? backtrack * Math.sign(trackTilt) : trackTilt;
  return Math.min(Math.max(finalTilt, -maxTilt), maxTilt);
}