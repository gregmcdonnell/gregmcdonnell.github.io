import { baseChartOptions } from "./chartBase.js";

const COLORS = {
  ac:   "#4ade80",
  dc:   "#60a5fa",
  loss: "#f87171",
  grid: "rgba(148,163,184,0.12)",
  text: "#94a3b8",
};

export function initWaterfallChart(canvasId) {
  const ctx = document.getElementById(canvasId).getContext("2d");
  const opts = baseChartOptions();
  opts.indexAxis = "y";
  opts.scales = {
    x: {
      title: { display: true, text: "Energy  [MWh/yr]", color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 11 } },
      grid: { color: COLORS.grid },
      ticks: { color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 10 } },
      min: 0,
    },
    y: {
      grid: { display: false },
      ticks: { color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 11 } },
    },
  };
  opts.plugins.legend = { display: false };

  return new Chart(ctx, { type: "bar", options: opts });
}

export function updateWaterfallChart(chart, steps) {
  chart.data = buildWaterfallData(steps);
  chart.update("none");
}

function buildWaterfallData(steps) {
  return {
    labels: steps.map(s => s.label),
    datasets: [{
      data: steps.map(s => parseFloat((s.value / 1000).toFixed(1))),
      backgroundColor: steps.map(s =>
        s.type === "start" ? "rgba(96,165,250,0.7)"
        : s.type === "end" ? "rgba(74,222,128,0.8)"
        : "rgba(248,113,113,0.7)"
      ),
      borderColor: steps.map(s =>
        s.type === "start" ? COLORS.dc
        : s.type === "end" ? COLORS.ac
        : COLORS.loss
      ),
      borderWidth: 1,
      borderRadius: 3,
    }],
  };
}
