/**
 * realdaypanel.js
 * Controller for the "Real Data" tab panel.
 *
 * Owns:
 *  - Loading and caching of NSRDB dataset
 *  - Month selector, tilt slider, azimuth slider, time-of-day scrubber
 *  - Chart.js dual-axis chart (irradiance bands + power output)
 *  - KPI metric cards for the real-data view
 *  - Handshake with scene3d.js (sun position + panel orientation)
 */

import { loadNSRDB, aggregateMonth } from "../core/nsrdb.js";
import { processMonthProfile, dailyTotals } from "../models/realday.js";
import { MONTH_NAMES } from "../core/climate.js";
import { initScene, updatePanelOrientation, setTimeOfDay, disposeScene } from "./scene3d.js";
import { PLANT } from "../core/plant.js";

const NSRDB_PATH = "./data/nsrdb_phoenix_local.csv";

// Module state
let dataset     = null;   // parsed NSRDB dataset
let currentLocation = "phoenix";
let currentMonth = 6;     // 1-12
let currentTilt  = 25;    // degrees
let currentAz    = 180;   // degrees from north
let currentHour  = 12;    // 0-23 for time scrubber
let rdChart      = null;
let annualSummaryChart = null;
let annualByDayChart = null;
let hourlyProfile = null; // processMonthProfile output for current settings
let panelInitialized = false;
let tracking = false;

const COLORS = {
  ghiMean:  "rgba(250,204,21,0.9)",
  ghiBand:  "rgba(250,204,21,0.15)",
  poaMean:  "rgba(96,165,250,0.9)",
  poaBand:  "rgba(96,165,250,0.12)",
  acMean:   "rgba(74,222,128,0.9)",
  acBand:   "rgba(74,222,128,0.12)",
  tCell:    "rgba(251,146,60,0.8)",
  grid:     "rgba(148,163,184,0.10)",
  text:     "#c8def7",
};

export async function initRealDayPanel(dataPath = NSRDB_PATH) {

  try {
    dataset = await loadNSRDB(dataPath);
    populateDatasetInfo();
  } catch (err) {
    return;
  }

  buildControls();
  buildChart();
  buildAnnualSummaryChart();
  buildAnnualByDayChart();
  buildMetricCards();
  buildScene();
  panelInitialized = true;
  await runUpdate();
}

export async function setRealDayLocation(locationKey, dataPath) {
  currentLocation = locationKey;

  if (!dataPath) {
    showStatus("No real-day dataset available for this location.");
    return;
  }

  try {
    const newDataset = await loadNSRDB(dataPath);
    dataset = newDataset;
    showStatus(null);
    populateDatasetInfo();
    if (!panelInitialized) {
      buildControls();
      buildChart();
      buildMetricCards();
      buildScene();
      panelInitialized = true;
    } else if (!rdChart) {
      buildChart();
    }
    if (!annualSummaryChart) buildAnnualSummaryChart();
    await runUpdate();
  } catch (err) {
    showStatus("Failed to load real-day data for this location.");
    console.warn(err);
  }
}

