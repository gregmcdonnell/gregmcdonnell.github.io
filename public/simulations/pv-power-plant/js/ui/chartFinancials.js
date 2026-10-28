/**
 * chartFinancials.js
 * Two-chart financials panel:
 *   1. Annual energy yield (bar) — 25 years with degradation visible
 *   2. Cumulative cash flow (line) — from -CapEx to final project value
 */

import { baseChartOptions, TOOLTIP_DEFAULTS } from "./chartBase.js";

const MONO = "'IBM Plex Mono', monospace";

const AXIS_STYLE = {
  grid:  { color: "rgba(148,163,184,0.10)" },
  ticks: { color: "#8daed3", font: { family: MONO, size: 10 } },
};

// ─── Energy yield chart ───────────────────────────────────────────────────────

export function initEnergyYieldChart(canvasId) {
  const ctx = document.getElementById(canvasId)?.getContext("2d");
  if (!ctx) return null;

  const opts = baseChartOptions();
  return new Chart(ctx, {
    type: "bar",
    data: { labels: [], datasets: [] },
    options: {
      ...opts,
      plugins: {
        ...opts.plugins,
        legend: { display: false },
        tooltip: {
          ...TOOLTIP_DEFAULTS,
          callbacks: {
            label: (item) => ` ${item.parsed.y.toFixed(1)} MWh`,
          },
        },
      },
      scales: {
        x: {
          ...AXIS_STYLE,
          title: { display: true, text: "Year", color: "#8b949e", font: { family: MONO, size: 10 } },
        },
        y: {
          ...AXIS_STYLE,
          title: { display: true, text: "Annual AC energy (MWh)", color: "#8b949e", font: { family: MONO, size: 10 } },
          beginAtZero: true,
        },
      },
    },
  });
}

export function updateEnergyYieldChart(chart, years) {
  if (!chart) return;
  chart.data.labels   = years.map(y => `${y.year}`);
  chart.data.datasets = [{
    label: "Annual AC energy",
    data:  years.map(y => +y.energy_MWh.toFixed(2)),
    backgroundColor: years.map((_, i) =>
      i < 5  ? "rgba(74,222,128,0.80)"  :   // early years — full green
      i < 15 ? "rgba(74,222,128,0.60)"  :   // mid life
               "rgba(74,222,128,0.40)"       // late life — faded to show degradation
    ),
    borderColor:     "rgba(74,222,128,0.0)",
    borderRadius:    2,
  }];
  chart.update("none");
}

// ─── Cumulative cash flow chart ───────────────────────────────────────────────

export function initCashFlowChart(canvasId) {
  const ctx = document.getElementById(canvasId)?.getContext("2d");
  if (!ctx) return null;

  const opts = baseChartOptions();
  return new Chart(ctx, {
    type: "line",
    data: { labels: [], datasets: [] },
    options: {
      ...opts,
      plugins: {
        ...opts.plugins,
        legend: { display: false },
        tooltip: {
          ...TOOLTIP_DEFAULTS,
          callbacks: {
            label: (item) => {
              const v = item.parsed.y;
              const m = (v / 1e6).toFixed(2);
              return ` ${v >= 0 ? "+" : ""}$${m}M`;
            },
          },
        },
      },
      scales: {
        x: {
          ...AXIS_STYLE,
          title: { display: true, text: "Year", color: "#8b949e", font: { family: MONO, size: 10 } },
        },
        y: {
          ...AXIS_STYLE,
          title: { display: true, text: "Cumulative cash flow ($)", color: "#8b949e", font: { family: MONO, size: 10 } },
          ticks: {
            ...AXIS_STYLE.ticks,
            callback: (v) => `$${(v / 1e6).toFixed(1)}M`,
          },
        },
      },
    },
  });
}

export function updateCashFlowChart(chart, capex, years) {
  if (!chart) return;

  // Point 0 = year 0 (capex outlay)
  const labels = ["0", ...years.map(y => `${y.year}`)];
  const values = [-capex, ...years.map(y => y.cumulativeCashFlow_usd)];

  // Build gradient fill: below-zero = red tint, above-zero = green tint
  // We use two separate fill datasets + a zero line annotation approximated
  // by splitting at the zero crossing. Simpler: single dataset with conditional colours.

  chart.data.labels   = labels;
  chart.data.datasets = [
    {
      label: "Cumulative cash flow",
      data:  values,
      borderColor:     values.map(v => v >= 0 ? "#4ade80" : "#f87171"),
      backgroundColor: "transparent",
      pointRadius:     2,
      pointHoverRadius: 5,
      pointBackgroundColor: values.map(v => v >= 0 ? "#4ade80" : "#f87171"),
      borderWidth:     2,
      tension:         0.35,
      segment: {
        borderColor: (ctx) => ctx.p1.parsed.y >= 0 ? "#4ade80" : "#f87171",
      },
    },
    {
      // Zero reference line
      label: "Break-even",
      data:  labels.map(() => 0),
      borderColor:   "rgba(148,163,184,0.25)",
      borderWidth:   1,
      borderDash:    [4, 4],
      pointRadius:   0,
      tension:       0,
    },
  ];
  chart.update("none");
}
