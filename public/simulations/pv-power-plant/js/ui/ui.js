import { LOCATIONS, MONTH_NAMES } from "../core/climate.js";
import { PLANT, DERIVED } from "../core/plant.js";
import { loadNSRDB, monthlyClimateSummary } from "../core/nsrdb.js";
import { calculateAnnualFromNSRDB, buildLossWaterfall, yearSunTimes, processMonthForAverageDay, dailyTotals } from "../models/simulation.js";
import { initDayHourlyChart, updateDayHourlyChart, setDayHourlyMarker, changeYScaleMax } from "./chartDayHourly.js";
import { initAnnualChart, updateAnnualChart, initAnnualSummaryChart, updateAnnualSummaryChart } from "./chartAnnualMonthly.js";
import { initWaterfallChart, updateWaterfallChart } from "./chartWaterfall.js";
import { initSunGraphChart, updateSunGraphChart, initClimateChart, updateClimateChart } from "./chartClimate.js";
import { initEnergyYieldChart, updateEnergyYieldChart, initCashFlowChart, updateCashFlowChart } from "./chartFinancials.js";
import { calculateFinancials } from "../models/financials.js";
import { Scene3D } from "./scene3d.js";

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

// Scene singleton
const scene3d = Scene3D.init();

// Chart singletons
let dayChart           = null;
let annualChart        = null;
let annualSummaryChart = null;
let waterfallChart     = null;
let sunGraphChart      = null;
let climateChart       = null;
let finEnergyChart     = null;
let finCashFlowChart   = null;

// Simulation state
let dataset            = null;
let lastAnnualAc_kWh   = 0;   // cached for financial re-runs without full sim
let currentLocation = "phoenix";
let currentMonth    = 5;   // 1-indexed
let currentHour     = 12;
let fixedTiltDeg       = 25;
let fixedAzDeg         = 180;
let tracking        = false;
let backtracking    = true;
let hourlyProfile   = null;

