/**
 * solar.js
 * Solar geometry and irradiance models.
 *
 * Computes sun position and plane-of-array (POA) irradiance
 * for a tilted fixed-tilt surface given latitude, day-of-year,
 * and hour-of-day.
 *
 * Models used:
 *  - Solar declination: Spencer (1971)
 *  - Equation of time: Spencer (1971)
 *  - Diffuse irradiance: Reindl decomposition model
 *  - Ground-reflected: isotropic albedo (ρ = 0.2)
 *  - POA from GHI using Erbs beam/diffuse split
 */

const DEG = Math.PI / 180;

/**
 * Solar declination [rad] for day of year (1–365).
 * Uses Spencer (1971) Fourier approximation.
 */
export function declination(doy) {
  const B = (2 * Math.PI * (doy - 1)) / 365;
  return (
    0.006918 -
    0.399912 * Math.cos(B) +
    0.070257 * Math.sin(B) -
    0.006758 * Math.cos(2 * B) +
    0.000907 * Math.sin(2 * B) -
    0.002697 * Math.cos(3 * B) +
    0.00148  * Math.sin(3 * B)
  );
}

/**
 * Equation of time [minutes] for day of year.
 */
export function equationOfTime(doy) {
  const B = (2 * Math.PI * (doy - 1)) / 365;
  return 229.18 * (
    0.000075 +
    0.001868 * Math.cos(B) -
    0.032077 * Math.sin(B) -
    0.014615 * Math.cos(2 * B) -
    0.04089  * Math.sin(2 * B)
  );
}

/**
 * Solar hour angle [rad] from true solar time [hours].
 */
export function hourAngle(tSolar) {
  return DEG * 15 * (tSolar - 12);
}

/**
 * Solar altitude angle [rad] given:
 *  lat    — latitude [deg]
 *  dec    — declination [rad]
 *  ha     — hour angle [rad]
 */
export function solarAltitude(lat, dec, ha) {
  const φ = lat * DEG;
  const sinAlt =
    Math.sin(φ) * Math.sin(dec) +
    Math.cos(φ) * Math.cos(dec) * Math.cos(ha);
  return Math.asin(Math.max(-1, Math.min(1, sinAlt)));
}

/**
 * Solar azimuth [rad, clockwise from north] given:
 *  lat    — latitude [deg]
 *  dec    — declination [rad]
 *  ha     — hour angle [rad]
 *  alt    — solar altitude [rad]
 */
export function solarAzimuth(lat, dec, ha, alt) {
  const φ = lat * DEG;
  const cosAz =
    (Math.sin(dec) - Math.sin(alt) * Math.sin(φ)) /
    (Math.cos(alt) * Math.cos(φ));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (ha > 0) az = 2 * Math.PI - az; // afternoon
  return az;
}

/**
 * Extraterrestrial horizontal irradiance [W/m²]
 * using the solar constant (1367 W/m²) and Earth–Sun distance.
 */
export function extraterrestrialHorizontal(doy, alt) {
  if (alt <= 0) return 0;
  const eccentricity = 1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365);
  return 1367 * eccentricity * Math.sin(alt);
}

/**
 * Split GHI into beam (Gb) and diffuse (Gd) using Erbs correlation.
 * Returns { Gb, Gd } [W/m²].
 *
 * Clearness index kt = GHI / G0h
 */
export function splitGHI(ghi, g0h) {
  if (ghi <= 0 || g0h <= 0) return { Gb: 0, Gd: 0 };
  const kt = Math.min(ghi / g0h, 1.0);
  let diffuseFraction;
  if (kt <= 0.22) {
    diffuseFraction = 1 - 0.09 * kt;
  } else if (kt <= 0.80) {
    diffuseFraction =
      0.9511 - 0.1604 * kt + 4.388 * kt ** 2 -
      16.638 * kt ** 3 + 12.336 * kt ** 4;
  } else {
    diffuseFraction = 0.165;
  }
  const Gd = Math.min(ghi * diffuseFraction, ghi);
  const Gb = ghi - Gd;
  return { Gb, Gd };
}

/**
 * Incidence angle [rad] of beam radiation on a tilted surface.
 *  tilt   — surface tilt from horizontal [deg]
 *  surfAz — surface azimuth clockwise from north [deg] (180 = south)
 *  alt    — solar altitude [rad]
 *  az     — solar azimuth [rad]
 */
