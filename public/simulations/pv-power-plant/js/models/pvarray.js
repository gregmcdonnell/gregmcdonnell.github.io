/**
 * pvarray.js
 * Photovoltaic array model.
 *
 * 1. Cell temperature — Faiman (2008) model
 * 2. Irradiance-corrected I-V curve parameters
 * 3. Maximum power point (MPP) DC output
 * 4. Loss application (soiling, wiring, mismatch)
 */

import { PLANT } from "../core/plant.js";

/**
 * Cell temperature [°C] using Faiman (2008) model.
 *   T_cell = T_amb + POA / (U0 + U1 × wind)
 *
 *  poa   — plane-of-array irradiance [W/m²]
 *  tAmb  — ambient temperature [°C]
 *  wind  — wind speed [m/s]
 */
export function cellTemperature(poa, tAmb, wind) {
  const { faiman_U0, faiman_U1 } = PLANT;
  if (poa <= 0) return tAmb;
  return tAmb + poa / (faiman_U0 + faiman_U1 * wind);
}

/**
 * Correct STC I-V parameters for actual irradiance and cell temperature.
 * Uses single-diode approximations for Isc, Voc, Vmp, Imp.
 *
 *  poa   — POA irradiance [W/m²]
 *  tCell — cell temperature [°C]
 * Returns { Isc, Voc, Imp, Vmp, Pmp } per module [A, V, W]
 */
export function ivParameters(poa, tCell) {
  const {
    moduleIsc, moduleVoc, moduleImp, moduleVmp, modulePmaxWp,
    moduleTempCoeffPmax, moduleTempCoeffVoc, moduleTempCoeffIsc,
  } = PLANT;

  const STC_IRRAD = 1000; // W/m²
  const STC_TEMP  = 25;   // °C
  const ΔT = tCell - STC_TEMP;
  const irradRatio = Math.max(0, poa / STC_IRRAD);

  // Isc scales linearly with irradiance, small positive temp coefficient
  const Isc = moduleIsc * irradRatio * (1 + moduleTempCoeffIsc * ΔT);

  // Voc: logarithmic irradiance dependency + negative temp coefficient
  const Voc_irrad = poa > 0
    ? moduleVoc + 0.026 * Math.log(irradRatio)  // ~thermal voltage × ln(G/G0)
    : 0;
  const Voc = Math.max(0, Voc_irrad * (1 + moduleTempCoeffVoc * ΔT));

  // Imp / Vmp corrections
  const Imp = moduleImp * irradRatio * (1 + moduleTempCoeffIsc * ΔT);
  const Vmp = Math.max(0, moduleVmp * (1 + moduleTempCoeffVoc * ΔT * 0.9));

  // Pmax using corrected temperature coefficient directly
  const Pmp = Math.max(0,
    modulePmaxWp * irradRatio * (1 + moduleTempCoeffPmax * ΔT)
  );

  // Fill factor (ratio of Pmp to Voc×Isc)
  const FF = Voc > 0 && Isc > 0 ? Pmp / (Voc * Isc) : 0;

  return { Isc, Voc, Imp, Vmp, Pmp, FF };
}

/**
 * Array-level DC output power [kW] after applying pre-inverter losses.
 *
 *  poa   — POA irradiance [W/m²]
 *  tCell — cell temperature [°C]
 * Returns detailed result object for the loss waterfall.
 */
export function dcOutput(poa, tCell) {
  const { dcCapacityKwp, soilingLoss, wiringLoss, mismatchLoss, shadingLoss } = PLANT;
  const { Pmp } = ivParameters(poa, tCell);

  // Gross DC [kW] — all modules at their MPP
  const moduleCount = Math.round(dcCapacityKwp * 1000 / PLANT.modulePmaxWp);
  const grossDc_kW = (Pmp * moduleCount) / 1000;

  // Apply losses in sequence
  const afterSoiling   = grossDc_kW   * (1 - soilingLoss);
  const afterShading   = afterSoiling  * (1 - shadingLoss);
  const afterMismatch  = afterShading  * (1 - mismatchLoss);
  const afterWiring    = afterMismatch * (1 - wiringLoss);

  return {
    grossDc_kW,
    soilingLoss_kW:  grossDc_kW   - afterSoiling,
    shadingLoss_kW:  afterSoiling  - afterShading,
    mismatchLoss_kW: afterShading  - afterMismatch,
    wiringLoss_kW:   afterMismatch - afterWiring,
    netDc_kW:        afterWiring,
  };
}

/**
 * Generate hourly DC output curve for a full day.
 *
 *  hourlyProfile — array of { hour, poa, ... } from solar.js
 *  tAmb          — ambient temperature [°C] (monthly mean)
 *  wind          — wind speed [m/s] (monthly mean)
 * Returns array of hourly { hour, poa, tCell, ...dcOutput }
 */
export function dailyDcProfile(hourlyProfile, tAmb, wind) {
  return hourlyProfile.map(({ hour, poa, ghi, alt, iamFactor }) => {
    const tCell = cellTemperature(poa, tAmb, wind);
    const dc = dcOutput(poa, tCell);
    return { hour, poa, ghi, alt, tCell, iamFactor, ...dc };
  });
}
