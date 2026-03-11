#!/usr/bin/env node
/**
 * Back-calculate PCP counts from CHR rates (per 100K total pop),
 * then recompute per 100K civilian noninstitutionalized population.
 *
 * Sources:
 *   - CHR rates: pcp_per_100k_data.json (HRSA AHRF via County Health Rankings)
 *   - Total population: Census ACS 1-Year, B01003_001E
 *   - Civilian noninst pop: Census ACS 1-Year, B27001_001E
 *
 * Note: 2020 ACS 1-Year was experimental / not released for many areas.
 *       We use Census PEP for 2020 population and interpolate civilian ratio.
 */

const https = require('https');
const path = require('path');

const chrData = require(path.join(__dirname, '..', '..', 'CP-1', 'pcp_per_100k_data.json'));
const chr = chrData.data_chr;

// State abbrev -> FIPS
const FIPS = {
  AL:'01',AK:'02',AZ:'04',AR:'05',CA:'06',CO:'08',CT:'09',DE:'10',
  FL:'12',GA:'13',HI:'15',ID:'16',IL:'17',IN:'18',IA:'19',KS:'20',
  KY:'21',LA:'22',ME:'23',MD:'24',MA:'25',MI:'26',MN:'27',MS:'28',
  MO:'29',MT:'30',NE:'31',NV:'32',NH:'33',NJ:'34',NM:'35',NY:'36',
  NC:'37',ND:'38',OH:'39',OK:'40',OR:'41',PA:'42',RI:'44',SC:'45',
  SD:'46',TN:'47',TX:'48',UT:'49',VT:'50',VA:'51',WA:'53',WV:'54',
  WI:'55',WY:'56'
};

const NAMES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
  CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',
  HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',
  KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',
  MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',
  NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
  NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',
  OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',
  SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',
  UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',
  WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'
};

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode !== 200) reject(new Error(`${res.statusCode}: ${d.slice(0,200)}`));
        else resolve(d);
      });
    }).on('error', reject);
  });
}

async function fetchACS(year, variables) {
  // ACS 1-Year: for=state:*
  const url = `https://api.census.gov/data/${year}/acs/acs1?get=${variables.join(',')}&for=state:*`;
  console.error(`  Fetching ACS ${year}: ${variables.join(',')}`);
  const raw = await fetch(url);
  const rows = JSON.parse(raw);
  const header = rows[0];
  const stateIdx = header.indexOf('state');
  const result = {};
  for (let i = 1; i < rows.length; i++) {
    const fips = rows[i][stateIdx];
    const obj = {};
    for (let j = 0; j < variables.length; j++) {
      obj[variables[j]] = parseInt(rows[i][j], 10);
    }
    result[fips] = obj;
  }
  return result;
}

async function fetchPEP2020() {
  // Census PEP 2020 vintage for total population
  const url = 'https://api.census.gov/data/2021/pep/population?get=POP_2020&for=state:*';
  console.error('  Fetching PEP 2020 population');
  const raw = await fetch(url);
  const rows = JSON.parse(raw);
  const header = rows[0];
  const stateIdx = header.indexOf('state');
  const popIdx = header.indexOf('POP_2020');
  const result = {};
  for (let i = 1; i < rows.length; i++) {
    result[rows[i][stateIdx]] = parseInt(rows[i][popIdx], 10);
  }
  return result;
}

