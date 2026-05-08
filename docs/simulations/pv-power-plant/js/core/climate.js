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
    timeZone: "America/Phoenix",
    lat: 33.4,
    lon: -112.1,
    altitude: 331,
  },
  denver: {
    name: "Denver, CO",
    dbdata: "./data/nsrdb_denver.csv",
    label: "High Altitude",
    timeZone: "America/Denver",
    lat: 39.74,
    lon: -104.98,
    altitude: 1609,
  },
  // seville: {
  //   name: "Seville, Spain",
  //   timeZone: "Europe/Madrid",
  //   label: "Mediterranean",
  //   lat: 37.4,
  //   lon: -5.98,
  //   altitude: 9,
  // },
  london: {
    name: "London, UK",
    dbdata: "./data/nsrdb_london.csv",
    timeZone: "Europe/London",
    label: "Temperate Cloudy",
    lat: 51.5,
    lon: -0.12,
    altitude: 11,
  },
  // mumbai: {
  //   name: "Mumbai, India",
  //   label: "Tropical Monsoon",
  //   timeZone: "Asia/Kolkata",
  //   lat: 19.08,
  //   lon: 72.88,
  //   altitude: 14
  // },
  oslo: {
    name: "Oslo, Norway",
    dbdata: "./data/nsrdb_oslo.csv",
    label: "Nordic",
    timeZone: "Europe/Berlin",
    lat: 59.9,
    lon: 10.75,
    altitude: 23,
  },
  // reykjavik: {
  //   name: "Reykjavik, Iceland",
  //   label: "Icelandic",
  //   timeZone: "Atlantic/Reykjavik",
  //   lat: 64.14,
  //   lon: -21.94,
  //   altitude: 0,
  // },
  // akureyri: {
  //   name: "Akureyri, Iceland",
  //   label: "Icelandic",
  //   timeZone: "Atlantic/Reykjavik",
  //   lat: 65.68,
  //   lon: -18.09,
  //   altitude: 0,
  // },
  // sanfrancisco: {
  //   name: "San Francisco, CA",
  //   label: "Coastal Fog",
  //   timeZone: "America/Los_Angeles",
  //   lat: 37.77,
  //   lon: -122.42,
  //   altitude: 16,
  // },
  nairobi: {
    name: "Nairobi, Kenya",
    dbdata: "./data/nsrdb_nairobi_kenya.csv",
    label: "Equatorial",
    timeZone: "Africa/Nairobi",
    lat: -1.29,
    lon: 36.82,
    altitude: 1795,
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
