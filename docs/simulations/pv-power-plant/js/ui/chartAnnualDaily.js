import { TOOLTIP_DEFAULTS } from "./chartBase.js";
import { MONTH_NAMES } from "../core/climate.js";

const COLORS = {
  ghiMean: "rgba(250,204,21,0.9)",
  ghiBand: "rgba(250,204,21,0.15)",
  acMean:  "rgba(74,222,128,0.9)",
  grid:    "rgba(148,163,184,0.10)",
  text:    "#c8def7",
};

export function initAnnualDailyChart(canvasId, byDay) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) return null;

  const ctx = canvas.getContext("2d");
  const labels = byDay.map(d => `${MONTH_NAMES[d.month - 1]} ${d.day}`);

  return new window.Chart(ctx, {
    type: "line",
    data: { labels, datasets: buildAnnualDailyData(byDay) },
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
          type: "category",
          grid: { color: COLORS.grid },
          ticks: {
            color: COLORS.text,
            font: { family: "'IBM Plex Mono', monospace", size: 10 },
            autoSkip: false,
            callback(value, index) {
              const label = this.getLabelForValue(value);
              return label.endsWith("15") ? label.slice(0, 3) : null;
            },
          },
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
        percent: {
          type: "linear",
          min: 0, max: 1,
        },
      },
    },
  });
}

export function updateAnnualDailyChart(chart, byDay) {
  chart.data.datasets = buildAnnualDailyData(byDay);
  chart.update("none");
}

function buildAnnualDailyData(byDay) {
  const days = Array.from({ length: byDay.length }, () => ({ ghiTotal: 0, dniTotal: 0, dniMax: 0, dhiTotal: 0 }));
  for (let i = 0; i < byDay.length; i++) {
    const day = days[i];
    for (const r of byDay[i].rs) {
      day.ghiTotal += r["GHI"];
      day.dniTotal += r["DNI"];
      day.dhiTotal += r["DHI"];
      day.dniMax = Math.max(day.dniMax, r["DNI"]);
    }
    day.cloudCover = day.ghiTotal > 0 ? day.dhiTotal / day.ghiTotal : 0;
  }

  return [
    {
      label: "Daily GHI energy",
      data: days.map(d => d.ghiTotal),
      backgroundColor: COLORS.ghiBand,
      borderColor: COLORS.ghiMean,
      borderWidth: 2,
      pointRadius: 0,
      yAxisID: "yEnergy",
    },
    {
      label: "Daily DNI energy",
      data: days.map(d => d.dniTotal),
      backgroundColor: "#0dea2b7d",
      borderColor: "#0dea2b",
      borderWidth: 2,
      pointRadius: 0,
      yAxisID: "yEnergy",
    },
    {
      label: "Daily DNI max",
      data: days.map(d => d.dniMax),
      backgroundColor: "#bd303097",
      borderColor: "#ea0d0d",
      borderWidth: 2,
      pointRadius: 0,
      yAxisID: "yPower",
    },
    {
      label: "Cloud Cover",
      data: days.map(d => d.cloudCover),
      backgroundColor: "#79797997",
      borderColor: "#959595",
      borderWidth: 2,
      pointRadius: 0,
      yAxisID: "percent",
    },
  ];
}
