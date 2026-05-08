import { baseChartOptions, TOOLTIP_DEFAULTS } from "./chartBase.js";

const COLORS = {
  daylight:   "#9fbee9",
  night:      "#292c4d",
  solarNoon:  "#ff0000",
  text:       "#94a3b8",
};

export function initSunGraphChart(canvasId, daily, location) {
  const ctx = document.getElementById(canvasId).getContext("2d");

  const opts = baseChartOptions();
  opts.scales = {
    x: {
      grid: { display: false },
      ticks: {
        color: COLORS.text,
        font: { family: "'IBM Plex Mono', monospace", size: 10 },
        maxTicksLimit: 12,
        callback(value) {
          const label = this.getLabelForValue(value);
          return label.split(" ")[0];
        },
      },
    },
    y: {
      grid: { display: false },
      type: "linear", position: "left",
      ticks: { color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 10 } },
      min: 0, max: 24,
    },
  };
  opts.interaction = { mode: "index", intersect: false };
  opts.plugins.tooltip.displayColors = false;
  opts.plugins.tooltip.callbacks = {
    label(context) {
      const v = context.parsed.y;
      const h = Math.floor(v);
      const m = Math.round((v - h) * 60).toString().padStart(2, "0");
      return `${context.dataset.label}: ${h}:${m}`;
    },
  };

  const verticalLinePlugin = {
    id: "verticalLine",
    afterDraw(chart) {
      const { ctx: c, chartArea: { top, bottom } } = chart;
      const active = chart.tooltip?._active;
      if (!active?.length) return;
      const x = active[0].element.x;
      c.save();
      c.beginPath();
      c.moveTo(x, top);
      c.lineTo(x, bottom);
      c.lineWidth = 1;
      c.strokeStyle = "rgba(0,0,0,0.5)";
      c.stroke();
      c.restore();
    },
  };

  const chartAreaBackground = {
    id: "chartAreaBackground",
    beforeDraw(chart) {
      const { ctx: c, chartArea } = chart;
      if (!chartArea) return;
      c.save();
      c.fillStyle = COLORS.night;
      c.fillRect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);
      c.restore();
    },
  };

  return new Chart(ctx, {
    type: "line",
    data: buildSunGraphData(daily, location),
    options: opts,
    plugins: [verticalLinePlugin, chartAreaBackground],
  });
}

export function updateSunGraphChart(chart, daily, location) {
  chart.data = buildSunGraphData(daily, location);
  chart.update();
}

function buildSunGraphData(daily, location) {
  const hrFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: location.timeZone,
    hour: "numeric", minute: "numeric", second: "numeric", hour12: false,
  });
  const dayFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: location.timeZone,
    month: "short", day: "numeric",
  });

  function toDecimalHrs(date) {
    if (isNaN(date)) return null;
    const p = hrFmt.formatToParts(date);
    return +p[0].value + +p[2].value / 60 + +p[4].value / 3600;
  }

  const sunsetArr  = new Array(daily.length);
  const sunriseArr = new Array(daily.length);
  const noonArr    = new Array(daily.length);
  for (let i = 0; i < daily.length; i++) {
    const d = daily[i];
    const riseHrs = toDecimalHrs(d.sunrise);
    const setHrs  = toDecimalHrs(d.sunset);
    sunriseArr[i] = riseHrs;
    sunsetArr[i]  = setHrs < riseHrs ? setHrs + 24 : setHrs;
    noonArr[i]    = toDecimalHrs(d.solarNoon);
  }

  return {
    labels: daily.map(d => dayFmt.format(d.solarNoon)),
    datasets: [
      { label: "sunset",    data: sunsetArr,  borderColor: "#ff8800", backgroundColor: COLORS.daylight, fill: 2,     tension: 0.4, pointRadius: 0, borderWidth: 2, order: 2 },
      { label: "solarNoon", data: noonArr,    borderColor: COLORS.solarNoon,                             fill: false, tension: 0.4, pointRadius: 0, borderWidth: 3, order: 1 },
      { label: "sunrise",   data: sunriseArr, borderColor: "#00b7ff", backgroundColor: COLORS.daylight, fill: false, tension: 0.4, pointRadius: 0, borderWidth: 2, order: 0 },
    ],
  };
}


// ─── Climate overview chart (location-only: GHI/DNI/DHI + temperature) ─────────

const CLIMATE = {
  ghi:       { border: "#28dbff", bg: "rgba(40,219,255,0.55)" },
  dni:       { border: "#facc15", bg: "rgba(250,204,21,0.55)" },
  dhi:       { border: "#818cf8", bg: "rgba(129,140,248,0.55)" },
  tempLine:  "#fb923c",
  tempRange: "rgba(251,146,60,0.12)",
  text:      "#94a3b8",
  grid:      "rgba(148,163,184,0.12)",
};