const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function fmt(val, decimals = 1) {
  if (val === undefined || isNaN(val)) return "—";
  return val.toLocaleString("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

function setEl(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function compassLabel(deg) {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function hourLabel(h) {
  return `${String(h).padStart(2, "0")}:00`;
}

// ─────────────────────────────────────────────────────
//  KPI / metrics
// ─────────────────────────────────────────────────────

function updateKPIs(result) {
  const { kpis, annual } = result;
  setEl("kpi-pr",      fmt(kpis.pr, 1)                         + " %");
  setEl("kpi-cf",      fmt(kpis.cf, 1)                         + " %");
  setEl("kpi-yield",   fmt(kpis.specificYield, 0)              + " kWh/kWp");
  setEl("kpi-lcoe",    "$ " + fmt(kpis.lcoe, 1)                + " /MWh");
  setEl("kpi-energy",  fmt(annual.totalAc_kWh / 1000, 0)       + " MWh/yr");
  setEl("kpi-revenue", "$ " + fmt(annual.revenue_usd / 1000, 0) + "k /yr");
  // console.log(fmt(annual.totalAc_kWh / 1000 / PLANT.rowSpacing, 0) + " MWh/yr/area")
}

function updateFinancials() {
  if (!lastAnnualAc_kWh) return;
  const result = calculateFinancials(lastAnnualAc_kWh);
  const { summary, capex, years } = result;

  const fmtM = (v) => isNaN(v) ? "—" : `$${(v / 1e6).toFixed(2)}M`;
  const fmtK = (v) => isNaN(v) ? "—" : `$${(v / 1e3).toFixed(0)}k`;

  setEl("fin-npv",     fmtM(summary.npv));
  setEl("fin-irr",     isNaN(summary.irr) ? "—" : `${(summary.irr * 100).toFixed(1)} %`);
  setEl("fin-payback", summary.paybackYear ? `${summary.paybackYear} yr` : "N/A");
  setEl("fin-capex",   fmtM(capex));
  setEl("fin-revenue", fmtM(summary.totalRevenue_usd));
  setEl("fin-energy",  `${(summary.totalEnergy_MWh / 1000).toFixed(1)} GWh`);

  updateEnergyYieldChart(finEnergyChart, years);
  updateCashFlowChart(finCashFlowChart, capex, years);
}

function updateMetrics(totals, profile) {
  setEl("rd-kpi-total-poa",   fmt(totals.totalIncident, 0) + " kWh");
  setEl("rd-kpi-dc",   fmt(totals.energyDc_kWh, 0) + " kWh");
  setEl("rd-kpi-ac",   fmt(totals.energyAc_kWh, 0) + " kWh");
  setEl("rd-kpi-peak", fmt(totals.peakAc_kW, 0)    + " kW");
  setEl("rd-kpi-poa",  fmt(totals.peakPoa_Wm2, 0)  + " W/m²");
  setEl("rd-kpi-pr",   fmt(totals.pr, 1)            + " %");

  if (profile?.[currentHour]) {
    const h = profile[currentHour];
    setEl("rd-kpi-hour-ghi",   fmt(h.ghi.mean, 0)         + " W/m²");
    setEl("rd-kpi-hour-poa",   fmt(h.mean.poa, 0)         + " W/m²");
    setEl("rd-kpi-hour-ac",    fmt(h.mean.acOutput_kW, 1) + " kW");
    setEl("rd-kpi-hour-tcell", fmt(h.mean.tCell, 1)       + " °C");
    setEl("rd-kpi-hour-alt",   fmt(h.altDeg, 1)           + "°");
    setEl("rd-kpi-hour-az",    fmt(h.azDeg, 1)            + "°");
    setEl("rd-kpi-shade",      fmt(h.shade, 2)            );
  }
}

function updatePanelOrientationDisplay() {
  if (tracking && hourlyProfile?.[currentHour]) {
    const { panelTilt, panelAz } = hourlyProfile[currentHour];
    setEl("rd-info-tilt", (panelTilt * RAD2DEG).toFixed(0) + "°");
    setEl("rd-info-az",   (panelAz * RAD2DEG).toFixed(0) + "°  " + compassLabel(panelAz * RAD2DEG));
  } else {
    setEl("rd-info-tilt", fixedTiltDeg + "°");
    setEl("rd-info-az",   fixedAzDeg + "°  " + compassLabel(fixedAzDeg));
  }
}

// ─────────────────────────────────────────────────────
//  Core data flow
// ─────────────────────────────────────────────────────

/** Load dataset, update labels, init charts (once), then run simulation. */
export async function setLocation(locationKey) {
  currentLocation = locationKey;
  const loc = LOCATIONS[locationKey];

  if (!loc.dbdata) { console.warn(`No NSRDB data for ${locationKey}`); return; }
  try {
    dataset = await loadNSRDB(loc.dbdata);
  } catch (err) {
    console.error(`Failed to load NSRDB for ${locationKey}:`, err);
    return;
  }

  setEl("location-label", loc.name);
  setEl("bc-location", loc.name.toUpperCase().replace(/[^A-Z0-9]/g, "_"));
  const { lat, lon, timezone, elevation } = dataset;
  setEl("loc-climate-label",
    `${loc.label}  ·  ${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"},` +
    ` ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? "E" : "W"}  ·  ${elevation}m elev` +
    `  ·  UTC${timezone >= 0 ? "+" : ""}${timezone}`
  );

  updateSunGraphChart(sunGraphChart, yearSunTimes(lat, lon, elevation), loc.timeZone);
  updateClimateChart(climateChart, monthlyClimateSummary(dataset));

  runUpdate();
}

/**
 * Recompute simulation for current state and push results to all charts + KPIs.
 * Called on: location change, month change, tilt/az change, tracking toggle.
 */
function runUpdate() {
  if (!dataset) return;
  
  const year = dataset.records[0]?.Year ?? 2023;
  const agg  = dataset.byMonth[currentMonth].aggregate;

  hourlyProfile = processMonthForAverageDay(
    agg, dataset.lat, dataset.lon,
    currentMonth, year, dataset.timezone,
    fixedTiltDeg * DEG2RAD, fixedAzDeg * DEG2RAD, 
    tracking, backtracking
  );

  if (dayChart) updateDayHourlyChart(dayChart, hourlyProfile);

  const totals = dailyTotals(hourlyProfile);
  updateMetrics(totals, hourlyProfile);

  const annualResult = calculateAnnualFromNSRDB(dataset, fixedTiltDeg * DEG2RAD, fixedAzDeg * DEG2RAD, tracking, backtracking);
  updateKPIs(annualResult);

  lastAnnualAc_kWh = annualResult.annual.totalAc_kWh;
  updateFinancials();

  if (annualChart)        updateAnnualChart(annualChart, annualResult.monthly);
  if (annualSummaryChart) updateAnnualSummaryChart(annualSummaryChart, toDailyAverages(annualResult.monthly));
  if (waterfallChart)     updateWaterfallChart(waterfallChart, buildLossWaterfall(annualResult));

  const hrStats = hourlyProfile[currentHour];
  scene3d?.updateSunPosition(hrStats.altDeg, hrStats.azDeg, currentHour / 24);
  scene3d?.updatePanelOrientation(hrStats.panelTilt * RAD2DEG, hrStats.panelAz * RAD2DEG, true);
  const lat = dataset.lat * DEG2RAD;
  scene3d.rotationAxis = {x: 0, y: Math.sin(lat), z: -Math.cos(lat)};
  updatePanelOrientationDisplay();
  
}

/** Convert monthly totals (kWh/month) → daily averages (kWh/day) for the summary chart. */
function toDailyAverages(monthly) {
  return monthly.map((m, i) => ({
    name:         m.name,
    energyAc_kWh: m.energyAc_kWh / DAYS_PER_MONTH[i],
    energyDc_kWh: m.energyDc_kWh / DAYS_PER_MONTH[i],
    peakAc_kW:    m.peakAc_kW,
  }));
}

// ─────────────────────────────────────────────────────
//  Plant spec panel
// ─────────────────────────────────────────────────────

function populatePlantSpecs() {
  const specs = [
    ["DC capacity",  `${PLANT.dcCapacityKwp.toLocaleString()} kWp`],
    ["AC capacity",  `${PLANT.acCapacityKw.toLocaleString()} kW`],
    ["DC:AC ratio",  `${DERIVED.dcAcRatio.toFixed(2)}×`],
    ["Module Pmax",  `${PLANT.modulePmaxWp} Wp`],
    ["Module count", `${DERIVED.moduleCount.toLocaleString()}`],
    ["Temp coeff.",  `${(PLANT.moduleTempCoeffPmax * 100).toFixed(2)} %/°C`],
    ["Soiling loss", `${(PLANT.soilingLoss * 100).toFixed(1)} %`],
    ["Degradation",  `${(PLANT.degradationRatePerYear * 100).toFixed(1)} %/yr`],
    ["Project life", `${PLANT.projectLifeYears} yr`],
    ["WACC",         `${(PLANT.discountRate * 100).toFixed(0)} %`],
  ];
  const container = document.getElementById("plant-specs");
  if (!container) return;
  container.innerHTML = specs
    .map(([k, v]) => `<div class="spec-row"><span class="spec-key">${k}</span><span class="spec-val">${v}</span></div>`)
    .join("");
}

function updatePlantDesignDisplays() {
  const acKw = PLANT.acCapacityKw;
  const dcKwp = PLANT.dcCapacityKwp;

  setEl("pd-ac-cap-display", `${(acKw / 1000).toLocaleString()} MW`);
  setEl("pd-module-count-display", DERIVED.moduleCount.toLocaleString());
  setEl("flow-pv-label", `${(dcKwp / 1000).toLocaleString()} MWp DC`);
  setEl("flow-inv-label", `${(acKw / 1000).toLocaleString()} MW AC`);
  populatePlantSpecs();
}

function buildPlantDesignControls() {
  const dcCapSlider  = document.getElementById("pd-dc-cap");
  const dcCapVal     = document.getElementById("pd-dc-cap-val");
  const dcAcSlider   = document.getElementById("pd-dcac");
  const dcAcVal      = document.getElementById("pd-dcac-val");
  const moduleSel    = document.getElementById("pd-module-pmax");

  function applyPlantChange() {
    PLANT.acCapacityKw = PLANT.dcCapacityKwp / parseFloat(dcAcSlider.value);
    updatePlantDesignDisplays();
    changeYScaleMax(dayChart, Math.round(PLANT.acCapacityKw * (850/800) / 10) * 10);
    runUpdate();
  }

  if (dcCapSlider) {
    dcCapSlider.addEventListener("input", e => {
      PLANT.dcCapacityKwp = +e.target.value;
      if (dcCapVal) dcCapVal.textContent = `${(PLANT.dcCapacityKwp / 1000).toLocaleString()} MWp`;
      applyPlantChange();
    });
  }

  if (dcAcSlider) {
    dcAcSlider.addEventListener("input", e => {
      const ratio = parseFloat(e.target.value);
      if (dcAcVal) dcAcVal.textContent = `${ratio.toFixed(2)}×`;
      applyPlantChange();
    });
  }

  if (moduleSel) {
    moduleSel.addEventListener("change", e => {
      PLANT.modulePmaxWp = +e.target.value;
      updatePlantDesignDisplays();
    });
  }

  updatePlantDesignDisplays();
}

// ─────────────────────────────────────────────────────
//  Controls
// ─────────────────────────────────────────────────────

function buildControls() {
  const monthSel = document.getElementById("rd-month");
  if (monthSel) {
    monthSel.innerHTML = MONTH_NAMES.map((n, i) =>
      `<option value="${i + 1}" ${i + 1 === currentMonth ? "selected" : ""}>${n}</option>`
    ).join("");
    monthSel.addEventListener("change", e => { currentMonth = +e.target.value; runUpdate(); });
  }

  const rowSpacingSlider = document.getElementById("rd-row-spacing");
  const rowSpacingVal    = document.getElementById("rd-row-spacing-val");
  if (rowSpacingSlider) {
    rowSpacingSlider.value = PLANT.rowSpacing / PLANT.panelHeight;
    rowSpacingVal.textContent = rowSpacingSlider.value;
    rowSpacingSlider.addEventListener("input", e => {
      PLANT.rowSpacing = +e.target.value * PLANT.panelHeight;
      if (rowSpacingVal) rowSpacingVal.textContent = PLANT.rowSpacing / PLANT.panelHeight;
      scene3d.updatePanelSpacing(PLANT.rowSpacing);
      runUpdate();
    });
  }

  const tiltSlider = document.getElementById("rd-tilt");
  const tiltVal    = document.getElementById("rd-tilt-val");
  if (tiltSlider) {
    tiltSlider.value = fixedTiltDeg;
    tiltSlider.addEventListener("input", e => {
      fixedTiltDeg = +e.target.value;
      if (tiltVal) tiltVal.textContent = fixedTiltDeg + "°";
      runUpdate();
    });
  }

  const azSlider = document.getElementById("rd-azimuth");
  const azVal    = document.getElementById("rd-az-val");
  if (azSlider) {
    azSlider.value = fixedAzDeg;
    azSlider.addEventListener("input", e => {
      fixedAzDeg = +e.target.value;
      const azStr = fixedAzDeg + "°  " + compassLabel(fixedAzDeg);
      if (azVal) azVal.textContent = azStr;
      runUpdate();
    });
  }

  const trackSel = document.getElementById("rd-track");
  const backtrackCheck = document.getElementById("check-backtrack");
  const shadowsWarning = document.getElementById("shadows-warning");
  if (trackSel) {
    trackSel.addEventListener("change", e => {
      tracking = +e.target.value === 1;
      if (tiltSlider) tiltSlider.parentElement.style.display = tracking ? "none" : "flex";
      if (azSlider)   azSlider.parentElement.style.display   = tracking ? "none" : "flex";
      backtrackCheck.parentElement.style.display   = tracking ? "flex" : "none";
      runUpdate();
    });
  }
  if (backtrackCheck) {
    backtrackCheck.parentElement.style.display   = tracking ? "flex" : "none";
    backtrackCheck.addEventListener("change", e => {
      backtracking = e.target.checked;
      shadowsWarning.style.display = backtracking ? "none" : "flex";
      runUpdate();
    });
  }

  // Time-of-day scrubber — lightweight, no full recalc
  const timeSlider = document.getElementById("rd-hour");
  const timeVal    = document.getElementById("rd-hour-val");
  const timeEcho   = document.getElementById("rd-hour-val-echo");
  if (timeSlider) {
    timeSlider.value = currentHour;
    timeSlider.addEventListener("input", e => {
      currentHour = +e.target.value;
      const label = hourLabel(currentHour);
      if (timeVal)  timeVal.textContent  = label;
      if (timeEcho) timeEcho.textContent = label;
      onTimeOfDayChange();
    });
  }
}

function onTimeOfDayChange() {
  if (dayChart) setDayHourlyMarker(dayChart, currentHour);
  if (hourlyProfile) {
    updateMetrics(dailyTotals(hourlyProfile), hourlyProfile);
    const { panelTilt, panelAz, altDeg, azDeg, sunVec } = hourlyProfile[currentHour];
    
    scene3d?.updateSunPosition(altDeg, azDeg, currentHour / 24);
    if (tracking) {
      scene3d?.updatePanelOrientation(panelTilt * RAD2DEG, panelAz * RAD2DEG);
      updatePanelOrientationDisplay();
    }
  }
}

function populateLocationButtonsOld() {
  const container = document.getElementById("location-buttons");
  if (!container) return;
  Object.entries(LOCATIONS).forEach(([key, loc]) => {
    const btn = document.createElement("button");
    btn.className = "loc-btn" + (key === currentLocation ? " active" : "");
    btn.dataset.key = key;
    btn.innerHTML = `<span class="loc-name">${loc.name}</span><span class="loc-label">${loc.label}</span>`;
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".loc-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      await setLocation(key);
    });
    container.appendChild(btn);
  });
}

function populateLocationButtons() {
  const container = document.getElementById("location-buttons");
  if (!container) return;

  container.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "location-dropdown";

  const selectedBtn = document.createElement("button");
  selectedBtn.className = "loc-btn dropdown-selected";

  const menu = document.createElement("div");
  menu.className = "location-menu hidden";

  function updateSelectedButton() {
    const loc = LOCATIONS[currentLocation];

    selectedBtn.innerHTML = `
      <div>
        <span class="loc-name">${loc.name}</span>
        <span class="loc-label">${loc.label}</span>
      </div>
      <span class="dropdown-arrow">▼</span>
    `;
  }

  selectedBtn.addEventListener("click", () => {
    menu.classList.toggle("hidden");
  });

  Object.entries(LOCATIONS).forEach(([key, loc], i) => {
    const btn = document.createElement("button");

    btn.className = `loc-btn ${i == 0 ? "active" : ""}`;
    btn.dataset.key = key;

    btn.innerHTML = `
      <span class="loc-name">${loc.name}</span>
      <span class="loc-label">${loc.label}</span>
    `;

    btn.addEventListener("click", async () => {
      currentLocation = key;
      updateSelectedButton();

      menu.querySelectorAll(".loc-btn").forEach(b => { b.classList.remove("active"); });
      btn.classList.add("active");
      menu.classList.add("hidden");

      await setLocation(key);
    });

    menu.appendChild(btn);
  });

  updateSelectedButton();

  wrapper.appendChild(selectedBtn);
  wrapper.appendChild(menu);
  container.appendChild(wrapper);

  // Close dropdown if clicking outside
  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target)) {
      menu.classList.add("hidden");
    }
  });
}

