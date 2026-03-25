#!/usr/bin/env node
// Fetch business climate data for all 50 states:
// 1. Census BDS: Establishment entry rate (% new establishments per year)
// 2. BLS QCEW: Net establishment growth (YoY % change)

const FIPS_TO_STATE = {
  "01":"Alabama","02":"Alaska","04":"Arizona","05":"Arkansas","06":"California",
  "08":"Colorado","09":"Connecticut","10":"Delaware","12":"Florida","13":"Georgia",
  "15":"Hawaii","16":"Idaho","17":"Illinois","18":"Indiana","19":"Iowa","20":"Kansas",
  "21":"Kentucky","22":"Louisiana","23":"Maine","24":"Maryland","25":"Massachusetts",
  "26":"Michigan","27":"Minnesota","28":"Mississippi","29":"Missouri","30":"Montana",
  "31":"Nebraska","32":"Nevada","33":"New Hampshire","34":"New Jersey","35":"New Mexico",
  "36":"New York","37":"North Carolina","38":"North Dakota","39":"Ohio","40":"Oklahoma",
  "41":"Oregon","42":"Pennsylvania","44":"Rhode Island","45":"South Carolina",
  "46":"South Dakota","47":"Tennessee","48":"Texas","49":"Utah","50":"Vermont",
  "51":"Virginia","53":"Washington","54":"West Virginia","55":"Wisconsin","56":"Wyoming"
};

const FIPS_CODES = Object.keys(FIPS_TO_STATE);