async function main() {
  const years = [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021];

  // Store: { fips: { year: { totalPop, civilianPop } } }
  const popData = {};

  for (const year of years) {
    if (year === 2020) {
      // 2020 ACS 1-Year experimental - try fetching, fallback to PEP
      try {
        const acs = await fetchACS(2020, ['B01003_001E', 'B27001_001E']);
        for (const [fips, vals] of Object.entries(acs)) {
          if (!popData[fips]) popData[fips] = {};
          popData[fips][2020] = { totalPop: vals.B01003_001E, civilianPop: vals.B27001_001E };
        }
        console.error('  Got 2020 ACS data');
      } catch (e) {
        console.error(`  2020 ACS failed (${e.message}), using PEP + interpolated civilian ratio`);
        const pep = await fetchPEP2020();
        for (const [fips, totalPop] of Object.entries(pep)) {
          if (!popData[fips]) popData[fips] = {};
          // Interpolate civilian ratio from 2019 and 2021
          const r2019 = popData[fips]?.[2019];
          if (r2019) {
            const civRatio = r2019.civilianPop / r2019.totalPop;
            popData[fips][2020] = { totalPop, civilianPop: Math.round(totalPop * civRatio) };
          } else {
            popData[fips][2020] = { totalPop, civilianPop: Math.round(totalPop * 0.97) };
          }
        }
      }
      continue;
    }

    try {
      const acs = await fetchACS(year, ['B01003_001E', 'B27001_001E']);
      for (const [fips, vals] of Object.entries(acs)) {
        if (!popData[fips]) popData[fips] = {};
        popData[fips][year] = { totalPop: vals.B01003_001E, civilianPop: vals.B27001_001E };
      }
    } catch (e) {
      console.error(`  Year ${year} failed: ${e.message}`);
    }
  }

  // If 2020 used PEP and we now have 2021, re-interpolate with average of 2019+2021 civilian ratios
  for (const fips of Object.keys(popData)) {
    if (popData[fips][2020] && popData[fips][2019] && popData[fips][2021]) {
      const r19 = popData[fips][2019].civilianPop / popData[fips][2019].totalPop;
      const r21 = popData[fips][2021].civilianPop / popData[fips][2021].totalPop;
      const avgRatio = (r19 + r21) / 2;
      popData[fips][2020].civilianPop = Math.round(popData[fips][2020].totalPop * avgRatio);
    }
  }

  // Now compute adjusted rates
  // For each state abbreviation in CHR data:
  const adjustedByState = {}; // abbrev -> { year: adjustedRate }
  const allStates = Object.keys(chr);

  for (const st of allStates) {
    const fips = FIPS[st];
    adjustedByState[st] = {};

    for (const [yearStr, chrRate] of Object.entries(chr[st])) {
      const year = parseInt(yearStr, 10);
      const pop = popData[fips]?.[year];
      if (!pop || !pop.totalPop || !pop.civilianPop) {
        console.error(`  Missing pop for ${st} ${year}`);
        continue;
      }
      // Back-calculate PCP count from CHR rate
      const pcpCount = chrRate * pop.totalPop / 100000;
      // Recompute per 100K civilian pop
      const civilianRate = pcpCount / pop.civilianPop * 100000;
      adjustedByState[st][yearStr] = Math.round(civilianRate * 10) / 10;
    }
  }

  // Compute Hawaii and other-state averages
  console.log('\n=== HAWAII (civilian-adjusted) ===');
  for (const y of years.map(String)) {
    if (adjustedByState.HI[y]) console.log(`  ${y}: ${adjustedByState.HI[y]}`);
  }

  console.log('\n=== OTHER STATE AVG (civilian-adjusted, excl HI) ===');
  for (const y of years.map(String)) {
    const vals = allStates.filter(s => s !== 'HI' && adjustedByState[s][y] !== undefined)
      .map(s => adjustedByState[s][y]);
    if (vals.length) {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      console.log(`  ${y}: ${Math.round(avg * 10) / 10} (n=${vals.length})`);
    }
  }

  // Show difference for key military states
  console.log('\n=== MILITARY IMPACT (original vs civilian-adjusted) ===');
  const milStates = ['HI', 'VA', 'NC', 'TX', 'CA', 'CO', 'AK', 'WA'];
  for (const st of milStates) {
    const orig = chr[st]?.['2021'];
    const adj = adjustedByState[st]?.['2021'];
    if (orig && adj) {
      const diff = ((adj - orig) / orig * 100).toFixed(1);
      console.log(`  ${st}: ${orig} -> ${adj} (+${diff}%)`);
    }
  }

  // Output full adjusted data as JSON for data.js and state-data.js
  const output = { adjustedByState };
  require('fs').writeFileSync(
    path.join(__dirname, '..', 'pcp_civilian_adjusted.json'),
    JSON.stringify(output, null, 2)
  );
  console.log('\nWrote pcp_civilian_adjusted.json');
}

main().catch(e => { console.error(e); process.exit(1); });
