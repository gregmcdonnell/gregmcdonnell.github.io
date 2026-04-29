/**
 * ui.js
 * DOM controller — wires together the simulation engine and chart renderers.
 *
 * Responsibilities:
 *  - Location selector events
 *  - Month scrubber for day view
 *  - Tab switching (Day / Annual / Losses)
 *  - KPI card updates
 *  - Plant spec panel population
 *  - Animated power flow display
 */

import { LOCATIONS, MONTH_NAMES } from "../core/climate.js";
import { PLANT, DERIVED } from "../core/plant.js";
import { simulateDay, simulateYear, lossWaterfall, yearSunTimes } from "../models/simulation.js";
import {
  initDayChart, updateDayChart,
  initAnnualChart, updateAnnualChart,
  initWaterfallChart, updateWaterfallChart,
  initSunGraphChart,
  updateSunGraphChart
} from "./charts.js";
import { initRealDayPanel, setRealDayLocation } from "./realdaypanel.js";
// import * as SunCalc from '../suncalc.js';
// import * as SunCalc from 'suncalc';

// Chart instances (module-level singletons)
let dayChart = null;
let annualChart = null;
let waterfallChart = null;
let sunGraphChart = null;

// Current simulation state
let currentLocation = "phoenix";
let currentMonth = 5; // June default

/** Format a number with SI suffix */
function fmt(val, decimals = 1) {
  if (val === undefined || isNaN(val)) return "—";
  return val.toLocaleString("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

/** Update KPI cards from annual result */
function updateKPIs(result) {
  const { kpis, annual } = result;
  setEl("kpi-pr",    fmt(kpis.pr, 1) + " %");
  setEl("kpi-cf",    fmt(kpis.cf, 1) + " %");
  setEl("kpi-yield", fmt(kpis.specificYield, 0) + " kWh/kWp");
  setEl("kpi-lcoe",  "$ " + fmt(kpis.lcoe, 1) + " /MWh");
  setEl("kpi-energy",fmt(annual.totalAc_kWh / 1000, 0) + " MWh/yr");
  setEl("kpi-revenue","$ " + fmt(annual.revenue_usd / 1000, 0) + "k /yr");
}

/** Update day-view header stats */
function updateDayStats(hourly, monthIndex) {
  const peakAc = Math.max(...hourly.map(h => h.acOutput_kW));
  const energy  = hourly.reduce((s, h) => s + h.acOutput_kW, 0);
  const peakT   = Math.max(...hourly.map(h => h.tCell));

  setEl("day-month",    MONTH_NAMES[monthIndex]);
  setEl("day-peak",     fmt(peakAc, 0) + " kW");
  setEl("day-energy",   fmt(energy, 0) + " kWh");
  setEl("day-peaktemp", fmt(peakT, 1) + " °C");
}

/** Update power flow animation intensity */
function updateFlowAnimation(hourly) {
  const peakAc = Math.max(...hourly.map(h => h.acOutput_kW));
  const loadFraction = peakAc / PLANT.acCapacityKw;
  const intensity = Math.min(1, Math.max(0.1, loadFraction));
  document.documentElement.style.setProperty("--flow-speed", (2.5 - intensity * 1.8).toFixed(2) + "s");
  document.documentElement.style.setProperty("--flow-opacity", (0.3 + intensity * 0.7).toFixed(2));
}

function setEl(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/** Run the full update cycle for the selected location */
function runSimulation(locationKey) {
  currentLocation = locationKey;

  // Annual simulation
  const result = simulateYear(locationKey);
  updateKPIs(result);

  // Update location label
  const loc = LOCATIONS[locationKey];
  setEl("location-label", loc.name);
  setEl("loc-climate-label",   `${loc.label}`);

  // Annual chart
  if (annualChart) updateAnnualChart(annualChart, result.monthly);

  // Waterfall chart
  const waterfall = lossWaterfall(result);
  if (waterfallChart) updateWaterfallChart(waterfallChart, waterfall);

  if (sunGraphChart) updateSunGraphChart(sunGraphChart, yearSunTimes(LOCATIONS[locationKey]), LOCATIONS[currentLocation])

  // Day simulation for current month
  runDaySimulation(locationKey, currentMonth);
}

function runDaySimulation(locationKey, monthIndex) {
  currentMonth = monthIndex;
  const hourly = simulateDay(locationKey, monthIndex);

  if (dayChart) {
    updateDayChart(dayChart, hourly);
  }
  updateDayStats(hourly, monthIndex);
  updateFlowAnimation(hourly);
}

/** Populate plant spec panel */
function populatePlantSpecs() {
  const specs = [
    ["DC capacity",    `${PLANT.dcCapacityKwp.toLocaleString()} kWp`],
    ["AC capacity",    `${PLANT.acCapacityKw.toLocaleString()} kW`],
    ["DC:AC ratio",   `${DERIVED.dcAcRatio.toFixed(2)}×`],
    ["Module Pmax",   `${PLANT.modulePmaxWp} Wp`],
    ["Module count",  `${DERIVED.moduleCount.toLocaleString()}`],
    ["Array tilt",    `${PLANT.tiltDeg}°`],
    ["Azimuth",       `${PLANT.azimuthDeg}° (south)`],
    ["Temp coeff.",   `${(PLANT.moduleTempCoeffPmax * 100).toFixed(2)} %/°C`],
    ["Soiling loss",  `${(PLANT.soilingLoss * 100).toFixed(1)} %`],
    ["Degradation",   `${(PLANT.degradationRatePerYear * 100).toFixed(1)} %/yr`],
    ["Project life",  `${PLANT.projectLifeYears} yr`],
    ["WACC",          `${(PLANT.discountRate * 100).toFixed(0)} %`],
  ];

  const container = document.getElementById("plant-specs");
  if (!container) return;
  container.innerHTML = specs
    .map(([k, v]) => `<div class="spec-row"><span class="spec-key">${k}</span><span class="spec-val">${v}</span></div>`)
    .join("");
}

/** Populate month scrubber options */
function populateMonthScrubber() {
  const sel = document.getElementById("month-select");
  if (!sel) return;
  MONTH_NAMES.forEach((name, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = name;
    if (i === currentMonth) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener("change", (e) => {
    runDaySimulation(currentLocation, parseInt(e.target.value));
  });
}

/** Wire location buttons */
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
      runSimulation(key);
      await setRealDayLocation(key, loc.dbdata);
    });
    container.appendChild(btn);
  });
}

/** Tab switching */
function initTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  const panels = document.querySelectorAll(".tab-panel");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      panels.forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      const target = document.getElementById("panel-" + tab.dataset.tab);
      if (target) target.classList.add("active");
    });
  });
}

/** Main entry point — call after DOM ready */
export function init() {
  populatePlantSpecs();
  populateLocationButtons();
  populateMonthScrubber();
  initTabs();

  // Initialize charts after DOM is ready

  initRealDayPanel();
  dayChart      = initDayChart("chart-day", simulateDay(currentLocation, currentMonth));
  const initResult = simulateYear(currentLocation);
  annualChart   = initAnnualChart("chart-annual", initResult.monthly);
  sunGraphChart = initSunGraphChart("chart-sun-graph", yearSunTimes(LOCATIONS[currentLocation]), LOCATIONS[currentLocation]);

  waterfallChart = initWaterfallChart("chart-waterfall", lossWaterfall(initResult));

  // Run initial simulation
  runSimulation(currentLocation);
}
