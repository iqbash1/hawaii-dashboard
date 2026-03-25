#!/usr/bin/env node
// Compute net domestic migration rate per 10K for 2003-2010
// Uses Census PEP vintage table 5 data (2003-2009) and API data (2010)

// Raw domestic migration counts from Census vintage table 5 files
// Format: state -> year -> domestic_migration_count
// Year label = ending year of the July-to-July period (e.g., 2003 = 7/1/2002 to 7/1/2003)
const domesticMig = {
  // === VINTAGE 2003 (period: 7/1/2002 to 7/1/2003) → label as 2003 ===
  "2003": {
    "Alabama": 4525, "Alaska": -320, "Arizona": 61200, "Arkansas": 5255,
    "California": -94861, "Colorado": -10611, "Connecticut": -1234, "Delaware": 5762,
    "Florida": 177734, "Georgia": 31785, "Hawaii": 2129, "Idaho": 10132,
    "Illinois": -73980, "Indiana": 1019, "Iowa": -5535, "Kansas": -9568,
    "Kentucky": 8592, "Louisiana": -10605, "Maine": 9862, "Maryland": 8266,
    "Massachusetts": -45099, "Michigan": -25583, "Minnesota": -7705, "Mississippi": -2588,
    "Missouri": 7871, "Montana": 5033, "Nebraska": -1319, "Nevada": 44718,
    "New Hampshire": 6472, "New Jersey": -33225, "New Mexico": 5074, "New York": -170041,
    "North Carolina": 25100, "North Dakota": -2049, "Ohio": -27497, "Oklahoma": 400,
    "Oregon": 13300, "Pennsylvania": 7841, "Rhode Island": 1843, "South Carolina": 19735,
    "South Dakota": -30, "Tennessee": 19942, "Texas": 15998, "Utah": -11263,
    "Vermont": 1272, "Virginia": 28412, "Washington": 5687, "West Virginia": 5140,
    "Wisconsin": 4981, "Wyoming": -130
  },
  // === VINTAGE 2004 (period: 7/1/2003 to 7/1/2004) → label as 2004 ===
  "2004": {
    "Alabama": 7987, "Alaska": -635, "Arizona": 83041, "Arkansas": 10030,
    "California": -144462, "Colorado": -6317, "Connecticut": -10711, "Delaware": 5735,
    "Florida": 249807, "Georgia": 44838, "Hawaii": -725, "Idaho": 12624,
    "Illinois": -70968, "Indiana": -3082, "Iowa": -3097, "Kansas": -11884,
    "Kentucky": 7708, "Louisiana": -7544, "Maine": 5679, "Maryland": -5992,
    "Massachusetts": -58910, "Michigan": -36450, "Minnesota": -8435, "Mississippi": 3907,
    "Missouri": 5048, "Montana": 6217, "Nebraska": -5182, "Nevada": 65061,
    "New Hampshire": 3117, "New Jersey": -45045, "New Mexico": 5915, "New York": -214855,
    "North Carolina": 46131, "North Dakota": -1367, "Ohio": -31137, "Oklahoma": -4596,
    "Oregon": 1945, "Pennsylvania": -772, "Rhode Island": -1539, "South Carolina": 24297,
    "South Dakota": 1452, "Tennessee": 23236, "Texas": 27681, "Utah": -7734,
    "Vermont": 221, "Virginia": 25743, "Washington": 15875, "West Virginia": 3313,
    "Wisconsin": 3150, "Wyoming": 1361
  },
  // === VINTAGE 2005 (period: 7/1/2004 to 7/1/2005) → label as 2005 ===
  "2005": {
    "Alabama": 12994, "Alaska": -2831, "Arizona": 123704, "Arkansas": 14503,
    "California": -239417, "Colorado": 5497, "Connecticut": -14319, "Delaware": 7197,
    "Florida": 262511, "Georgia": 46437, "Hawaii": -1864, "Idaho": 19812,
    "Illinois": -79525, "Indiana": 5061, "Iowa": -3215, "Kansas": -9998,
    "Kentucky": 10754, "Louisiana": -12849, "Maine": 3321, "Maryland": -13289,
    "Massachusetts": -60053, "Michigan": -47900, "Minnesota": -8448, "Mississippi": 942,
    "Missouri": 8283, "Montana": 5929, "Nebraska": -3286, "Nevada": 55715,
    "New Hampshire": 4600, "New Jersey": -56989, "New Mexico": 5138, "New York": -232638,
    "North Carolina": 66383, "North Dakota": -2908, "Ohio": -39976, "Oklahoma": 1070,
    "Oregon": 24329, "Pennsylvania": -5078, "Rhode Island": -10243, "South Carolina": 31556,
    "South Dakota": 828, "Tennessee": 38792, "Texas": 51067, "Utah": 4970,
    "Vermont": -453, "Virginia": 14889, "Washington": 24072, "West Virginia": 4250,
    "Wisconsin": 38, "Wyoming": 550
  },
  // === VINTAGE 2006 (period: 7/1/2005 to 7/1/2006) → label as 2006 ===
  "2006": {
    "Alabama": 31600, "Alaska": -1728, "Arizona": 129987, "Arkansas": 19495,
    "California": -287684, "Colorado": 29819, "Connecticut": -16944, "Delaware": 5434,
    "Florida": 165757, "Georgia": 120953, "Hawaii": -3136, "Idaho": 22500,
    "Illinois": -68661, "Indiana": 5011, "Iowa": 115, "Kansas": -7370,
    "Kentucky": 9650, "Louisiana": -241201, "Maine": 927, "Maryland": -25610,
    "Massachusetts": -49528, "Michigan": -65123, "Minnesota": -4509, "Mississippi": -14854,
    "Missouri": 13338, "Montana": 6614, "Nebraska": -5578, "Nevada": 53105,
    "New Hampshire": 2170, "New Jersey": -72547, "New Mexico": 8784, "New York": -225766,
    "North Carolina": 104133, "North Dakota": -2113, "Ohio": -48153, "Oklahoma": 12336,
    "Oregon": 34332, "Pennsylvania": -492, "Rhode Island": -12566, "South Carolina": 47950,
    "South Dakota": 1951, "Tennessee": 50383, "Texas": 218745, "Utah": 14852,
    "Vermont": -671, "Virginia": 4216, "Washington": 43089, "West Virginia": 3979,
    "Wisconsin": -3089, "Wyoming": 2946
  },
  // === VINTAGE 2007 (period: 7/1/2006 to 7/1/2007) → label as 2007 ===
  "2007": {
    "Alabama": 18427, "Alaska": -2805, "Arizona": 90402, "Arkansas": 8323,
    "California": -263035, "Colorado": 33438, "Connecticut": -19377, "Delaware": 5224,
    "Florida": 35301, "Georgia": 94004, "Hawaii": -9673, "Idaho": 19569,
    "Illinois": -60265, "Indiana": -505, "Iowa": -2947, "Kansas": -2550,
    "Kentucky": 17357, "Louisiana": 28854, "Maine": -717, "Maryland": -36270,
    "Massachusetts": -35121, "Michigan": -94420, "Minnesota": -6025, "Mississippi": 2473,
    "Missouri": 6205, "Montana": 6463, "Nebraska": -4869, "Nevada": 41338,
    "New Hampshire": -2389, "New Jersey": -69160, "New Mexico": 8530, "New York": -189765,
    "North Carolina": 111963, "North Dakota": -1136, "Ohio": -51842, "Oklahoma": 13578,
    "Oregon": 26811, "Pennsylvania": -7377, "Rhode Island": -10031, "South Carolina": 53993,
    "South Dakota": 1910, "Tennessee": 48665, "Texas": 141280, "Utah": 24657,
    "Vermont": -1788, "Virginia": 2959, "Washington": 31009, "West Virginia": 2553,
    "Wisconsin": -6732, "Wyoming": 6654
  },
  // === VINTAGE 2008 (period: 7/1/2007 to 7/1/2008) → label as 2008 ===
  "2008": {
    "Alabama": 15118, "Alaska": -3732, "Arizona": 62980, "Arkansas": 6934,
    "California": -144061, "Colorado": 36878, "Connecticut": -14985, "Delaware": 4126,
    "Florida": -9286, "Georgia": 56674, "Hawaii": -3752, "Idaho": 12767,
    "Illinois": -52349, "Indiana": -1979, "Iowa": 411, "Kansas": 284,
    "Kentucky": 11828, "Louisiana": 13555, "Maine": -2063, "Maryland": -32161,
    "Massachusetts": -18675, "Michigan": -109257, "Minnesota": -7136, "Mississippi": -753,
    "Missouri": -2384, "Montana": 5986, "Nebraska": -1491, "Nevada": 16316,
    "New Hampshire": -2473, "New Jersey": -56208, "New Mexico": 1032, "New York": -126209,
    "North Carolina": 98074, "North Dakota": -381, "Ohio": -49752, "Oklahoma": 7954,
    "Oregon": 24756, "Pennsylvania": -11462, "Rhode Island": -8816, "South Carolina": 49736,
    "South Dakota": 2194, "Tennessee": 31198, "Texas": 140862, "Utah": 17605,
    "Vermont": -1703, "Virginia": 2678, "Washington": 40588, "West Virginia": 3788,
    "Wisconsin": -7022, "Wyoming": 5390
  },
  // === VINTAGE 2009 (period: 7/1/2008 to 7/1/2009) → label as 2009 ===
  "2009": {
    "Alabama": 11044, "Alaska": 979, "Arizona": 15111, "Arkansas": 5298,
    "California": -98798, "Colorado": 35591, "Connecticut": -7824, "Delaware": 2580,
    "Florida": -31179, "Georgia": 26604, "Hawaii": -5298, "Idaho": 1555,
    "Illinois": -48249, "Indiana": -6805, "Iowa": -2135, "Kansas": -1242,
    "Kentucky": 6268, "Louisiana": 14647, "Maine": -2937, "Maryland": -11163,
    "Massachusetts": 3614, "Michigan": -87339, "Minnesota": -8813, "Mississippi": -5529,
    "Missouri": -124, "Montana": 2410, "Nebraska": -956, "Nevada": -3801,
    "New Hampshire": -2602, "New Jersey": -31690, "New Mexico": 3366, "New York": -98178,
    "North Carolina": 59108, "North Dakota": 1375, "Ohio": -36278, "Oklahoma": 18345,
    "Oregon": 16173, "Pennsylvania": 1346, "Rhode Island": -6172, "South Carolina": 31480,
    "South Dakota": 1619, "Tennessee": 20605, "Texas": 143423, "Utah": 8623,
    "Vermont": -975, "Virginia": 18238, "Washington": 38201, "West Virginia": 4510,
    "Wisconsin": -5672, "Wyoming": 7192
  }
};

