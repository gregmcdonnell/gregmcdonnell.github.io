/**
 * inverter.js
 * Inverter model: DC→AC conversion with realistic efficiency curve.
 *
 * The inverter efficiency curve is S-shaped — low at very low loads,
 * peaks near 30–75% of rated capacity, and droops slightly at full load.
 * Above rated AC capacity, DC power is clipped (curtailed).
 */

import { PLANT } from "../core/plant.js";

/**
 * Interpolate inverter efficiency at a given DC input power [kW].
 * Uses the piecewise-linear curve defined in plant.js.
 *
 *  dcInput_kW — DC power at inverter input [kW]
 * Returns { efficiency, acOutput_kW, clipped_kW, loadFraction }
 */
export function inverterOutput(dcInput_kW) {
  const { acCapacityKw, inverterEfficiencyCurve } = PLANT;

  if (dcInput_kW <= 0) {
    return { efficiency: 0, acOutput_kW: 0, clipped_kW: 0, loadFraction: 0 };
  }

  const loadFraction = dcInput_kW / acCapacityKw;
  const curve = inverterEfficiencyCurve;

  // Piecewise linear interpolation on efficiency curve
  let efficiency = 0;
  for (let i = 1; i < curve.length; i++) {
    const [lf0, eff0] = curve[i - 1];
    const [lf1, eff1] = curve[i];
    if (loadFraction <= lf1 || i === curve.length - 1) {
      const t = lf1 > lf0 ? (loadFraction - lf0) / (lf1 - lf0) : 0;
      efficiency = eff0 + t * (eff1 - eff0);
      break;
    }
  }
  efficiency = Math.max(0, Math.min(1, efficiency));

  // Clipping: AC output cannot exceed rated capacity
  const unconstrainedAc = dcInput_kW * efficiency;
  const clipped = Math.max(0, unconstrainedAc - acCapacityKw);
  const acOutput_kW = Math.min(unconstrainedAc, acCapacityKw);

  return {
    efficiency,
    acOutput_kW,
    clipped_kW: clipped,
    loadFraction: Math.min(loadFraction, 1.25), // cap display at 125%
  };
}

/**
 * Apply inverter model to a full daily DC profile.
 *
 *  dailyDcProfile — array of hourly DC results from pvarray.js
 * Returns array with added { efficiency, acOutput_kW, clipped_kW, loadFraction }
 */
export function dailyAcProfile(dailyDcProfile) {
  return dailyDcProfile.map((hour) => {
    const inv = inverterOutput(hour.netDc_kW);
    return { ...hour, ...inv };
  });
}

/**
 * Build the efficiency curve as array of { load, efficiency } points
 * for charting the inverter efficiency curve.
 * Samples at fine resolution between defined breakpoints.
 */
export function efficiencyCurvePoints(steps = 100) {
  const { acCapacityKw } = PLANT;
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const load = i / steps; // 0 → 1 (load fraction)
    const dcKw = load * acCapacityKw;
    const { efficiency } = inverterOutput(dcKw);
    points.push({ load, efficiency });
  }
  return points;
}
