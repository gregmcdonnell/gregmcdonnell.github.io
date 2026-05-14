/**
 * nsrdb.js
 * Parser and aggregator for NSRDB CSV data files.
 *
 * CSV files can be downloaded using the api or from the viewer:
 * https://nsrdb.nlr.gov/data-viewer
 * 
 * NSRDB files have two metadata rows before the column header row:
 *   Row 0: site metadata  (Location ID, City, State, Lat, Lon, Timezone, Elevation...)
 *   Row 1: units row      (e.g. "degrees", "W/m2", ...)
 *   Row 2: column headers (Year, Month, Day, Hour, Minute, GHI, DNI, DHI, Temperature, ...)
 *   Row 3+: data
 *
 * Exposes:
 *   loadNSRDB(url)                  — fetch + parse → { meta, records, byMonth }
 *   aggregateMonth(records, month)  — hourly mean/min/max for one month (1-12)
 */

const DAYSINMONTHS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Parse a raw NSRDB CSV string.
 * Returns { meta, lat, lon, timezone, records }
 *   meta    — first-row key/value pairs
 *   records — array of row objects with numeric fields
 */
function parseNSRDB(csvText) {
  const lines = csvText.trim().split(/\r?\n/);

  // Row 0: metadata (comma-separated key=value pairs in adjacent cells)
  const metaKeys   = lines[0].split(",");
  const metaValues = lines[1].split(",");
  const meta = {};
  metaKeys.forEach((k, i) => { meta[k.trim()] = (metaValues[i] || "").trim(); });

  // Row 2: column headers
  const headers = lines[2].split(",").map(h => h.trim());

  // Rows 3+: data
  const records = [];
  for (let i = 3; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = lines[i].split(",");
    const row = {};
    headers.forEach((h, j) => {
      const v = parseFloat(cols[j]);
      row[h] = isNaN(v) ? (cols[j] || "").trim() : v;
    });
    records.push(row);
  }

  // Extract site coordinates and timezone from meta
  const lat      = parseFloat(meta["Latitude"]  ?? meta["lat"] ?? 0);
  const lon      = parseFloat(meta["Longitude"] ?? meta["lon"] ?? 0);
  const timezone = parseFloat(meta["Time Zone"] ?? meta["timezone"] ?? 0);
  const elevation= parseFloat(meta["Elevation"] ?? 0);


  // Pre-group records by month for fast access
  const byMonth = Array.from({ length: 13 }, () => ({aggregate: {}, records: []})); // index 1-12
  let totalDays = 0;
  const daysBeforeMonth = DAYSINMONTHS.map((count) => {totalDays += count; return totalDays;})
  const byDay = Array.from({ length: 365 }, () => ({day:'', month:'', rs:[]}));
  // console.log(byDay);
  for (const r of records) {
    const m = r["Month"] ?? r["month"];
    if (m >= 1 && m <= 12) byMonth[m].records.push(r);
    const nDaysInLastMonth = daysBeforeMonth[m - 1];
    const dayIndex = nDaysInLastMonth + r["Day"] - 1;
    if (dayIndex >= 0 && dayIndex < 365) {
      // byDay[dayIndex].date = `2023-${m}-${r["Day"]}`;
      byDay[dayIndex].day = r["Day"];
      byDay[dayIndex].month = m;
      byDay[dayIndex].rs.push(r);
    }
  }
  
  for (const m of byMonth) {
    m.aggregate = aggregateMonth(m.records);
  }
  
  return { meta, lat, lon, timezone, elevation, records, byMonth, byDay };
}

/**
 * Fetch and parse an NSRDB CSV file from a URL.
 * Returns parsed dataset object (see parseNSRDB).
 */
