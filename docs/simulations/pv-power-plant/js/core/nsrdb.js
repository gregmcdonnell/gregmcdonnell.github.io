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
export function parseNSRDB(csvText) {
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
  const byMonth = Array.from({ length: 13 }, () => []); // index 1-12
  let totalDays = 0;
  const daysBeforeMonth = DAYSINMONTHS.map((count) => {totalDays += count; return totalDays;})
  const byDay = Array.from({ length: 365 }, () => ({day:'', month:'', rs:[]}));
  // console.log(byDay);
  for (const r of records) {
    const m = r["Month"] ?? r["month"];
    if (m >= 1 && m <= 12) byMonth[m].push(r);
    const nDaysInLastMonth = daysBeforeMonth[m - 1];
    const dayIndex = nDaysInLastMonth + r["Day"] - 1;
    if (dayIndex >= 0 && dayIndex < 365) {
      // byDay[dayIndex].date = `2023-${m}-${r["Day"]}`;
      byDay[dayIndex].day = r["Day"];
      byDay[dayIndex].month = m;
      byDay[dayIndex].rs.push(r);
    }
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
 *
 *  byMonth — the byMonth array from parseNSRDB
 *  month   — integer 1-12
 *
 * Returns array of 24 objects:
 *  { hour, ghi:{mean,min,max}, dni:{mean,min,max}, dhi:{mean,min,max}, temp:{mean,min,max}, rows }
 *  where rows is the raw array of matching records (for SunCalc use)
 */
export function aggregateMonth(byMonth, month) {
  const monthRecords = byMonth[month] ?? [];

  // Group by hour
  const byHour = Array.from({ length: 24 }, () => []);
  for (const r of monthRecords) {
    const h = r["Hour"] ?? r["hour"] ?? 0;
    if (h >= 0 && h < 24) byHour[h].push(r);
  }

  return byHour.map((rows, hour) => {
    if (rows.length === 0) {
      return {
        hour,
        ghi:  { mean: 0, min: 0, max: 0 },
        dni:  { mean: 0, min: 0, max: 0 },
        dhi:  { mean: 0, min: 0, max: 0 },
        temp: { mean: 20, min: 20, max: 20 },
        rows: [],
      };
    }

    const stat = (field) => {
      const vals = rows.map(r => r[field] ?? 0).filter(v => !isNaN(v));
      if (vals.length === 0) return { mean: 0, min: 0, max: 0 };
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      return { mean, min: Math.min(...vals), max: Math.max(...vals) };
    };

    return {
      hour,
      ghi:  stat("GHI"),
      dni:  stat("DNI"),
      dhi:  stat("DHI"),
      temp: stat("Temperature"),
      // wind: stat("Wind"),
      rows,
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