// ─────────────────────────────────────────────────────
//  Controls
// ─────────────────────────────────────────────────────
function buildControls() {
  // Month select
  const monthSel = document.getElementById("rd-month");
  if (monthSel) {
    monthSel.innerHTML = MONTH_NAMES.map((n, i) =>
      `<option value="${i+1}" ${i+1===currentMonth?"selected":""}>${n}</option>`
    ).join("");
    monthSel.addEventListener("change", e => { currentMonth = +e.target.value; runUpdate(); });
  }

  // Tilt slider
  const tiltSlider = document.getElementById("rd-tilt");
  const tiltVal    = document.getElementById("rd-tilt-val");
  if (tiltSlider) {
    tiltSlider.value = currentTilt;
    tiltSlider.addEventListener("input", e => {
      currentTilt = +e.target.value;
      if (tiltVal) tiltVal.textContent = currentTilt + "°";
      updatePanelOrientation(currentTilt, currentAz);
      runUpdate();
    });
  }

  // Azimuth slider
  const azSlider = document.getElementById("rd-azimuth");
  const azVal    = document.getElementById("rd-az-val");
  if (azSlider) {
    azSlider.value = currentAz;
    azSlider.addEventListener("input", e => {
      currentAz = +e.target.value;
      if (azVal) azVal.textContent = currentAz + "°  " + compassLabel(currentAz);
      updatePanelOrientation(currentTilt, currentAz);
      runUpdate();
    });
  }

  //Tracking select
  const trackSel = document.getElementById("rd-track");
  if (trackSel) {
    trackSel.addEventListener("change", e => { tracking = +e.target.value == 1; runUpdate(); });
  }

  // Time-of-day scrubber
  const timeSlider = document.getElementById("rd-hour");
  const timeVal    = document.getElementById("rd-hour-val");
  if (timeSlider) {
    timeSlider.value = currentHour;
    timeSlider.addEventListener("input", e => {
      currentHour = +e.target.value;
      if (timeVal) timeVal.textContent = hourLabel(currentHour);
      const totals = dailyTotals(hourlyProfile);
      updateMetrics(totals, hourlyProfile);
      if (hourlyProfile) {
        setTimeOfDay(currentHour, hourlyProfile);
        if (tracking) {
          currentTilt = hourlyProfile[currentHour].panelTilt;
          currentAz= hourlyProfile[currentHour].panelAz;
          tiltSlider.value = currentTilt;
          azSlider.value = currentAz;
          tiltVal.textContent = currentTilt.toFixed(0) + "°";
          azVal.textContent = currentAz.toFixed(0) + "°  " + compassLabel(currentAz);
          updatePanelOrientation(currentTilt, currentAz);
        }
      }
      // runUpdate();
      highlightHour(currentHour);
    });
  }
}

function compassLabel(deg) {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function hourLabel(h) {
  return `${String(h).padStart(2,"0")}:00`;
}

// ─────────────────────────────────────────────────────
//  Chart
// ─────────────────────────────────────────────────────
function buildChart() {
  const canvas = document.getElementById("chart-realday");
  if (!canvas || !window.Chart) return;

  // Pin canvas dimensions explicitly BEFORE Chart.js measures the container.
  // Without this, Chart.js reads the flex parent's unconstrained height on each
  // animation frame and grows the canvas infinitely.
  canvas.style.position = "absolute";
  canvas.style.top      = "0";
  canvas.style.left     = "0";
  canvas.style.width    = "100%";
  canvas.style.height   = "100%";

  const ctx = canvas.getContext("2d");
  const labels = Array.from({length:24}, (_,i) => hourLabel(i));

  rdChart = new window.Chart(ctx, {
    type: "line",
    data: { labels, datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: { 
            color: COLORS.text, 
            font: { family: "'IBM Plex Mono', monospace", size: 11 }, boxWidth: 12, padding: 14,
            filter: item => !(item.text.includes('min'))
          },
        },
        tooltip: {
          backgroundColor: "#0f172a",
          titleColor: "#e2e8f0",
          bodyColor: "#94a3b8",
          borderColor: "#1e293b",
          borderWidth: 1,
          titleFont: { family: "'IBM Plex Mono', monospace", size: 11 },
          bodyFont:  { family: "'IBM Plex Mono', monospace", size: 11 },
          padding: 10,
        },
        verticalLine: {
          timeOfDay: 15,
        },
      },
      scales: {
        x: {
          grid: { color: COLORS.grid },
          ticks: { color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 10 }, maxTicksLimit: 13 },
        },
        yIrrad: {
          type: "linear", position: "left",
          title: { display: true, text: "Irradiance  [W/m²]", color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 11 } },
          grid: { color: COLORS.grid },
          ticks: { color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 10 } },
          min: 0,
          max: 1200,
        },
        yPower: {
          type: "linear", position: "right",
          title: { display: true, text: "AC Power  [kW]", color: COLORS.acMean, font: { family: "'IBM Plex Mono', monospace", size: 11 } },
          grid: { display: false },
          ticks: { color: COLORS.acMean, font: { family: "'IBM Plex Mono', monospace", size: 10 } },
          min: 0,
          max: PLANT.acCapacityKw + 50,
        },
      },
    },
    plugins: [
      {
        id: 'verticalLine',
        afterDraw(chart, args, options) {
          const { ctx, chartArea, scales } = chart;
          const xScale = scales.x;

          const xValue = options.timeOfDay;
          if (xValue == null) return;

          const x = xScale.getPixelForValue(xValue);

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(x, chartArea.top);
          ctx.lineTo(x, chartArea.bottom);
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#ecf0f6';
          ctx.stroke();
          ctx.restore();
        }
      }]
  });

}