export function incidenceAngle(tilt, surfAz, alt, az) {
  const β = tilt * DEG;
  const γ = surfAz * DEG;
  const cosInc =
    Math.sin(alt) * Math.cos(β) +
    Math.cos(alt) * Math.sin(β) * Math.cos(az - γ);
  return Math.acos(Math.max(0, Math.min(1, cosInc)));
}

/**
 * Plane-of-array (POA) irradiance [W/m²].
 * Components: beam + isotropic sky diffuse + ground-reflected.
 *
 *  tilt   — surface tilt [deg]
 *  Gb, Gd — beam and diffuse horizontal [W/m²]
 *  inc    — incidence angle [rad]
 *  albedo — ground reflectance (default 0.2)
 */
export function poaIrradiance(tilt, Gb, Gd, ghi, inc, albedo = 0.2) {
  const β = tilt * DEG;
  const Rb = Math.max(0, Math.cos(inc));  // beam transposition factor
  const Gb_poa = Gb * Rb;
  const Gd_poa = Gd * (1 + Math.cos(β)) / 2;      // isotropic sky
  const Gr_poa = ghi * albedo * (1 - Math.cos(β)) / 2; // ground reflected
  return Math.max(0, Gb_poa + Gd_poa + Gr_poa);
}

/**
 * Incidence Angle Modifier (IAM) using Martin-Ruiz model.
 * Reduces effective irradiance at high incidence angles.
 *  inc — incidence angle [rad]
 */
export function iam(inc) {
  const ar = 0.16; // glass AR coefficient (typical)
  if (inc >= Math.PI / 2) return 0;
  return 1 - Math.exp(-Math.cos(inc) / ar) / (1 - Math.exp(-1 / ar));
}

/**
 * Compute a full hourly solar profile for a given month and location.
 * Returns array of 24 objects { hour, alt, poa, ghi }.
 *
 *  lat     — latitude [deg]
 *  doy     — representative day of year for the month
 *  ghiMean — mean daily GHI for the month [kWh/m²/day]
 *  tilt    — array tilt [deg]
 *  surfAz  — array azimuth [deg]
 */
export function hourlyProfile(lat, doy, ghiMean, tilt, surfAz) {
  const dec = declination(doy);
  const eot = equationOfTime(doy);
  const hours = [];

  for (let h = 0; h < 24; h++) {
    const tSolar = h + eot / 60; // approximate true solar time
    const ha = hourAngle(tSolar);
    const alt = solarAltitude(lat, dec, ha);
    const az  = solarAzimuth(lat, dec, ha, alt);

    // Scale hourly GHI from daily mean using a sine bell approximation
    // Sunrise/sunset hour angle
    const cosHss = -Math.tan(lat * DEG) * Math.tan(dec);
    const hss = Math.abs(cosHss) < 1 ? Math.acos(Math.max(-1, Math.min(1, cosHss))) / (DEG * 15) : (cosHss < -1 ? 12 : 0);
    const sunrise = 12 - hss;
    const sunset  = 12 + hss;
    const daylightH = sunset - sunrise;

    let ghi = 0;
    if (daylightH > 0 && h >= sunrise && h <= sunset) {
      // Sine-bell shape, scaled so daily integral ≈ ghiMean [kWh/m²/day]
      const sinBell = Math.max(0, Math.sin(Math.PI * (h - sunrise) / daylightH));
      const peakGhi = (ghiMean * 1000 * Math.PI) / (2 * daylightH); // W/m²
      ghi = sinBell * peakGhi;
    }

    const g0h = extraterrestrialHorizontal(doy, alt);
    const { Gb, Gd } = splitGHI(ghi, g0h);
    const inc = alt > 0 ? incidenceAngle(tilt, surfAz, alt, az) : Math.PI / 2;
    const iamFactor = iam(inc);
    const poa = poaIrradiance(tilt, Gb * iamFactor, Gd, ghi, inc);

    hours.push({ hour: h, alt: alt / DEG, az: az / DEG, ghi, poa, iamFactor });
  }
  return hours;
}

// Representative day-of-year values are exported from core/climate.js
