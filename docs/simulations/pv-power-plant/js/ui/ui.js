import { LOCATIONS, MONTH_NAMES } from "../core/climate.js";
import { PLANT, DERIVED } from "../core/plant.js";
import { loadNSRDB, aggregateMonth, monthlyClimateSummary } from "../core/nsrdb.js";
import { calculateAnnualFromNSRDB, buildLossWaterfall, yearSunTimes, processMonthForAverageDay, dailyTotals } from "../models/simulation.js";
import { initDayHourlyChart, updateDayHourlyChart, setDayHourlyMarker } from "./chartDayHourly.js";
import { initAnnualChart, updateAnnualChart, initAnnualSummaryChart, updateAnnualSummaryChart } from "./chartAnnualMonthly.js";
import { initWaterfallChart, updateWaterfallChart } from "./chartWaterfall.js";
import { initSunGraphChart, updateSunGraphChart, initClimateChart, updateClimateChart } from "./chartClimate.js";
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

// Simulation state
let dataset         = null;
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
    setEl("rd-info-tilt", panelTilt.toFixed(0) + "°");
    setEl("rd-info-az",   panelAz.toFixed(0) + "°  " + compassLabel(panelAz));
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

  // Init charts once — they persist across location changes
  if (!dayChart)           dayChart           = initDayHourlyChart("chart-realday");
  if (!annualChart)        annualChart        = initAnnualChart("chart-annual", []);
  if (!annualSummaryChart) annualSummaryChart = initAnnualSummaryChart("chart-realday-annual", []);
  if (!waterfallChart)     waterfallChart     = initWaterfallChart("chart-waterfall", []);
  if (!sunGraphChart)      sunGraphChart      = initSunGraphChart("chart-sun-graph", yearSunTimes(loc), loc);
  updateSunGraphChart(sunGraphChart, yearSunTimes(loc), loc);

  const climateSummary = monthlyClimateSummary(dataset);
  if (!climateChart) climateChart = initClimateChart("chart-climate", climateSummary);
  else               updateClimateChart(climateChart, climateSummary);

  runUpdate();
}

/**
 * Recompute simulation for current state and push results to all charts + KPIs.
 * Called on: location change, month change, tilt/az change, tracking toggle.
 */
function runUpdate() {
  if (!dataset) return;

  const year = dataset.records[0]?.Year ?? 2023;
  const agg  = aggregateMonth(dataset.byMonth, currentMonth);

  hourlyProfile = processMonthForAverageDay(
    agg, dataset.lat, dataset.lon,
    currentMonth, year, dataset.timezone,
    fixedTiltDeg * DEG2RAD, fixedAzDeg * DEG2RAD,
    window.SunCalc, tracking, backtracking
  );

  if (dayChart) updateDayHourlyChart(dayChart, hourlyProfile);

  const totals = dailyTotals(hourlyProfile);
  updateMetrics(totals, hourlyProfile);

  const annualResult = calculateAnnualFromNSRDB(dataset, fixedTiltDeg * DEG2RAD, fixedAzDeg * DEG2RAD, tracking, backtracking);
  updateKPIs(annualResult);

  if (annualChart)        updateAnnualChart(annualChart, annualResult.monthly);
  if (annualSummaryChart) updateAnnualSummaryChart(annualSummaryChart, toDailyAverages(annualResult.monthly));
  if (waterfallChart)     updateWaterfallChart(waterfallChart, buildLossWaterfall(annualResult));

  const hrStats = hourlyProfile[currentHour];
  scene3d?.updateSunPosition(hrStats.altDeg, hrStats.azDeg);
  scene3d?.updatePanelOrientation(hrStats.panelTilt * RAD2DEG, hrStats.panelAz * RAD2DEG, true);
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
    rowSpacingSlider.value = PLANT.rowSpacing;
    rowSpacingSlider.addEventListener("input", e => {
      PLANT.rowSpacing = +e.target.value;
      if (rowSpacingVal) rowSpacingVal.textContent = PLANT.rowSpacing + "M";
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
    
    scene3d?.updateSunPosition(altDeg, azDeg);
    if (tracking) {
      scene3d?.updatePanelOrientation(panelTilt * RAD2DEG, panelAz * RAD2DEG);
      updatePanelOrientationDisplay();
    }
  }
}

function populateLocationButtons() {
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
  buildControls();
  buildScene();
  await setLocation(currentLocation);
}