function buildChartDatasets(profile) {
  const get = (key, sub) => profile.map(h => {
    const v = sub ? h[key]?.[sub] : h[key];
    return v != null ? +v.toFixed(1) : 0;
  });
  const lineTension = 0.25;

  return [
    // GHI band (min→max)
    {
      label: "GHI max",
      data: get("ghi", "max"),
      borderColor: "transparent",
      backgroundColor: COLORS.ghiBand,
      fill: "+1",
      tension: lineTension,
      pointRadius: 0,
      yAxisID: "yIrrad",
      order: 10,
    },
    {
      label: "GHI min",
      data: get("ghi", "min"),
      borderColor: "transparent",
      backgroundColor: COLORS.ghiBand,
      fill: false,
      tension: lineTension,
      pointRadius: 0,
      yAxisID: "yIrrad",
      order: 10,
    },
    {
      label: "GHI mean",
      data: get("ghi", "mean"),
      borderColor: COLORS.ghiMean,
      backgroundColor: "transparent",
      fill: false,
      tension: lineTension,
      pointRadius: 0,
      borderWidth: 2,
      yAxisID: "yIrrad",
      order: 3,
    },
    // POA band
    {
      label: "POA max",
      data: profile.map(h => h.max ? +h.max.poa.toFixed(1) : 0),
      borderColor: "transparent",
      backgroundColor: COLORS.poaBand,
      fill: "+1",
      tension: lineTension,
      pointRadius: 0,
      yAxisID: "yIrrad",
      order: 9,
    },
    {
      label: "POA min",
      data: profile.map(h => h.min ? +h.min.poa.toFixed(1) : 0),
      borderColor: "transparent",
      backgroundColor: COLORS.poaBand,
      fill: false,
      tension: lineTension,
      pointRadius: 0,
      yAxisID: "yIrrad",
      order: 9,
    },
    {
      label: "POA mean",
      data: profile.map(h => h.mean ? +h.mean.poa.toFixed(1) : 0),
      borderColor: COLORS.poaMean,
      backgroundColor: "transparent",
      fill: false,
      tension: lineTension,
      pointRadius: 0,
      borderWidth: 2,
      borderDash: [4, 3],
      yAxisID: "yIrrad",
      order: 2,
    },
    // AC output band
    {
      label: "AC max",
      data: profile.map(h => h.max ? +h.max.acOutput_kW.toFixed(1) : 0),
      borderColor: "transparent",
      backgroundColor: COLORS.acBand,
      fill: "+1",
      tension: lineTension,
      pointRadius: 0,
      yAxisID: "yPower",
      order: 8,
    },
    {
      // label: "AC min",
      label: "AC min",
      data: profile.map(h => h.min ? +h.min.acOutput_kW.toFixed(1) : 0),
      borderColor: "transparent",
      backgroundColor: COLORS.acBand,
      fill: false,
      tension: lineTension,
      pointRadius: 0,
      yAxisID: "yPower",
      order: 8,
    },
    {
      label: "AC mean",
      data: profile.map(h => h.mean ? +h.mean.acOutput_kW.toFixed(1) : 0),
      borderColor: COLORS.acMean,
      segment: {
        borderColor: ctx => {
          const { p0, p1 } = ctx;
          return (p0.parsed.y >= PLANT.acCapacityKw && p1.parsed.y >= PLANT.acCapacityKw) ? 'red' : COLORS.acMean;
        }
      },
      backgroundColor: COLORS.acBand,
      fill: false,
      tension: lineTension,
      pointRadius: 0,
      borderWidth: 2.5,
      yAxisID: "yPower",
      order: 1,
    },
  ];
}

function highlightHour(hour) {
  if (!rdChart) return;
  rdChart.options.plugins.verticalLine.timeOfDay = hour;
  rdChart.update("none");
}

// ─────────────────────────────────────────────────────
//  Metric cards
// ─────────────────────────────────────────────────────
function buildMetricCards() {
  // Cards are already in HTML; just update text content
}

