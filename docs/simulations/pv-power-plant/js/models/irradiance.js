
const DEG = Math.PI / 180;


/**
 * Calculate irradiance on plane of array given the following parameters:
 *
 * @param {object} ghi      — Global Horizontal Irradiance (W/m^2)
 * @param {number} dni      — Direct Normal Irradiance (W/m^2)
 * @param {number} dhi      — Diffuse Horizontal Irradiance (W/m^2)
 * @param {number} cosInc   - cos(incidence angle) = dot product of sun and panel normal, 1 if directly normal
 * @param {number} sunAlt   — sun alitude in radians
 * @param {number} iam      - Incidence angle modifier
 * @returns POA irradiance (W/m^2)
 */
export function computeIncidence(ghi, dni, dhi, cosInc, sunAlt, tilt, iam = 1) {
    // Beam component on tilted surface: DNI × cos(incidence)
    const poa_beam = dni * cosInc * iam;

    // Sky diffuse (isotropic Hay-Davies simplified) 
    
    // const Rb = cosInc / Math.max(0.087, Math.sin(altDeg * DEG)); // beam transposition
    const aniso = dni / 1367; // anisotropy index (clearness)
    const poa_sky = dhi * (aniso * Math.max(0, cosInc / Math.max(0.087, Math.sin(sunAlt)))
                             + (1 - aniso) * (1 + Math.cos(tilt)) / 2);

    // Ground reflected
    const albedo = 0.2;
    // shouldn't this be pi/2 - tilt ? 
    const poa_ground = ghi * albedo * (1 - Math.cos(tilt)) / 2;
    
    return Math.max(0, poa_beam + poa_sky + poa_ground);
}