export async function loadNSRDB(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load NSRDB data: ${response.status} ${response.statusText}`);
  const text = await response.text();
  return parseNSRDB(text);
}

/**
 * Aggregate all days in a given month into hourly statistics.
 * For each hour 0-23, computes mean, min, max of GHI, DNI, DHI, Temperature.
 */

function aggregateMonth(monthRecords) {
  // Group by hour
  const byHour = Array.from({ length: 24 }, () => []);
  for (const r of monthRecords) {
    const h = r["Hour"] ?? r["hour"] ?? 0;
    if (h >= 0 && h < 24) byHour[h].push(r);
  }

  return byHour.map((rows, hour) => {
    // Each row here is data for a given day at that hour, so should be ~30 rows
    const nDaysInMonth = rows.length;
    if (nDaysInMonth === 0) return null;

    // Calculate mean, min, max for the given field (GHI, DNI, temp, etc.)
    const stat = (field) => {
      let sum = 0, min = Infinity, max = -Infinity;
      for (const r of rows) {
        const v = r[field] ?? 0;
        sum += v;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      return { mean: sum / nDaysInMonth, min, max, };
    };

    return {
      hour,
      ghi:      stat("GHI"),
      dni:      stat("DNI"),
      dhi:      stat("DHI"),
      temp:     stat("Temperature"),
      clearDni: stat("Clearsky DNI"),
      // rows,
    };
  });
}

/**
 * Compute monthly climate averages from NSRDB data — location-only, no plant parameters.
 * Each entry: { name, month, ghi_kWhPd, dni_kWhPd, dhi_kWhPd, temp_mean, temp_min, temp_max, clearness }
 *   ghi_kWhPd  — mean daily GHI  [kWh/m²/day]
 *   dni_kWhPd  — mean daily DNI  [kWh/m²/day]
 *   dhi_kWhPd  — mean daily DHI  [kWh/m²/day]
 *   temp_mean  — mean daily temperature [°C]
 *   temp_min   — monthly minimum temperature [°C]
 *   temp_max   — monthly maximum temperature [°C]
 *   clearness  — DNI / ClearskyDNI ratio 0–1 (cloud cover proxy)
 */
export function monthlyClimateSummary(dataset) {
  const NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const hours = dataset.byMonth[m].aggregate;

    let ghiSum = 0, dniSum = 0, dhiSum = 0, clearDniSum = 0;
    let tempSum = 0, tempMin = Infinity, tempMax = -Infinity, count = 0;

    for (const h of hours) {
      if (!h) continue;
      ghiSum     += h.ghi.mean;
      dniSum     += h.dni.mean;
      dhiSum     += h.dhi.mean;
      clearDniSum+= h.clearDni.mean;
      tempSum    += h.temp.mean;
      if (h.temp.min < tempMin) tempMin = h.temp.min;
      if (h.temp.max > tempMax) tempMax = h.temp.max;
      count++;
    }

    const clearness = clearDniSum > 0 ? dniSum / clearDniSum : 0;

    return {
      name:      NAMES[i],
      month:     m,
      ghi_kWhPd: ghiSum / 1000,
      dni_kWhPd: dniSum / 1000,
      dhi_kWhPd: dhiSum / 1000,
      temp_mean: count > 0 ? tempSum / count : 0,
      temp_min:  isFinite(tempMin) ? tempMin : 0,
      temp_max:  isFinite(tempMax) ? tempMax : 0,
      cloudiness: dhiSum / ghiSum,
      clearness: Math.min(1, Math.max(0, clearness)),
    };
  });
}

/**
 * Build a representative UTC Date for a given month/hour using the dataset's
 * year (or a fallback year). Uses the 15th day of the month as representative.
 * Accounts for the site's UTC timezone offset stored in the dataset.
 *
 *  month    — 1-12
 *  hour     — 0-23  (local standard time per NSRDB convention)
 *  year     — calendar year (e.g. 2022)
 *  timezone — UTC offset hours (e.g. -7 for MST)
 */
export function representativeUTC(month, hour, year, timezone) {
  // if NSRDB times are local standard time, convert to UTC (timezone will be 0 if already in UTC)
  const utcHour = hour - timezone;
  const d = new Date(Date.UTC(year, month - 1, 15, utcHour, 30, 0));
  return d;
}
