/**
 * climate.js
 * Monthly climate profiles for 8 representative locations.
 * Each month entry: { ghi, tAmb, wind }
 *   ghi   — monthly mean daily GHI [kWh/m²/day]
 *   tAmb  — monthly mean ambient temperature [°C]
 *   wind  — monthly mean wind speed [m/s]
 */

export const LOCATIONS = {
  phoenix: {
    name: "Phoenix, AZ",
    dbdata: "./data/nsrdb_phoenix_local.csv",
    label: "Desert Southwest",
    timeZone: "America/Phoenix"
  },
  denver: {
    name: "Denver, CO",
    dbdata: "./data/nsrdb_denver.csv",
    label: "High Altitude",
    timeZone: "America/Denver"
  },
  pueblo: {
    name: "Pueblo, CO",
    dbdata: "./data/pueblo_CO_38.17_-104.58_tmy-2023.csv",
    label: "High Altitude",
    timeZone: "America/Denver"
  },
  las_vegas: {
    name: "Las Vegas, NV",
    dbdata: "./data/las_vegas_36.45_-114.74_tmy-2023.csv",
    label: "Desert",
    timeZone: "America/Los_Angeles"
  },
  hartford: {
    name: "Hartford, CT",
    dbdata: "./data/hartford_CT_41.89_-72.54_tmy-2023.csv",
    label: "North East",
    timeZone: "America/New_York"
  },
  palm_springs: {
    name: "Palm Springs, CA",
    dbdata: "./data/palmSprings_CA_33.89_-116.54_tmy-2023.csv",
    label: "Desert",
    timeZone: "America/Los_Angeles"
  },
  london: {
    name: "London, UK",
    dbdata: "./data/nsrdb_london.csv",
    timeZone: "Europe/London",
    label: "Temperate Cloudy",
  },
  oslo: {
    name: "Oslo, Norway",
    dbdata: "./data/nsrdb_oslo.csv",
    label: "Nordic",
    timeZone: "Europe/Berlin",
  },
  // reykjavik: {
  //   name: "Reykjavik, Iceland",
  //   label: "Icelandic",
  //   timeZone: "Atlantic/Reykjavik",
  // },
  nairobi: {
    name: "Nairobi, Kenya",
    dbdata: "./data/nsrdb_nairobi_kenya.csv",
    label: "Equatorial",
    timeZone: "Africa/Nairobi",
  },
};

/** Return the 12-month dataset for a location key */
export function getClimate(locationKey) {
  return LOCATIONS[locationKey] ?? LOCATIONS.phoenix;
}

/** Month names for display */
export const MONTH_NAMES = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec"
];

/** Representative day-of-year for each month (mid-month). */
export const MONTH_DOY = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344];
