/**
 * realday.js
 * Plane-of-array (POA) irradiance model using real NSRDB data + SunCalc sun position.
 *
 * For each hour, we:
 *  1. Get sun azimuth + altitude from SunCalc (using a representative UTC Date)
 *  2. Compute incidence angle between sun vector and panel normal vector
 *  3. Split GHI into beam (DNI on tilted surface) + sky diffuse + ground reflected
 *  4. Apply Faiman cell temperature + I-V corrections → DC power
 *  5. Apply inverter model → AC power
 *
 * Panel orientation convention:
 *  tiltDeg   — tilt from horizontal [0 = flat, 90 = vertical]
 *  azimuthDeg — panel facing direction, clockwise from North [180 = south]
 *
 * SunCalc azimuth convention: radians from SOUTH, clockwise.
 * We convert to degrees-from-north for consistency.
 */

import { representativeUTC } from "../core/nsrdb.js";
import { PLANT } from "../core/plant.js";
import { cellTemperature } from "./pvarray.js";
import { inverterOutput } from "./inverter.js";

const DEG = Math.PI / 180;

/**
 * Convert SunCalc azimuth (radians, from south, clockwise) to
 * degrees from north, clockwise (standard compass bearing).
 */
function sunCalcAzToCompass(azRad) {
  // SunCalc: 0 = south, π/2 = west, π = north, 3π/2 = east
  let deg = (azRad / DEG) + 180; // shift so 0 = north
  return ((deg % 360) + 360) % 360;
}

/**
 * Compute panel normal unit vector in ENU (East-North-Up) coordinates.
 *  tiltDeg   — tilt from horizontal
 *  azimuthDeg — panel face direction, degrees from north (clockwise)
 */
function panelNormal(tiltDeg, azimuthDeg) {
  const tilt = tiltDeg * DEG;
  const az   = azimuthDeg * DEG;
  // ENU: x=East, y=North, z=Up
  return {
    x:  Math.sin(tilt) * Math.sin(az),  // East component
    y:  Math.sin(tilt) * Math.cos(az),  // North component
    z:  Math.cos(tilt),                  // Up component
  };
}

/**
 * Compute sun unit vector in ENU coordinates.
 *  altDeg — solar altitude above horizon [deg]
 *  azDeg  — solar azimuth from north, clockwise [deg]
 */