// 2010 data from Census PEP API (2019 vintage, PERIOD_CODE 2 = 7/1/2010 to 6/30/2011)
// We need to fetch this. For now, use the API data I already retrieved for Hawaii.
// Actually, I need all states for 2010. Let me hardcode from the API call.

// Population estimates for mid-year (used to compute rate per 10K)
// From Census intercensal estimates: st-est00int-alldata.csv
// We need populations for 2003-2010 to compute rates.
// Simpler approach: use the raw counts and population from the same vintage tables.
// Each table has Total Population Change. We can get population from intercensal estimates.

// Actually, for the 2010s we got RDOMESTICMIG from the API which is rate per 1000.
// For the 2000s tables, we only have counts. We need population to compute rates.
// Let me use the intercensal population estimates.

const fs = require('fs');

// Intercensal state population estimates (July 1 of each year)
// Source: Census st-est00int-alldata.csv
// I'll fetch these from the intercensal API
const https = require('https');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { rejectUnauthorized: false }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error(`Failed to parse: ${data.substring(0, 200)}`)); }
      });
    }).on('error', reject);
  });
}

async function main() {
  // Fetch intercensal population estimates for 2000-2010
  // Using the int_population dataset
  const popUrl = 'https://api.census.gov/data/2000/pep/int_population?get=GEONAME,POP,DATE_&for=state:*';
  console.log('Fetching intercensal population...');
  const popData = await fetchJSON(popUrl);

  // DATE_ codes: 1=4/1/2000 census, 2=4/1/2000 est base, 3=7/1/2000, 4=7/1/2001, ... 12=7/1/2009, 13=4/1/2010
  // So DATE_ 3=2000, 4=2001, 5=2002, 6=2003, 7=2004, 8=2005, 9=2006, 10=2007, 11=2008, 12=2009
  const statePop = {}; // state -> year -> population
  for (let i = 1; i < popData.length; i++) {
    const [name, pop, dateCode, stFips] = popData[i];
    const date = parseInt(dateCode);
    if (date < 3 || date > 12) continue; // skip census counts
    const year = 1997 + date; // DATE_ 3 = 2000, 4 = 2001, etc.
    const cleanName = name.replace(/^\./,'');
    if (!statePop[cleanName]) statePop[cleanName] = {};
    statePop[cleanName][year] = parseInt(pop);
  }

  // For 2010 population, fetch from 2019 vintage
  console.log('Fetching 2010 population...');
  const pop2010Url = 'https://api.census.gov/data/2019/pep/charagegroups?get=NAME,POP&for=state:*&DATE_CODE=2&AGEGROUP=0';
  try {
    const pop2010Data = await fetchJSON(pop2010Url);
    for (let i = 1; i < pop2010Data.length; i++) {
      const row = pop2010Data[i];
      const name = row[0];
      const pop = parseInt(row[1]);
      if (!statePop[name]) statePop[name] = {};
      statePop[name][2010] = pop;
    }
  } catch(e) {
    console.log('Could not fetch 2010 pop, will use 2009 as proxy');
  }

  // Fetch 2010 domestic migration for all states from PEP API
  console.log('Fetching 2010 migration from API...');
  const mig2010Url = 'https://api.census.gov/data/2019/pep/components?get=DOMESTICMIG,RDOMESTICMIG,PERIOD_DESC&for=state:*&PERIOD_CODE=2';
  const mig2010Data = await fetchJSON(mig2010Url);

  // FIPS to state name mapping
  const FIPS = {
    "01":"Alabama","02":"Alaska","04":"Arizona","05":"Arkansas","06":"California",
    "08":"Colorado","09":"Connecticut","10":"Delaware","11":"District of Columbia",
    "12":"Florida","13":"Georgia","15":"Hawaii","16":"Idaho","17":"Illinois",
    "18":"Indiana","19":"Iowa","20":"Kansas","21":"Kentucky","22":"Louisiana",
    "23":"Maine","24":"Maryland","25":"Massachusetts","26":"Michigan","27":"Minnesota",
    "28":"Mississippi","29":"Missouri","30":"Montana","31":"Nebraska","32":"Nevada",
    "33":"New Hampshire","34":"New Jersey","35":"New Mexico","36":"New York",
    "37":"North Carolina","38":"North Dakota","39":"Ohio","40":"Oklahoma","41":"Oregon",
    "42":"Pennsylvania","44":"Rhode Island","45":"South Carolina","46":"South Dakota",
    "47":"Tennessee","48":"Texas","49":"Utah","50":"Vermont","51":"Virginia",
    "53":"Washington","54":"West Virginia","55":"Wisconsin","56":"Wyoming"
  };

  domesticMig["2010"] = {};
  for (let i = 1; i < mig2010Data.length; i++) {
    const [domMig, rDomMig, periodDesc, fips] = mig2010Data[i];
    const stateName = FIPS[fips];
    if (stateName) {
      domesticMig["2010"][stateName] = parseInt(domMig);
    }
  }

  // Now compute rates per 10K for each state and year
  const states50 = Object.keys(domesticMig["2003"]).filter(s => s !== "District of Columbia");

  const ratesPerState = {}; // state -> year -> rate per 10K
  for (const state of states50) {
    ratesPerState[state] = {};
  }

  for (const year of ["2003","2004","2005","2006","2007","2008","2009","2010"]) {
    const yr = parseInt(year);
    for (const state of states50) {
      const mig = domesticMig[year][state];
      if (mig === undefined) continue;

      // Use mid-period population: average of start and end year
      // Migration in "2003" is 7/2002-7/2003, so use 2002-2003 avg population
      // For simplicity, use the ending year population
      let pop;
      if (year === "2010") {
        pop = statePop[state] && statePop[state][2010];
        if (!pop) pop = statePop[state] && statePop[state][2009];
      } else {
        pop = statePop[state] && statePop[state][yr];
        if (!pop) pop = statePop[state] && statePop[state][yr - 1];
      }

      if (pop) {
        ratesPerState[state][year] = Math.round((mig / pop) * 100000) / 10; // per 10K, 1 decimal
      }
    }
  }

  // Compute Hawaii values and other-state averages
  console.log('\n=== HAWAII VALUES (per 10K) ===');
  const hawaiiRates = {};
  const otherStateAvg = {};

  for (const year of ["2003","2004","2005","2006","2007","2008","2009","2010"]) {
    hawaiiRates[year] = ratesPerState["Hawaii"][year];

    // Other state average (excluding Hawaii)
    const otherRates = states50
      .filter(s => s !== "Hawaii")
      .map(s => ratesPerState[s][year])
      .filter(r => r !== undefined);

    const avg = otherRates.reduce((a, b) => a + b, 0) / otherRates.length;
    otherStateAvg[year] = Math.round(avg * 10) / 10;

    console.log(`${year}: Hawaii = ${hawaiiRates[year]}, Other State Avg = ${otherStateAvg[year]}`);
  }

  console.log('\n=== FOR data.js hawaii section ===');
  console.log(JSON.stringify(hawaiiRates, null, 2));
  console.log('\n=== FOR data.js otherStateAvg section ===');
  console.log(JSON.stringify(otherStateAvg, null, 2));

  // Also output state-level data for state-data.js
  console.log('\n=== STATE-LEVEL DATA (for state-data.js) ===');
  const stateData = {};
  for (const year of ["2003","2004","2005","2006","2007","2008","2009","2010"]) {
    stateData[year] = {};
    for (const state of states50.sort()) {
      if (ratesPerState[state][year] !== undefined) {
        stateData[year][state] = ratesPerState[state][year];
      }
    }
  }
  console.log(JSON.stringify(stateData, null, 2));
}

main().catch(console.error);
