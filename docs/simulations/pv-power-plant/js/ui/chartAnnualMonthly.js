import { baseChartOptions, TOOLTIP_DEFAULTS } from "./chartBase.js";

const COLORS = {
  ac:   "#4ade80",
  dc:   "#60a5fa",
  poa:  "#facc15",
  ghi:  "#28dbff",
  acMean: "rgba(74,222,128,0.9)",
  grid: "rgba(148,163,184,0.12)",
  text: "#94a3b8",
};

// ─── #chart-annual — annual simulation monthly totals (MWh) ───────────────────

export function initAnnualChart(canvasId) {
  const ctx = document.getElementById(canvasId).getContext("2d");
  const opts = baseChartOptions();
  opts.scales = {
    x: { grid: { color: COLORS.grid }, ticks: { color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 10 } } },
    y: {
      title: { display: true, text: "Energy  [MWh]", color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 11 } },
      grid: { color: COLORS.grid },
      ticks: { color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 10 } },
      min: 0,
    },
  };
  return new Chart(ctx, { type: "bar", options: opts });
}

export function updateAnnualChart(chart, monthly) {
  chart.data = buildAnnualData(monthly);
  chart.update("none");
}

function buildAnnualData(monthly) {
  return {
    labels: monthly.map(m => m.name),
    datasets: [
      {
        label: "GHI in",
        data: monthly.map(m => parseFloat(m.ghi_kWh.toFixed(1))),
        backgroundColor: "#12627265",
        borderColor: COLORS.ghi,
        borderWidth: 1,
        borderRadius: 3,
        type: "bar",
      },
      {
        label: "POA in",
        data: monthly.map(m => parseFloat(m.poa_kWh.toFixed(1))),
        backgroundColor: "#79630d62",
        borderColor: COLORS.poa,
        borderWidth: 1,
        borderRadius: 3,
        type: "bar",
      }
    ],
  };
}

// ─── #chart-realday-annual — real-day monthly summary (kWh + peak AC) ─────────

export function initAnnualSummaryChart(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) return null;

  const ctx = canvas.getContext("2d");
  return new window.Chart(ctx, {
    type: "bar",
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: { color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 11 }, boxWidth: 12, padding: 14 },
        },
        tooltip: { ...TOOLTIP_DEFAULTS },
      },
      scales: {
        x: {
          grid: { color: COLORS.grid },
          ticks: { color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 10 } },
        },
        yEnergy: {
          type: "linear", position: "left",
          title: { display: true, text: "Daily energy [kWh]", color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 11 } },
          grid: { color: COLORS.grid },
          ticks: { color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 10 } },
          min: 0,
        },
        yPower: {
          type: "linear", position: "right",
          title: { display: true, text: "Peak AC [kW]", color: COLORS.acMean, font: { family: "'IBM Plex Mono', monospace", size: 11 } },
          grid: { display: false },
          ticks: { color: COLORS.acMean, font: { family: "'IBM Plex Mono', monospace", size: 10 } },
          min: 0,
        },
      },
    },
  });
}

export function updateAnnualSummaryChart(chart, summary) {
  chart.data = buildAnnualSummaryData(summary);
  chart.update("none");
}

function buildAnnualSummaryData(summary) {
  return {
    labels: summary.map(m => m.name),
    datasets: [
      {
        label: "AC energy",
        data: summary.map(m => +m.energyAc_kWh.toFixed(1)),
        backgroundColor: "rgba(74,222,128,0.8)",
        borderColor: COLORS.acMean,
        borderWidth: 1,
        borderRadius: 3,
        yAxisID: "yEnergy",
      },
      {
        label: "DC energy",
        data: summary.map(m => +m.energyDc_kWh.toFixed(1)),
        backgroundColor: "rgba(96,165,250,0.8)",
        borderColor: COLORS.dc,
        borderWidth: 1,
        borderRadius: 3,
        yAxisID: "yEnergy",
      },
      {
        label: "Peak AC",
        data: summary.map(m => +m.peakAc_kW.toFixed(1)),
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