export function initClimateChart(canvasId, monthlySummary) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  return new Chart(ctx, {
    type: "bar",
    data: buildClimateData(monthlySummary),
    options: buildClimateOptions(),
  });
}

export function updateClimateChart(chart, monthlySummary) {
  chart.data = buildClimateData(monthlySummary);
  chart.update("none");
}

function buildClimateOptions() {
  const opts = baseChartOptions();
  opts.interaction = { mode: "index", intersect: false };
  opts.plugins.legend.labels.filter = item => item.text && item.text.length > 0;
  opts.plugins.tooltip.callbacks = {
    label(context) {
      const { dataset, parsed } = context;
      if (!dataset.label || dataset.label.includes("Range")) return null;
      const unit = dataset.yAxisID === "yTemp" ? " °C" : " kWh/m²/day";
      return `${dataset.label}: ${parsed.y.toFixed(1)}${unit}`;
    }
  };
  opts.scales = {
    x: {
      grid: { color: CLIMATE.grid },
      ticks: { color: CLIMATE.text, font: { family: "'IBM Plex Mono', monospace", size: 10 } },
    },
    yIrr: {
      type: "linear", position: "left",
      title: { display: true, text: "Solar resource [kWh/m²/day]", color: CLIMATE.text, font: { family: "'IBM Plex Mono', monospace", size: 11 } },
      grid: { color: CLIMATE.grid },
      ticks: { color: CLIMATE.text, font: { family: "'IBM Plex Mono', monospace", size: 10 } },
      min: 0,
    },
    yTemp: {
      type: "linear", position: "right",
      title: { display: true, text: "Temperature [°C]", color: CLIMATE.tempLine, font: { family: "'IBM Plex Mono', monospace", size: 11 } },
      grid: { display: false },
      ticks: { color: CLIMATE.tempLine, font: { family: "'IBM Plex Mono', monospace", size: 10 } },
    },
  };
  return opts;
}

function buildClimateData(monthlySummary) {
  const labels = monthlySummary.map(m => m.name);
  const maxTemp  = monthlySummary.map(m => +m.temp_max.toFixed(1));
  const minTemp  = monthlySummary.map(m => +m.temp_min.toFixed(1));
  const meanTemp = monthlySummary.map(m => +m.temp_mean.toFixed(1));

  return {
    labels,
    datasets: [
      {
        label: "GHI",
        type: "bar",
        data: monthlySummary.map(m => +m.ghi_kWhPd.toFixed(2)),
        backgroundColor: CLIMATE.ghi.bg,
        borderColor: CLIMATE.ghi.border,
        borderWidth: 1,
        borderRadius: 3,
        yAxisID: "yIrr",
        order: 4,
      },
      {
        label: "DNI",
        type: "bar",
        data: monthlySummary.map(m => +m.dni_kWhPd.toFixed(2)),
        backgroundColor: CLIMATE.dni.bg,
        borderColor: CLIMATE.dni.border,
        borderWidth: 1,
        borderRadius: 3,
        yAxisID: "yIrr",
        order: 4,
      },
      {
        label: "DHI",
        type: "bar",
        data: monthlySummary.map(m => +m.dhi_kWhPd.toFixed(2)),
        backgroundColor: CLIMATE.dhi.bg,
        borderColor: CLIMATE.dhi.border,
        borderWidth: 1,
        borderRadius: 3,
        yAxisID: "yIrr",
        order: 4,
      },
      // Temperature range band: temp_max fills downward to temp_min
      {
        label: "Temp Range",
        type: "line",
        data: maxTemp,
        borderWidth: 0,
        pointRadius: 0,
        fill: "+1",
        backgroundColor: CLIMATE.tempRange,
        tension: 0.4,
        yAxisID: "yTemp",
        order: 2,
      },
      {
        type: "line",
        data: minTemp,
        borderWidth: 0,
        pointRadius: 0,
        fill: false,
        tension: 0.4,
        yAxisID: "yTemp",
        order: 2,
      },
      {
        label: "Temp (mean)",
        type: "line",
        data: meanTemp,
        borderColor: CLIMATE.tempLine,
        backgroundColor: CLIMATE.tempLine,
        borderWidth: 2,
        pointRadius: 3,
        fill: false,
        tension: 0.4,
        yAxisID: "yTemp",
        order: 1,
      },
    ],
  };
}
