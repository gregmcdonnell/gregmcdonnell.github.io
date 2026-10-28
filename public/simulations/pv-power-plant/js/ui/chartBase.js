export const TOOLTIP_DEFAULTS = {
  backgroundColor: "#0f172a",
  titleColor: "#e2e8f0",
  bodyColor: "#94a3b8",
  borderColor: "#1e293b",
  borderWidth: 1,
  titleFont: { family: "'IBM Plex Mono', monospace", size: 11 },
  bodyFont:  { family: "'IBM Plex Mono', monospace", size: 11 },
  padding: 10,
};

export function baseChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    plugins: {
      legend: {
        labels: {
          color: "#94a3b8",
          font: { family: "'IBM Plex Mono', monospace", size: 11 },
          boxWidth: 12,
          padding: 16,
        },
      },
      tooltip: { ...TOOLTIP_DEFAULTS },
    },
    scales: {
      x: {
        grid: { color: "rgba(148,163,184,0.12)" },
        ticks: { color: "#94a3b8", font: { family: "'IBM Plex Mono', monospace", size: 10 } },
      },
    },
  };
}