function initTabs() {
  const tabs   = document.querySelectorAll(".tab-btn");
  const panels = document.querySelectorAll(".tab-panel");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t   => t.classList.remove("active"));
      panels.forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      const target = document.getElementById("panel-" + tab.dataset.tab);
      if (target) target.classList.add("active");
    });
  });
}

function initCharts() {
  dayChart           = initDayHourlyChart("chart-realday");
  annualChart        = initAnnualChart("chart-annual");
  annualSummaryChart = initAnnualSummaryChart("chart-realday-annual");
  waterfallChart     = initWaterfallChart("chart-waterfall");
  sunGraphChart      = initSunGraphChart("chart-sun-graph");
  climateChart       = initClimateChart("chart-climate");
  finEnergyChart     = initEnergyYieldChart("chart-fin-energy");
  finCashFlowChart   = initCashFlowChart("chart-fin-cashflow");
}

function buildFinancialControls() {
  const inputs = [
    { id: "fin-price",       key: "electricityPriceUsdPerKwh", scale: 1       },
    { id: "fin-escalation",  key: "priceEscalationRate",       scale: 0.01    },
    { id: "fin-capex-input", key: "capitalCostUsdPerKwp",      scale: 1       },
    { id: "fin-opex",        key: "opexUsdPerKwPerYear",        scale: 1       },
    { id: "fin-degradation", key: "degradationRatePerYear",    scale: 0.01    },
    { id: "fin-wacc",        key: "discountRate",               scale: 0.01    },
  ];

  inputs.forEach(({ id, key, scale }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", () => {
      PLANT[key] = parseFloat(el.value) * scale;
      updateFinancials();
    });
  });
}

function buildScene() {
  scene3d.updatePanelOrientation(fixedTiltDeg, fixedAzDeg, true);
}

// ─────────────────────────────────────────────────────
//  Entry point
// ─────────────────────────────────────────────────────

export async function initUI() {
  populatePlantSpecs();
  populateLocationButtons();
  initTabs();
  initCharts();
  buildControls();
  buildPlantDesignControls();
  buildFinancialControls();
  buildScene();
  await setLocation(currentLocation);
}

