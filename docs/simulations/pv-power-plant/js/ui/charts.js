/**
 * charts.js
 * Chart rendering using Chart.js.
 * All chart creation and update functions live here.
 *
 * Exposes:
 *   initDayChart(canvasId, hourly)   — hourly power + cell temp dual-axis
 *   updateDayChart(chart, hourly)    — update with new data
 *   initAnnualChart(canvasId, data)  — monthly energy bar chart
 *   updateAnnualChart(chart, data)
 *   initWaterfallChart(canvasId, steps) — loss waterfall
 *   updateWaterfallChart(chart, steps)
 */

const COLORS = {
  ac:       "#4ade80",   // green — AC power
  dc:       "#60a5fa",   // blue  — DC power
  tCell:    "#fb923c",   // orange — cell temperature
  poa:      "#facc15",   // yellow — irradiance
  loss:     "#f87171",   // red    — losses
  gross:    "#60a5fa",
  net:      "#4ade80",
  grid:     "rgba(148,163,184,0.12)",
  text:     "#94a3b8",
  daylight: "#9fbee9",
  night:     "#292c4d",
  solarNoon: "#ff0000",
  solarMidnight: "#cfde4a",

};

function baseChartOptions(isDark = true) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    plugins: {
      legend: {
        labels: { color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 11 }, boxWidth: 12, padding: 16 },
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
    },
  };
}

/**
 * Initialize the day-view chart.
 * Dual Y-axis: left = power [kW], right = cell temperature [°C]
 */
export function initDayChart(canvasId, hourly) {
  const ctx = document.getElementById(canvasId).getContext("2d");
  const labels = hourly.map((h) => `${String(h.hour).padStart(2,"0")}:00`);

  const opts = baseChartOptions();
  opts.scales = {
    x: { grid: { color: COLORS.grid }, ticks: { color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 10 }, maxTicksLimit: 12 } },
    yPower: {
      type: "linear", position: "left",
      title: { display: true, text: "Power  [kW]", color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 11 } },
      grid: { color: COLORS.grid },
      ticks: { color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 10 } },
      min: 0,
    },
    yTemp: {
      type: "linear", position: "right",
      title: { display: true, text: "Cell temp  [°C]", color: COLORS.tCell, font: { family: "'IBM Plex Mono', monospace", size: 11 } },
      grid: { display: false },
      ticks: { color: COLORS.tCell, font: { family: "'IBM Plex Mono', monospace", size: 10 } },
    },
  };

  return new Chart(ctx, {
    type: "line",
    data: buildDayData(labels, hourly),
    options: opts,
  });
}

function buildDayData(labels, hourly) {
  return {
    labels,
    datasets: [
      {
        label: "AC output",
        data: hourly.map((h) => parseFloat(h.acOutput_kW.toFixed(1))),
        borderColor: COLORS.ac,
        backgroundColor: COLORS.ac + "22",
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 2,
        yAxisID: "yPower",
      },
      {
        label: "DC (net)",
        data: hourly.map((h) => parseFloat(h.netDc_kW.toFixed(1))),
        borderColor: COLORS.dc,
        backgroundColor: COLORS.dc + "11",
        fill: false,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 1.5,
        borderDash: [4, 3],
        yAxisID: "yPower",
      },
      {
        label: "Cell temp",
        data: hourly.map((h) => parseFloat(h.tCell.toFixed(1))),
        borderColor: COLORS.tCell,
        backgroundColor: "transparent",
        fill: false,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 1.5,
        borderDash: [2, 2],
        yAxisID: "yTemp",
      },
    ],
  };
}

export function updateDayChart(chart, hourly) {
  const labels = hourly.map((h) => `${String(h.hour).padStart(2,"0")}:00`);
  chart.data = buildDayData(labels, hourly);
  chart.update();
}

/**
 * Initialize the annual bar chart.
 * Monthly AC energy [MWh].
 */
export function initAnnualChart(canvasId, monthly) {
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

  return new Chart(ctx, {
    type: "bar",
    data: buildAnnualData(monthly),
    options: opts,
  });
}

function buildAnnualData(monthly) {
  return {
    labels: monthly.map((m) => m.name),
    datasets: [
      {
        label: "AC energy",
        data: monthly.map((m) => parseFloat((m.energyAc_kWh / 1000).toFixed(1))),
        backgroundColor: monthly.map((m) => {
          // Color by temperature: warmer = more amber tint
          const t = Math.min(1, Math.max(0, (m.tAmb + 5) / 40));
          return `rgba(74,222,128,${0.55 + t * 0.35})`;
        }),
        borderColor: COLORS.ac,
        borderWidth: 1,
        borderRadius: 3,
      },
      {
        label: "GHI in",
        data: monthly.map((m) => parseFloat((m.ghi_kWh).toFixed(1))),
        backgroundColor: "rgba(250,204,21,0.10)",
        borderColor: COLORS.poa,
        borderWidth: 1,
        borderRadius: 3,
        type: "bar",
      },
    ],
  };
}

export function updateAnnualChart(chart, monthly) {
  chart.data = buildAnnualData(monthly);
  chart.update();
}

/**
 * Initialize horizontal waterfall / bar chart for loss analysis.
 */
