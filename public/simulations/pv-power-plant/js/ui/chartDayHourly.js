import { TOOLTIP_DEFAULTS } from "./chartBase.js";
import { PLANT } from "../core/plant.js";

const COLORS = {
  ghiMean: "rgba(250,204,21,0.9)",
  ghiBand: "rgba(250,204,21,0.15)",
  poaMean: "rgba(96,165,250,0.9)",
  poaBand: "rgba(96,165,250,0.12)",
  acMean:  "rgba(74,222,128,0.9)",
  acBand:  "rgba(74,222,128,0.12)",
  temp:    "rgba(250, 123, 0, 0.9)",
  grid:    "rgba(148,163,184,0.10)",
  text:    "#c8def7",
};

function hourLabel(h) {
  return `${String(h).padStart(2, "0")}:00`;
}

export function initDayHourlyChart(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) return null;

  const ctx = canvas.getContext("2d");
  const labels = Array.from({ length: 24 }, (_, i) => hourLabel(i));

  return new window.Chart(ctx, {
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
            font: { family: "'IBM Plex Mono', monospace", size: 11 },
            boxWidth: 12,
            padding: 14,
            filter: item => item.text && item.text.length > 0
          },
        },
        tooltip: { ...TOOLTIP_DEFAULTS, filter: (context) => !(!context.dataset.label || context.dataset.label.includes("Range")) },
        verticalLine: { timeOfDay: 12 },
      },
      scales: {
        x: {
          grid: { color: COLORS.grid },
          ticks: {
            color: COLORS.text,
            font: { family: "'IBM Plex Mono', monospace", size: 10 },
            maxTicksLimit: 13,
          },
        },
        yIrrad: {
          type: "linear", position: "left",
          title: { display: true, text: "Irradiance  [W/m²]", color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 11 } },
          grid: { color: COLORS.grid },
          ticks: { color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 10 } },
          min: 0, max: 1200,
        },
        yPower: {
          type: "linear", position: "right",
          title: { display: true, text: "AC Power  [kW]", color: COLORS.acMean, font: { family: "'IBM Plex Mono', monospace", size: 11 } },
          grid: { display: false },
          ticks: { color: COLORS.acMean, font: { family: "'IBM Plex Mono', monospace", size: 10 } },
          min: 0, max: PLANT.acCapacityKw + 50,
        },
        temp: { type: "linear", position: "right", display: false, min: -12, max: 70 }
      },
    },
    plugins: [{
      id: "verticalLine",
      afterDraw(chart, _args, options) {
        const { ctx: c, chartArea, scales } = chart;
        if (options.timeOfDay == null) return;
        const x = scales.x.getPixelForValue(options.timeOfDay);
        c.save();
        c.beginPath();
        c.moveTo(x, chartArea.top);
        c.lineTo(x, chartArea.bottom);
        c.lineWidth = 2;
        c.strokeStyle = "#ecf0f6";
        c.stroke();
        c.restore();
      },
    }],
  });
}

export function updateDayHourlyChart(chart, profile) {
  chart.data.datasets = buildDatasets(profile);
  chart.update("none");
}

export function setDayHourlyMarker(chart, hour) {
  chart.options.plugins.verticalLine.timeOfDay = hour;
  chart.update("none");
}

export function changeYScaleMax(chart, max) {
  chart.options.scales.yPower.max = max;
}

function buildDatasets(profile) {
  const get = (key, sub) => profile.map(h => {
    const v = sub ? h[key]?.[sub] : h[key];
    return v != null ? +v.toFixed(1) : 0;
  });
  const t = 0.25;

  return [
    // GHI band
    { label: "GHI Range",  data: get("ghi", "max"),  borderColor: "transparent", backgroundColor: COLORS.ghiBand, fill: "+1", tension: t, pointRadius: 0, yAxisID: "yIrrad", order: 6 },
    { label: null, data: get("ghi", "min"),  borderColor: "transparent", backgroundColor: COLORS.ghiBand, fill: false, tension: t, pointRadius: 0, yAxisID: "yIrrad", order: 6 },
    { label: "GHI mean (W/m²)", data: get("ghi", "mean"), borderColor: COLORS.ghiMean, backgroundColor: "transparent", fill: false, tension: t, pointRadius: 0, borderWidth: 2, yAxisID: "yIrrad", order: 5 },
    // POA band
    { label: "POA Range",  data: profile.map(h => h.max ? +h.max.poa.toFixed(1) : 0),  borderColor: "transparent", backgroundColor: COLORS.poaBand, fill: "+1", tension: t, pointRadius: 0, yAxisID: "yIrrad", order: 4 },
    { label: null,  data: profile.map(h => h.min ? +h.min.poa.toFixed(1) : 0),  borderColor: "transparent", backgroundColor: COLORS.poaBand, fill: false, tension: t, pointRadius: 0, yAxisID: "yIrrad", order: 4 },
    { label: "POA mean (W/m²)", data: profile.map(h => h.mean ? +h.mean.poa.toFixed(1) : 0), borderColor: COLORS.poaMean, backgroundColor: "transparent", fill: false, tension: t, pointRadius: 0, borderWidth: 2, borderDash: [4, 3], yAxisID: "yIrrad", order: 3 },
    // AC output band
    { label: "AC Range",  data: profile.map(h => h.max ? +h.max.acOutput_kW.toFixed(1) : 0),  borderColor: "transparent", backgroundColor: COLORS.acBand, fill: "+1", tension: t, pointRadius: 0, yAxisID: "yPower", order: 2 },
    { label: null,  data: profile.map(h => h.min ? +h.min.acOutput_kW.toFixed(1) : 0),  borderColor: "transparent", backgroundColor: COLORS.acBand, fill: false, tension: t, pointRadius: 0, yAxisID: "yPower", order: 2 },
    {
      label: "AC mean (kW)",
      data: profile.map(h => h.mean ? +h.mean.acOutput_kW.toFixed(1) : 0),
      borderColor: COLORS.acMean,
      segment: {
        borderColor: ctx => {
          const { p0, p1 } = ctx;
          return (Math.ceil(p0.parsed.y) >= PLANT.acCapacityKw && Math.ceil(p1.parsed.y) >= PLANT.acCapacityKw) ? "red" : COLORS.acMean;
        },
      },
      backgroundColor: COLORS.acBand,
      fill: false,
      tension: t,
      pointRadius: 0,
      borderWidth: 2.5,
      yAxisID: "yPower",
      order: 1,
    },
    {
      label: "Cell Temp (°C)",
      data: profile.map(h => h.mean ? +h.mean.tCell.toFixed(1) : 0),
      borderColor: COLORS.temp,
      fill: false,
      tension: t,
      pointRadius: 0,
      borderWidth: 2,
      borderDash: [3, 4],
      yAxisID: "temp",
      order: 10,
    },
  ];
}