async function fetchJSON(url) {
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status}: ${text.substring(0, 200)}`);
  }
  return resp.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---- 1. Census BDS: Establishment Entry Rate ----
async function fetchBDSAllStates() {
  console.log("=== Census BDS: Establishment Entry Rate ===");

  const url = "https://api.census.gov/data/timeseries/bds?get=ESTABS_ENTRY_RATE,ESTABS_EXIT_RATE,ESTAB,STATE&for=state:*&YEAR=*";
  const data = await fetchJSON(url);
  console.log("Header:", JSON.stringify(data[0]));
  console.log("Total rows:", data.length - 1);
  console.log("Sample:", JSON.stringify(data[1]));

  // Parse: column layout from header
  const header = data[0];
  const entryIdx = header.indexOf("ESTABS_ENTRY_RATE");
  const exitIdx = header.indexOf("ESTABS_EXIT_RATE");
  const estabIdx = header.indexOf("ESTAB");
  const stateIdx = header.indexOf("STATE");
  const yearIdx = header.indexOf("YEAR");
  // 'state' is the geo fips at the end
  const fipsIdx = header.indexOf("state");

  // Build: { year: { stateName: { entry, exit, estab } } }
  const byYear = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const fips = row[fipsIdx];
    if (!FIPS_TO_STATE[fips]) continue; // skip non-50 states

    const year = row[yearIdx];
    const stateName = FIPS_TO_STATE[fips];
    const entryRate = parseFloat(row[entryIdx]);
    const exitRate = parseFloat(row[exitIdx]);

    if (!byYear[year]) byYear[year] = {};
    byYear[year][stateName] = { entryRate, exitRate };
  }

  // Print Hawaii + averages
  const years = Object.keys(byYear).sort();
  console.log("\nYear range:", years[0], "-", years[years.length - 1]);

  const hiData = {};
  const avgData = {};

  for (const year of years) {
    const states = byYear[year];
    const hi = states["Hawaii"];
    if (hi) {
      hiData[year] = hi.entryRate;
    }

    // Compute other-state average (excluding Hawaii)
    const otherEntryRates = Object.entries(states)
      .filter(([s]) => s !== "Hawaii")
      .map(([, v]) => v.entryRate)
      .filter(v => !isNaN(v));

    if (otherEntryRates.length > 0) {
      avgData[year] = Math.round((otherEntryRates.reduce((a, b) => a + b, 0) / otherEntryRates.length) * 100) / 100;
    }

    if (hi) {
      console.log(`  ${year}: HI=${hi.entryRate}%, avg=${avgData[year]}%, states=${otherEntryRates.length}`);
    }
  }

  return { hiData, avgData, byYear };
}

// ---- 2. BLS QCEW: Net Establishment Growth ----
async function fetchQCEWForState(fips, year) {
  const paddedFips = fips.padStart(2, "0");
  const url = `https://data.bls.gov/cew/data/api/${year}/a/area/${paddedFips}000.csv`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const text = await resp.text();
  const lines = text.split("\n");
  const header = lines[0].split(",").map(h => h.replace(/"/g, ""));

  // Find "total, all industries" row (own_code=0, industry_code=10, agglvl_code=50)
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.replace(/"/g, ""));
    if (cols[1] === "0" && cols[2] === "10" && cols[3] === "50") {
      return {
        estabs: parseInt(cols[header.indexOf("annual_avg_estabs")]),
        emp: parseInt(cols[header.indexOf("annual_avg_emplvl")]),
        estabsPctChg: parseFloat(cols[header.indexOf("oty_annual_avg_estabs_pct_chg")])
      };
    }
  }
  return null;
}

async function fetchQCEWAllStates() {
  console.log("\n=== BLS QCEW: Net Establishment Growth ===");

  const years = [2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023];
  const allData = {}; // { year: { stateName: pctChg } }
  const hiData = {};
  const avgData = {};

  for (const year of years) {
    console.log(`Fetching ${year}...`);
    allData[year] = {};

    // Fetch all 50 states in parallel (batches of 10 to be nice)
    for (let batch = 0; batch < FIPS_CODES.length; batch += 10) {
      const batchFips = FIPS_CODES.slice(batch, batch + 10);
      const results = await Promise.all(
        batchFips.map(fips => fetchQCEWForState(fips, year).catch(() => null))
      );

      for (let j = 0; j < batchFips.length; j++) {
        const fips = batchFips[j];
        const stateName = FIPS_TO_STATE[fips];
        if (results[j] && !isNaN(results[j].estabsPctChg)) {
          allData[year][stateName] = results[j].estabsPctChg;
        }
      }
    }

    // Hawaii
    if (allData[year]["Hawaii"] !== undefined) {
      hiData[year] = allData[year]["Hawaii"];
    }

    // Other-state average
    const otherVals = Object.entries(allData[year])
      .filter(([s]) => s !== "Hawaii")
      .map(([, v]) => v);

    if (otherVals.length > 0) {
      avgData[year] = Math.round((otherVals.reduce((a, b) => a + b, 0) / otherVals.length) * 100) / 100;
    }

    console.log(`  ${year}: HI=${hiData[year]}%, avg=${avgData[year]}%, states=${otherVals.length}`);
    await sleep(200); // be nice to BLS
  }

  return { hiData, avgData, allData };
}

async function main() {
  // Fetch both datasets
  const bds = await fetchBDSAllStates();
  const qcew = await fetchQCEWAllStates();

  // Output the data for data.js
  console.log("\n=== DATA FOR data.js ===\n");

  console.log("// Metric 1: New Business Entry Rate (BDS)");
  console.log("// Establishment Entry Rate: % of establishments that are new each year");
  console.log('"estabs_entry_rate": {');
  console.log('  hawaii:', JSON.stringify(bds.hiData) + ',');
  console.log('  otherStateAvg:', JSON.stringify(bds.avgData));
  console.log('}');

  console.log("\n// Metric 2: Net Establishment Growth (QCEW)");
  console.log("// Year-over-year % change in number of business establishments");
  console.log('"net_estab_growth_pct": {');
  console.log('  hawaii:', JSON.stringify(qcew.hiData) + ',');
  console.log('  otherStateAvg:', JSON.stringify(qcew.avgData));
  console.log('}');

  // Output state-level JSON for state-data.js
  console.log("\n=== STATE_DATA_JSON_START ===");

  // BDS: filter to 2012-2023 to match dashboard window
  const bdsStateData = {};
  for (const [year, states] of Object.entries(bds.byYear)) {
    if (parseInt(year) < 2012) continue;
    bdsStateData[year] = {};
    for (const [state, vals] of Object.entries(states)) {
      // Store as raw percentage (not decimal) since BDS already gives percentage
      bdsStateData[year][state] = vals.entryRate;
    }
  }

  // QCEW: already 2014-2023
  const qcewStateData = {};
  for (const [year, states] of Object.entries(qcew.allData)) {
    qcewStateData[year] = states;
  }

  console.log(JSON.stringify({
    estabs_entry_rate: {
      source: "Census Business Dynamics Statistics",
      calculation: "Establishment entry rate: new establishments as % of total",
      rawVariables: "ESTABS_ENTRY_RATE from BDS timeseries",
      data: bdsStateData
    },
    net_estab_growth_pct: {
      source: "BLS Quarterly Census of Employment & Wages",
      calculation: "Year-over-year % change in annual average establishment count",
      rawVariables: "oty_annual_avg_estabs_pct_chg from QCEW annual averages",
      data: qcewStateData
    }
  }, null, 2));

  console.log("=== STATE_DATA_JSON_END ===");
}

main().catch(console.error);