function sunVector(altDeg, azDeg) {
  const alt = altDeg * DEG;
  const az  = azDeg  * DEG;
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

/**
 * Incidence angle modifier (Martin-Ruiz).
 */
function iamFactor(incDeg) {
  const ar = 0.16;
  const rad = incDeg * DEG;
  if (rad >= Math.PI / 2) return 0;
  return 1 - Math.exp(-Math.cos(rad) / ar) / (1 - Math.exp(-1 / ar));
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
export function computeHourPOA(hourData, sunPos, tiltDeg, azimuthDeg, windSpeed = 3) {
  const altDeg = sunPos.altitude / DEG;
  const azDeg  = sunCalcAzToCompass(sunPos.azimuth);

  const isBelowHorizon = altDeg <= 0;

  const normal = panelNormal(tiltDeg, azimuthDeg);
  const sun    = sunVector(Math.max(0, altDeg), azDeg);

  // cos(incidence angle) = dot product of sun and panel normal
  const cosInc = Math.max(0, dot(sun, normal));
  const incDeg = Math.acos(Math.min(1, cosInc)) / DEG;
  const iam    = iamFactor(incDeg);

  const computeTrack = (ghiVal, dniVal, dhiVal, tempVal) => {
    if (isBelowHorizon || ghiVal <= 0) {
      return { poa: 0, tCell: tempVal, grossDc_kW: 0, netDc_kW: 0, acOutput_kW: 0 };
    }

    // Beam component on tilted surface: DNI × cos(incidence)
    const poa_beam = dniVal * cosInc * iam;

    // Sky diffuse (isotropic Hay-Davies simplified)
    const tilt = tiltDeg * DEG;
    const Rb = cosInc / Math.max(0.087, Math.sin(altDeg * DEG)); // beam transposition
    const aniso = dniVal / 1367; // anisotropy index (clearness)
    const poa_sky = dhiVal * (aniso * Math.max(0, cosInc / Math.max(0.087, Math.sin(altDeg * DEG)))
                             + (1 - aniso) * (1 + Math.cos(tilt)) / 2);

    // Ground reflected
    const albedo = 0.2;
    const poa_ground = ghiVal * albedo * (1 - Math.cos(tilt)) / 2;

    const poa = Math.max(0, poa_beam + poa_sky + poa_ground);

    // Cell temperature (Faiman)
    const tCell = cellTemperature(poa, tempVal, windSpeed);

    // DC power using plant capacity and temp-corrected efficiency
    const { moduleTempCoeffPmax, dcCapacityKwp, soilingLoss, wiringLoss, mismatchLoss } = PLANT;
    const stcEff  = 1000; // W/m² STC reference
    const dcRaw   = dcCapacityKwp * (poa / stcEff) * (1 + moduleTempCoeffPmax * (tCell - 25));
    const grossDc = Math.max(0, dcRaw);
    const netDc   = grossDc * (1 - soilingLoss) * (1 - wiringLoss) * (1 - mismatchLoss);

    const { acOutput_kW } = inverterOutput(netDc);

    return { poa, tCell, grossDc_kW: grossDc, netDc_kW: netDc, acOutput_kW };
  };

  const wind = windSpeed;
  const mean = computeTrack(hourData.ghi.mean, hourData.dni.mean, hourData.dhi.mean, hourData.temp.mean);
  const min  = computeTrack(hourData.ghi.min,  hourData.dni.min,  hourData.dhi.min,  hourData.temp.max); // min irrad + max temp = worst
  const max  = computeTrack(hourData.ghi.max,  hourData.dni.max,  hourData.dhi.max,  hourData.temp.min); // max irrad + min temp = best

  return {
    hour:   hourData.hour,
    panelTilt: tiltDeg,
    panelAz: azimuthDeg,
    altDeg,
    azDeg,
    cosInc,
    incDeg,
    iam,
    isBelowHorizon,
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
export function processMonthProfile(hourlyAgg, lat, lon, month, year, timezone, panelTiltDeg, panelAzDeg, SunCalc, tracking = false) {
  const maxTilt = 60;
  return hourlyAgg.map((hourData) => {
     const utcDate = representativeUTC(month, hourData.hour, year, timezone);
    // const utcDate = new Date(Date.UTC(year, month - 1, 15, hourData.hour, 30));
    const sunPos  = SunCalc.getPosition(utcDate, lat, lon);
    if (tracking) {

      const altDeg = sunPos.altitude / DEG;
      const azDeg  = sunCalcAzToCompass(sunPos.azimuth);
      const sun    = sunVector(altDeg, azDeg);
      const trackTilt = Math.min(Math.max(-Math.atan2(sun.x, sun.z) / DEG, -maxTilt), maxTilt);
      // const sunAltDeg = sunPos.altitude / DEG - 90;
      // const trackTilt = sunAz < 180 ? Math.max(sunAltDeg, -60) : Math.min(-sunAltDeg, 60);
      return computeHourPOA(hourData, sunPos, trackTilt, 270);
    }
    return computeHourPOA(hourData, sunPos, panelTiltDeg, panelAzDeg);
  });
}

/**
 * Compute daily energy totals from an hourly profile (kWh, summing all 24 hours = 1h each).
 */
export function dailyTotals(profile) {
  let energyAc = 0, energyDc = 0, peakAc = 0, peakPoa = 0;
  let energyGhi = 0;
  for (const h of profile) {
    energyAc  += h.mean.acOutput_kW;
    energyDc  += h.mean.netDc_kW;
    peakAc     = Math.max(peakAc, h.mean.acOutput_kW);
    peakPoa    = Math.max(peakPoa, h.mean.poa);
    energyGhi += h.ghi.mean;
  }
  const pr = energyGhi > 0
    ? (energyAc / (energyGhi / 1000 * PLANT.dcCapacityKwp)) * 100
    : 0;
  return { energyAc_kWh: energyAc, energyDc_kWh: energyDc, peakAc_kW: peakAc, peakPoa_Wm2: peakPoa, pr };
}