function updateMetrics(totals, profile) {
  const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const f = (v, d=1) => isNaN(v) ? "—" : v.toLocaleString("en-US", {maximumFractionDigits: d, minimumFractionDigits: d});

  s("rd-kpi-ac",    f(totals.energyAc_kWh, 0) + " kWh");
  s("rd-kpi-dc",    f(totals.energyDc_kWh, 0) + " kWh");
  s("rd-kpi-peak",  f(totals.peakAc_kW, 0)    + " kW");
  s("rd-kpi-poa",   f(totals.peakPoa_Wm2, 0)  + " W/m²");
  s("rd-kpi-pr",    f(totals.pr, 1)            + " %");

  // Hour-specific
  if (profile && profile[currentHour]) {
    const h = profile[currentHour];
    s("rd-kpi-hour-ghi",  f(h.ghi.mean, 0) + " W/m²");
    s("rd-kpi-hour-poa",  f(h.mean.poa, 0) + " W/m²");
    s("rd-kpi-hour-ac",   f(h.mean.acOutput_kW, 1) + " kW");
    s("rd-kpi-hour-tcell",f(h.mean.tCell, 1) + " °C");
    s("rd-kpi-hour-alt",  f(h.altDeg, 1) + "°");
    s("rd-kpi-hour-az",   f(h.azDeg, 1) + "°");
  }
}

function computeAnnualEstimates(summary) {
  const year = dataset?.records[0]?.Year ?? new Date().getFullYear();
  const daysInMonth = (month) => {
    const m = month;
    const leap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    const dayCounts = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return dayCounts[m - 1];
  };

  const annualAc_kWh = summary.reduce((sum, m) => sum + (m.energyAc_kWh * daysInMonth(m.month)), 0);
  const annualDc_kWh = summary.reduce((sum, m) => sum + (m.energyDc_kWh * daysInMonth(m.month)), 0);
  const averagePr = summary.length ? summary.reduce((sum, m) => sum + m.pr, 0) / summary.length : 0;

  return {
    annualAc_MWh: annualAc_kWh / 1000,
    annualDc_MWh: annualDc_kWh / 1000,
    averagePr,
  };
}

function buildAnnualSummaryChart() {
  const canvas = document.getElementById("chart-realday-annual");
  if (!canvas || !window.Chart) return;

  canvas.style.position = "absolute";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";

  const ctx = canvas.getContext("2d");
  annualSummaryChart = new window.Chart(ctx, {
    type: "bar",
    data: buildAnnualSummaryData(computeAnnualSummary()),
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: { color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 11 }, boxWidth: 12, padding: 14 },
        },
        tooltip: {
          backgroundColor: "#0f172a",
          titleColor: "#e2e8f0",
          bodyColor: "#94a3b8",
          borderColor: "#1e293b",
          borderWidth: 1,
          titleFont: { family: "'IBM Plex Mono', monospace", size: 11 },
          bodyFont:  { family: "'IBM Plex Mono', monospace", size: 11 },
          padding: 10,
        },
      },
      scales: {
        x: {
          grid: { color: COLORS.grid },
          ticks: { color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 10 } },
        },
        yEnergy: {
          type: "linear",
          position: "left",
          title: { display: true, text: "Daily energy [kWh]", color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 11 } },
          grid: { color: COLORS.grid },
          ticks: { color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 10 } },
          min: 0,
        },
        yPower: {
          type: "linear",
          position: "right",
          title: { display: true, text: "Peak AC [kW]", color: COLORS.acMean, font: { family: "'IBM Plex Mono', monospace", size: 11 } },
          grid: { display: false },
          ticks: { color: COLORS.acMean, font: { family: "'IBM Plex Mono', monospace", size: 10 } },
          min: 0,
        },
      },
    },
  });
}

function computeAnnualSummary() {
  if (!dataset) return [];
  const year = dataset.records[0]?.Year ?? 2023;
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const hourlyAgg = aggregateMonth(dataset.byMonth, month);
    const profile = processMonthProfile(
      hourlyAgg,
      dataset.lat, dataset.lon,
      month, year, dataset.timezone,
      currentTilt, currentAz,
      window.SunCalc,
      tracking
    );
    const totals = dailyTotals(profile);
    return {
      month,
      name: MONTH_NAMES[index],
      energyAc_kWh: totals.energyAc_kWh,
      energyDc_kWh: totals.energyDc_kWh,
      peakAc_kW: totals.peakAc_kW,
      pr: totals.pr,
    };
  });
}

