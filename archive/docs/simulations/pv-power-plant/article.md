# Building a Utility-Scale PV Power Plant Simulator

## Introduction

[TODO: Personal motivation — why build this? Mention background in solar/energy, interest in simulation, or the gap you noticed between high-level solar calculators and a tool that actually models the physics.]

Photovoltaic power plants are complex systems. The energy a plant produces in a year depends on dozens of interacting factors: where it sits on the globe, how panels are tilted and oriented, what the weather looks like hour by hour, how heat degrades module efficiency, and how losses stack up across wiring, soiling, and inverter conversion. Most public tools treat these factors as black boxes.

This simulation pulls the lid off. It models a **1 MWp utility-scale solar plant** from first principles — sun position geometry through to grid-delivered AC energy — using real TMY (Typical Meteorological Year) weather data from the NREL National Solar Radiation Database (NSRDB) for locations across the world.

---

## What the Simulation Models

The plant is fixed at **1,000 kWp DC** (2,500 × 400 Wp modules) feeding an **800 kW AC inverter** — a DC:AC ratio of 1.25:1, a common utility-scale design choice that trades some clipping loss for a cheaper, right-sized inverter.

From a chosen location and panel configuration, the simulation computes:

- Hourly irradiance on the panel surface (Plane-of-Array, POA)
- Cell temperature and its effect on power output
- DC generation with a full loss waterfall
- AC output through a realistic inverter efficiency curve
- Annual KPIs: Performance Ratio, Capacity Factor, Specific Yield, LCOE, and revenue

---

## The Physics Stack

### Sun Position

Sun position is calculated using the SunCalc library, which implements standard solar geometry equations to return solar altitude (elevation above the horizon) and azimuth (compass bearing) for any latitude, longitude, and time. This drives both the irradiance calculation and the 3D scene visualization.

### Irradiance Transposition (Hay-Davies Model)

Weather data gives us three irradiance components on a horizontal surface: GHI (global), DNI (direct normal), and DHI (diffuse horizontal). Getting from those to the actual irradiance hitting a tilted, oriented panel — Plane-of-Array (POA) — requires transposition.

The simulation uses the **Hay-Davies model**, which separates the diffuse sky radiation into anisotropic (sun-facing) and isotropic (whole-sky) components. Ground-reflected radiation is added using a standard albedo of 0.2.

```
POA = DNI·cos(θ)·IAM + DHI·(anisotropy·Rb + (1−anisotropy)·(1+cos(tilt))/2) + GHI·0.2·(1−cos(tilt))/2
```

At high incidence angles, the **Martin-Ruiz IAM model** derate the beam component to account for increased reflectance at the panel surface.

### Cell Temperature (Faiman Model)

Module efficiency drops with heat. The simulation uses the **Faiman (2008) thermal model**, an empirically-grounded approach that treats the panel as a heat balance between absorbed radiation and convective cooling:

```
T_cell = T_ambient + POA / (U0 + U1·wind_speed)
```

With coefficients U0 = 25 W/m²/°C and U1 = 6.84 W/m²/°C·(m/s), a panel in still air at 30°C ambient and 800 W/m² of POA reaches roughly 62°C — and at −0.34%/°C power coefficient, that's a ~12% output reduction compared to STC.

### DC Output and Loss Waterfall

After correcting Isc, Voc, and Pmax from STC to actual operating conditions, the gross DC output flows through four sequential loss factors:

| Loss | Value |
|------|-------|
| Soiling | 2.0% |
| Shading & mismatch | 1.5% |
| DC wiring | 1.5% |

These are applied multiplicatively, giving a net DC output ready for the inverter.

### Inverter Model

Rather than a flat efficiency percentage, the inverter uses a **piecewise linear S-curve** over the load fraction (DC input / AC rated capacity). Efficiency climbs quickly from near-zero at startup, peaks around 98.2% at 50% load, and falls slightly at high load. At a DC:AC ratio of 1.25, the inverter clips on the best solar days — visible in the loss waterfall as "inverter clipping."

### Self-Shading and Backtracking