export function initWaterfallChart(canvasId, steps) {
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

  return new Chart(ctx, {
    type: "bar",
    data: buildWaterfallData(steps),
    options: opts,
  });
}

function buildWaterfallData(steps) {
  return {
    labels: steps.map((s) => s.label),
    datasets: [
      {
        data: steps.map((s) => parseFloat((s.value / 1000).toFixed(1))),
        backgroundColor: steps.map((s) =>
          s.type === "start" ? "rgba(96,165,250,0.7)"
          : s.type === "end" ? "rgba(74,222,128,0.8)"
          : "rgba(248,113,113,0.7)"
        ),
        borderColor: steps.map((s) =>
          s.type === "start" ? COLORS.dc
          : s.type === "end" ? COLORS.ac
          : COLORS.loss
        ),
        borderWidth: 1,
        borderRadius: 3,
      },
    ],
  };
}

export function updateWaterfallChart(chart, steps) {
  chart.data = buildWaterfallData(steps);
  chart.update();
}


/**
 * Initialize the sunrise/sunset chart
 */
export function initSunGraphChart(canvasId, daily, location) {
  const ctx = document.getElementById(canvasId).getContext("2d");

  const opts = baseChartOptions();
  opts.scales = {
    x: { 
      grid: { display: false }, 
      ticks: { color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 10 }, maxTicksLimit: 12,
        callback: function(value, index, ticks) {
          const label = this.getLabelForValue(value);
          return label.split(' ')[0];
        }
    } },
    y: {
      grid: { display: false },
      type: "linear", position: "left",
      ticks: { color: COLORS.text, font: { family: "'IBM Plex Mono', monospace", size: 10 } },
      min: 0,
      max: 24,
    }
  };
  opts.interaction = {
    mode: 'index',
    intersect: false
  };
  opts.plugins.tooltip.displayColors = false;
  opts.plugins.tooltip.callbacks = {
    label: function(context) {
      const value = context.parsed.y;
      const hours = Math.floor(value);
      const minutes = Math.round((value - hours) * 60);
      const formattedMinutes = minutes.toString().padStart(2, '0');
      return `${context.dataset.label}: ${hours}:${formattedMinutes}`;
  }};
  
  const verticalLinePlugin = {
    id: 'verticalLine',
    afterDraw(chart) {
      const { ctx, chartArea: { top, bottom } } = chart;

      const active = chart.tooltip?._active;
      if (active && active.length) {
        const x = active[0].element.x;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.stroke();
        ctx.restore();
      }
    }
  };
  const chartAreaBackground = {
    id: 'chartAreaBackground',
    beforeDraw(chart) {
      const { ctx, chartArea } = chart;
      if (!chartArea) return;

      ctx.save();
      ctx.fillStyle = COLORS.night; // your color
      ctx.fillRect(
        chartArea.left,
        chartArea.top,
        chartArea.right - chartArea.left,
        chartArea.bottom - chartArea.top
      );
      ctx.restore();
    }
  };

  return new Chart(ctx, {
    type: "line",
    data: buildSunGraphData(daily, location),
    options: opts,
    plugins: [verticalLinePlugin, chartAreaBackground]
  });
}

function buildSunGraphData(daily, location) {
  const hrFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: location.timeZone,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });
  const dayMonthFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: location.timeZone,
    month: 'short',
    day: 'numeric'
  });

  function toHrsDecimal(date) {
    if (isNaN(date)) return null;
    const fTime = hrFormatter.formatToParts(date);
    return +(fTime[0].value) + +fTime[2].value / 60 + +fTime[4].value / 3600;
  }
  const sunsetArr = new Array(daily.length);
  const sunriseArr = new Array(daily.length);
  const noonArr = new Array(daily.length);
  for (let i = 0; i < daily.length; i++) {
    const d = daily[i];
    const sunsetHrs = toHrsDecimal(d.sunset);
    const sunriseHrs = toHrsDecimal(d.sunrise);
    
      // const pos = SunCalc.getPosition(d.solarNoon, location.lat, location.lon);
      // if (pos.altitude > 0) { sunsetArr[i] = 48; sunriseArr[i] = 0; }
    sunsetArr[i] = sunsetHrs < sunriseHrs ? sunsetHrs + 24 : sunsetHrs;
    sunriseArr[i] = sunriseHrs;
    noonArr[i] = toHrsDecimal(d.solarNoon);
  }

  return {
    labels: daily.map((d) => dayMonthFormatter.format(d.solarNoon)),
    datasets: [
      {
        label: "sunset",
        data: sunsetArr,
        borderColor: '#ff8800',
        backgroundColor: COLORS.daylight,
        fill: 2,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 2,
        order: 2
      },
      {
        label: "solarNoon",
        data: noonArr,
        borderColor: COLORS.solarNoon,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 3,
        order: 1
      },
      {
        label: "sunrise",
        data: sunriseArr,
        borderColor: '#00b7ff',
        backgroundColor: COLORS.daylight,
        fill: false,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 2,
        order: 0
      }
    ],
  };
}
export function updateSunGraphChart(chart, daily, location) {
  chart.data = buildSunGraphData(daily, location);
  chart.update();
}

function toHoursDecimal(date) {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}