function buildAnnualSummaryData(summary) {
  return {
    labels: summary.map((m) => m.name),
    datasets: [
      {
        label: "AC energy",
        data: summary.map((m) => +m.energyAc_kWh.toFixed(1)),
        backgroundColor: "rgba(74,222,128,0.8)",
        borderColor: COLORS.acMean,
        borderWidth: 1,
        borderRadius: 3,
        yAxisID: "yEnergy",
      },
      {
        label: "DC energy",
        data: summary.map((m) => +m.energyDc_kWh.toFixed(1)),
        backgroundColor: "rgba(96,165,250,0.8)",
        borderColor: "#60a5fa",
        borderWidth: 1,
        borderRadius: 3,
        yAxisID: "yEnergy",
      },
      {
        label: "Peak AC",
        data: summary.map((m) => +m.peakAc_kW.toFixed(1)),
        type: "line",
        borderColor: COLORS.acMean,
        backgroundColor: COLORS.acMean,
        fill: false,
        tension: 0.4,
        pointRadius: 3,
        yAxisID: "yPower",
      },
    ],
  };
}

function updateAnnualSummaryChart(chart, summary = null) {
  const annualSummary = summary || computeAnnualSummary();
  chart.data = buildAnnualSummaryData(annualSummary);
  chart.update("none");
  updateAnnualKPIs(annualSummary);
}

function updateAnnualKPIs(summary) {
  const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const f = (v, d=1) => isNaN(v) ? "—" : v.toLocaleString("en-US", {maximumFractionDigits: d, minimumFractionDigits: d});
  const annualEstimates = computeAnnualEstimates(summary);

  s("rd-kpi-annual-ac", f(annualEstimates.annualAc_MWh, 0) + " MWh/yr");
  s("rd-kpi-annual-dc", f(annualEstimates.annualDc_MWh, 0) + " MWh/yr");
  s("rd-kpi-annual-pr", f(annualEstimates.averagePr, 1) + " %");
}

function buildAnnualByDayChart() {
  const canvas = document.getElementById("chart-realday-annual-by-day");
  if (!canvas || !window.Chart) return;

  canvas.style.position = "absolute";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";

  const ctx = canvas.getContext("2d");
  const dayLabels = dataset.byDay.map((d) => `${MONTH_NAMES[d.month - 1]} ${d.day}`);
  annualByDayChart = new window.Chart(ctx, {
    type: "line",
    data: {
      labels: dayLabels, 
      datasets: buildAnnualByDayData()
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: { color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 11 }, boxWidth: 12, padding: 14 },
        },
        tooltip: {
          backgroundColor: "#0f172a",
          titleColor: "#e2e8f0",
          bodyColor: "#94a3b8",
          borderColor: "#1e293b",
          borderWidth: 1,
          titleFont: { family: "'IBM Plex Mono', monospace", size: 11 },
          bodyFont:  { family: "'IBM Plex Mono', monospace", size: 11 },
          padding: 10,
        },
      },
      scales: {
        x: {
          type: 'category',
          grid: { color: COLORS.grid },
          ticks: { color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 10 } , autoSkip: false,
            callback: function(value, index) {
              const label = this.getLabelForValue(value);
              return label.endsWith('15') ? label.slice(0, 3) : null;
            } 
          },
        },
        yEnergy: {
          type: "linear",
          position: "left",
          title: { display: true, text: "Daily energy [kWh]", color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 11 } },
          grid: { color: COLORS.grid },
          ticks: { color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 10 } },
          min: 0,
        },
        yPower: {
          type: "linear",
          position: "right",
          title: { display: true, text: "Peak AC [kW]", color: COLORS.acMean, font: { family: "'IBM Plex Mono', monospace", size: 11 } },
          grid: { display: false },
          ticks: { color: COLORS.acMean, font: { family: "'IBM Plex Mono', monospace", size: 10 } },
          min: 0,
        },
        percent: {
          type: "linear",
          // position: "right",
          // title: { display: true, text: "Peak AC [kW]", color: COLORS.acMean, font: { family: "'IBM Plex Mono', monospace", size: 11 } },
          // grid: { display: false },
          // ticks: { color: COLORS.acMean, font: { family: "'IBM Plex Mono', monospace", size: 10 } },
          min: 0,
          max: 1,
        },
      },
    },
  });
}