For single-axis tracking systems, row spacing determines how much one row shades the next at low sun angles. The simulation computes the **shaded fraction** geometrically from row height and spacing, then optionally applies **backtracking**: rotating rows back from their ideal sun-following angle to eliminate inter-row shading during the morning and evening hours. This is standard practice for utility-scale tracking systems.

---

## Data: NSRDB TMY Files

Each location uses real hourly data from NREL's NSRDB — 8,760 records per year covering GHI, DNI, DHI, temperature, and wind speed. The simulation aggregates this into monthly profiles, computing mean, minimum, and maximum across all days in each month to show the typical day alongside best- and worst-case bounds.

Locations covered: Phoenix, Denver, Pueblo, Las Vegas, Hartford, Palm Springs (US), London (UK), Oslo (Norway), Nairobi (Kenya).

---

## Key Performance Indicators

The KPI strip at the top of the simulation updates live as you change location, orientation, or tracking mode:

**Performance Ratio (PR)** measures actual AC output as a fraction of ideal (as if the plant ran at STC all day at the given POA irradiance). It captures all real-world losses — temperature, soiling, wiring, inverter inefficiency — in a single normalized number. Typical range: 75–85%.

**Capacity Factor (CF)** is the ratio of annual AC output to what the plant would produce running flat-out at rated capacity for 8,760 hours. For utility solar, this typically lands between 17–30% depending on location.

**Specific Yield** normalizes annual AC output by DC capacity (kWh/kWp/year) — the standard metric for comparing sites or designs regardless of system size.

**LCOE** uses a capital recovery factor with 6% WACC over a 25-year project life:

```
LCOE = (CapEx · CRF + OpEx) / Annual_AC_output
CRF  = r·(1+r)^n / ((1+r)^n − 1)
```

At $900/kWp CapEx and $15/kW/yr OpEx, LCOE typically lands between $35–55/MWh depending on location.

**Annual Revenue** is calculated at a $0.065/kWh PPA rate — a placeholder representing a power purchase agreement price.

---

## What You Can Explore

[TODO: Walk through a few interesting comparisons or findings from the simulation. Some ideas:]

- **Location matters most**: Phoenix vs. Oslo produces roughly 2× the annual energy. [Add specific numbers from your simulation runs.]
- **Tracking vs. fixed tilt**: Single-axis tracking adds ~20–30% annual yield over a fixed south-facing array. [Add your data.]
- **The cost of clipping**: With a 1.25 DC:AC ratio, summer afternoons in desert locations show visible clipping in the waterfall. Is that the right tradeoff?
- **Temperature penalty**: The hottest locations lose more to thermal losses — partially offsetting their irradiance advantage.

---

## Architecture Overview

The simulation is a vanilla JavaScript application — no build toolchain, no framework. It loads real CSV data from NREL NSRDB, runs all physics calculations client-side, and renders results across four analysis tabs.

```
models/       — physics: irradiance, cell temperature, DC losses, inverter
core/         — data loading, state management, plant constants
ui/           — charts (Chart.js), 3D scene (Three.js), event wiring
```

State is managed with a lightweight pub/sub pattern: changing any slider or dropdown triggers a single reactive update across all dependent views.

[TODO: Say something about the decision to keep it dependency-light. Why Three.js for the 3D scene? Why Chart.js for the charts?]

---

## Limitations and Next Steps

[TODO: Be honest about what the simulation doesn't model and what you'd add with more time:]

- Single representative "average day" per month rather than full stochastic simulation
- No soiling variability or cleaning schedule optimization
- Fixed loss assumptions (soiling, mismatch) rather than configurable
- No bifacial module model (rear-side irradiance gain)
- Economic model uses simplified LCOE without degradation curve or financing structure
- [Your own notes here]

---

## Conclusion

[TODO: Wrap up with what building this taught you, what surprised you about the physics or the data, and a link to the live simulation.]

---

*This simulation uses weather data from the [NREL National Solar Radiation Database (NSRDB)](https://nsrdb.nrel.gov/). Solar position calculations use [SunCalc.js](https://github.com/mourner/suncalc). 3D rendering uses [Three.js](https://threejs.org/). Charts use [Chart.js](https://www.chartjs.org/).*