function buildAnnualByDayData() {
  const days = Array.from({ length: 365 }, () => ({ghiTotal: 0, dniTotal:0, dniMax: 0, dhiTotal: 0}));
  const byDay = dataset.byDay;
  for (let i = 0; i < 365; i++) {
    const d = byDay[i]
      const day = days[i]
    for (const r of d.rs) {
      const ghi = r["GHI"];
      day.ghiTotal += ghi;
      const dni = r["DNI"];
      day.dniTotal += dni;
      day.dhiTotal += r["DHI"];
      day.dniMax = Math.max(day.dniMax, dni);
    }
      day.cloudCover = day.dhiTotal / day.ghiTotal;
  }
  return [
      {
        label: "Daily GHI energy",
        data: days.map((d) => d.ghiTotal),
        backgroundColor: COLORS.ghiBand,
        borderColor: COLORS.ghiMean,
        borderWidth: 2,
        pointRadius: 0,
        yAxisID: "yEnergy",
      },
      {
        label: "Daily DNI energy",
        data: days.map((d) => d.dniTotal),
        backgroundColor: '#0dea2b7d',
        borderColor: '#0dea2b',
        borderWidth: 2,
        pointRadius: 0,
        yAxisID: "yEnergy",
      },
      {
        label: "Daily DNI max",
        data: days.map((d) => d.dniMax),
        backgroundColor: '#bd303097',
        borderColor: '#ea0d0d',
        borderWidth: 2,
        pointRadius: 0,
        yAxisID: "yPower",
      },
      {
        label: "Cloud Cover",
        data: days.map((d) => d.cloudCover),
        backgroundColor: '#79797997',
        borderColor: '#959595',
        borderWidth: 2,
        pointRadius: 0,
        yAxisID: "percent",
      },
    ];
}

// ─────────────────────────────────────────────────────
//  3D Scene
// ─────────────────────────────────────────────────────
function buildScene() {
  const canvas = document.getElementById("canvas-3d");
  if (!canvas || !window.THREE) return;
  initScene(canvas);
  updatePanelOrientation(currentTilt, currentAz);
}

// ─────────────────────────────────────────────────────
//  Core update cycle
// ─────────────────────────────────────────────────────
async function runUpdate() {
  if (!dataset) return;
  const agg = aggregateMonth(dataset.byMonth, currentMonth);

  const year = dataset.records[0]?.Year ?? 2023;
  hourlyProfile = processMonthProfile(
    agg,
    dataset.lat, dataset.lon,
    currentMonth, year, dataset.timezone,
    currentTilt, currentAz,
    window.SunCalc,
    tracking
  );

  if (rdChart) {
    rdChart.data.datasets = buildChartDatasets(hourlyProfile);
    rdChart.update('none');
  }

  const totals = dailyTotals(hourlyProfile);
  updateMetrics(totals, hourlyProfile);

  if (annualSummaryChart) {
    const annualSummary = computeAnnualSummary();
    updateAnnualSummaryChart(annualSummaryChart, annualSummary);
  }

  if (annualByDayChart) {
    annualByDayChart.data.datasets = buildAnnualByDayData();
    annualByDayChart.update("none");
  }

  // Sync 3D scene to current hour
  setTimeOfDay(currentHour, hourlyProfile);
  updatePanelOrientation(currentTilt, currentAz);
  console.log("core update run");
}

// ─────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────
function showStatus(msg, isError = false) {
  const el = document.getElementById("rd-status");
  if (!el) return;
  el.textContent = msg ?? "";
  el.style.display = msg ? "block" : "none";
  el.style.color = isError ? "#f87171" : "#7a97b8";
}


function populateDatasetInfo() {
  const el = document.getElementById("rd-dataset-info");
  if (!el || !dataset) return;
  const { lat, lon, timezone, elevation, meta } = dataset;
  el.textContent =
    `  ·  ${Math.abs(lat).toFixed(2)}° ${lat>=0?"N":"S"}, ${Math.abs(lon).toFixed(2)}° ${lon>=0?"E":"W"}` +
    `  ·  ${elevation}m elev  ·  UTC${timezone >= 0 ? "+" : ""}${timezone}`;
}
