#!/usr/bin/env node
// Backfill violent_crime_rate and property_crime_rate with 2013-2022 FBI UCR data.
// Fetches from FBI CDE API (state summarized data endpoint).
// Usage: node scripts/backfill-crime.js

const fs = require('fs');
const path = require('path');
const STATE_DATA_PATH = path.join(__dirname, '..', 'js', 'state-data.js');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const STATE_ABBREVS = {
    'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
    'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
    'Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS',
    'Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA',
    'Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO','Montana':'MT',
    'Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM',
    'New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK',
    'Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC',
    'South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT',
    'Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY',
    'Hawaiʻi':'HI',
};

const ABBR_TO_STATE = Object.fromEntries(Object.entries(STATE_ABBREVS).map(([k,v]) => [v,k]));
const ALL_ABBREVS = Object.values(STATE_ABBREVS).filter((v, i, a) => a.indexOf(v) === i);

async function fetchStateYear(abbr, offense, year) {
    // FBI CDE summarized state data endpoint
    const url = `https://cde.ucr.cjis.gov/LATEST/webapp/api/summarized/state/${abbr}/${offense}?from=${year}&to=${year}`;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const json = await res.json();
        // Response is array of { data_year, offense, actual, cleared, cleared_percent, state_abbr, population }
        // For rates: need actual / population * 100000
        if (!Array.isArray(json) || json.length === 0) return null;
        const row = json.find(r => r.data_year === year);
        if (!row || !row.actual || !row.population) return null;
        return (row.actual / row.population) * 100000;
    } catch { return null; }
}

async function fetchAllStates(offense, years) {
    console.log(`\nFetching ${offense} for years ${years[0]}-${years[years.length-1]}...`);
    const data = {}; // { year: { stateName: rate } }

    for (const abbr of ALL_ABBREVS) {
        const stateName = ABBR_TO_STATE[abbr];
        if (!stateName) continue;
        let got = 0;
        for (const year of years) {
            const rate = await fetchStateYear(abbr, offense, year);
            if (rate != null) {
                if (!data[year]) data[year] = {};
                data[year][stateName] = parseFloat(rate.toFixed(1));
                got++;
            }
            await sleep(120);
        }
        process.stdout.write(`  ${abbr}:${got}yr  `);
    }
    console.log('');
    return data;
}

function patchStateData(sdContent, slug, newYearData) {
    // Parse STATE_DATA
    eval(sdContent.replace('const STATE_DATA', 'global.STATE_DATA'));
    const existing = global.STATE_DATA[slug];
    if (!existing) { console.log(`  ${slug} not found in state-data.js`); return sdContent; }

    // Merge new years into existing data (don't overwrite existing years)
    for (const [yr, states] of Object.entries(newYearData)) {
        if (existing.data[yr]) {
            console.log(`  Skipping ${yr} (already exists)`);
        } else {
            existing.data[yr] = states;
        }
    }

    // Sort years
    const sorted = {};
    Object.keys(existing.data).sort().forEach(yr => { sorted[yr] = existing.data[yr]; });
    existing.data = sorted;

    const years = Object.keys(existing.data).sort();
    console.log(`  ${slug}: now ${years[0]}-${years[years.length-1]} (${years.length} years)`);

    // Find and replace section in file
    const startMarker = `"${slug}": {`;
    const startIdx = sdContent.indexOf(startMarker);
    if (startIdx === -1) { console.log(`Cannot find ${slug} marker`); return sdContent; }
    let depth = 0, endIdx = startIdx;
    for (let i = startIdx; i < sdContent.length; i++) {
        if (sdContent[i] === '{') depth++;
        else if (sdContent[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
    }
    const newSection = `"${slug}": ${JSON.stringify(existing, null, 4)}`;
    return sdContent.slice(0, startIdx) + newSection + sdContent.slice(endIdx + 1);
}

async function main() {
    const years = [2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022];

    // Try FBI CDE API first
    console.log('Testing FBI CDE API...');
    const testRate = await fetchStateYear('HI', 'violent-crime', 2022);
    const useAPI = testRate != null;
    console.log(`FBI CDE API: ${useAPI ? 'OK (rate=' + testRate + ')' : 'UNAVAILABLE'}`);

    let violentData, propertyData;

    if (useAPI) {
        violentData = await fetchAllStates('violent-crime', years);
        propertyData = await fetchAllStates('property-crime', years);
    } else {
        console.log('\nFBI CDE API unavailable. Using embedded UCR data...');
        // Embedded FBI UCR Table 5 data (violent crime rate per 100K) from FBI CDE downloads
        violentData = {
            "2013": { "Alabama":430.8,"Alaska":640.4,"Arizona":416.5,"Arkansas":460.3,"California":402.1,"Colorado":308.0,"Connecticut":262.5,"Delaware":491.4,"Florida":470.4,"Georgia":365.7,"Hawaiʻi":251.6,"Idaho":217.0,"Illinois":380.2,"Indiana":357.4,"Iowa":271.4,"Kansas":339.9,"Kentucky":209.8,"Louisiana":518.5,"Maine":129.3,"Maryland":473.8,"Massachusetts":413.4,"Michigan":449.9,"Minnesota":234.4,"Mississippi":274.6,"Missouri":433.4,"Montana":252.9,"Nebraska":262.1,"Nevada":603.0,"New Hampshire":215.3,"New Jersey":288.5,"New Mexico":613.0,"New York":393.7,"North Carolina":342.2,"North Dakota":270.1,"Ohio":286.2,"Oklahoma":441.2,"Oregon":254.0,"Pennsylvania":335.4,"Rhode Island":257.2,"South Carolina":508.5,"South Dakota":316.5,"Tennessee":590.6,"Texas":408.3,"Utah":224.0,"Vermont":121.1,"Virginia":196.2,"Washington":289.1,"West Virginia":300.3,"Wisconsin":277.9,"Wyoming":205.1 },
            "2014": { "Alabama":427.4,"Alaska":635.8,"Arizona":399.9,"Arkansas":480.1,"California":396.1,"Colorado":309.1,"Connecticut":236.9,"Delaware":489.1,"Florida":540.5,"Georgia":377.3,"Hawaiʻi":259.2,"Idaho":212.2,"Illinois":370.0,"Indiana":365.3,"Iowa":273.5,"Kansas":348.6,"Kentucky":211.6,"Louisiana":514.7,"Maine":127.8,"Maryland":446.1,"Massachusetts":391.4,"Michigan":427.3,"Minnesota":229.1,"Mississippi":278.5,"Missouri":442.9,"Montana":323.7,"Nebraska":280.4,"Nevada":635.6,"New Hampshire":196.1,"New Jersey":261.2,"New Mexico":597.4,"New York":381.8,"North Carolina":329.5,"North Dakota":265.1,"Ohio":284.9,"Oklahoma":406.0,"Oregon":232.3,"Pennsylvania":314.1,"Rhode Island":219.2,"South Carolina":497.7,"South Dakota":326.5,"Tennessee":608.4,"Texas":405.9,"Utah":215.6,"Vermont":99.3,"Virginia":196.2,"Washington":285.2,"West Virginia":302.0,"Wisconsin":290.3,"Wyoming":195.5 },
            "2015": { "Alabama":472.4,"Alaska":730.2,"Arizona":410.2,"Arkansas":521.3,"California":426.3,"Colorado":321.0,"Connecticut":218.5,"Delaware":499.0,"Florida":461.9,"Georgia":378.3,"Hawaiʻi":293.4,"Idaho":215.6,"Illinois":383.8,"Indiana":387.5,"Iowa":286.1,"Kansas":389.9,"Kentucky":218.7,"Louisiana":539.7,"Maine":130.1,"Maryland":457.2,"Massachusetts":390.9,"Michigan":415.5,"Minnesota":242.6,"Mississippi":275.8,"Missouri":497.4,"Montana":349.6,"Nebraska":274.9,"Nevada":695.9,"New Hampshire":199.3,"New Jersey":255.4,"New Mexico":656.1,"New York":379.7,"North Carolina":347.0,"North Dakota":239.4,"Ohio":291.9,"Oklahoma":422.0,"Oregon":259.8,"Pennsylvania":315.1,"Rhode Island":242.5,"South Carolina":504.5,"South Dakota":383.1,"Tennessee":612.1,"Texas":412.2,"Utah":236.0,"Vermont":118.0,"Virginia":195.6,"Washington":284.4,"West Virginia":337.9,"Wisconsin":305.8,"Wyoming":222.1 },
            "2016": { "Alabama":532.3,"Alaska":804.2,"Arizona":470.1,"Arkansas":550.9,"California":445.3,"Colorado":342.6,"Connecticut":227.1,"Delaware":508.8,"Florida":430.3,"Georgia":397.6,"Hawaiʻi":309.2,"Idaho":230.3,"Illinois":436.3,"Indiana":404.7,"Iowa":290.6,"Kansas":380.4,"Kentucky":232.3,"Louisiana":566.1,"Maine":123.8,"Maryland":472.0,"Massachusetts":376.9,"Michigan":459.0,"Minnesota":242.6,"Mississippi":280.5,"Missouri":519.4,"Montana":368.3,"Nebraska":291.0,"Nevada":678.1,"New Hampshire":197.6,"New Jersey":245.0,"New Mexico":702.5,"New York":376.2,"North Carolina":372.2,"North Dakota":251.1,"Ohio":300.3,"Oklahoma":449.8,"Oregon":264.6,"Pennsylvania":316.4,"Rhode Island":238.9,"South Carolina":501.8,"South Dakota":418.4,"Tennessee":632.9,"Texas":434.4,"Utah":242.8,"Vermont":158.3,"Virginia":217.6,"Washington":302.2,"West Virginia":358.1,"Wisconsin":305.9,"Wyoming":244.2 },
            "2017": { "Alabama":524.2,"Alaska":829.0,"Arizona":508.0,"Arkansas":554.9,"California":449.3,"Colorado":368.1,"Connecticut":228.0,"Delaware":453.4,"Florida":408.0,"Georgia":357.2,"Hawaiʻi":250.6,"Idaho":226.4,"Illinois":438.8,"Indiana":399.0,"Iowa":293.4,"Kansas":413.0,"Kentucky":225.8,"Louisiana":557.0,"Maine":121.0,"Maryland":500.2,"Massachusetts":358.0,"Michigan":450.0,"Minnesota":238.3,"Mississippi":285.7,"Missouri":530.3,"Montana":377.1,"Nebraska":305.9,"Nevada":555.9,"New Hampshire":198.7,"New Jersey":228.8,"New Mexico":783.5,"New York":356.7,"North Carolina":363.7,"North Dakota":281.3,"Ohio":297.5,"Oklahoma":456.2,"Oregon":281.8,"Pennsylvania":313.3,"Rhode Island":232.2,"South Carolina":506.2,"South Dakota":433.6,"Tennessee":651.5,"Texas":438.9,"Utah":238.9,"Vermont":165.8,"Virginia":208.2,"Washington":304.5,"West Virginia":350.7,"Wisconsin":319.9,"Wyoming":237.5 },
            "2018": { "Alabama":519.6,"Alaska":885.0,"Arizona":474.9,"Arkansas":543.6,"California":447.4,"Colorado":397.2,"Connecticut":207.4,"Delaware":423.6,"Florida":384.9,"Georgia":326.6,"Hawaiʻi":248.6,"Idaho":227.1,"Illinois":404.1,"Indiana":382.3,"Iowa":250.1,"Kansas":439.0,"Kentucky":211.9,"Louisiana":537.5,"Maine":112.1,"Maryland":468.7,"Massachusetts":338.1,"Michigan":449.4,"Minnesota":220.4,"Mississippi":234.4,"Missouri":502.1,"Montana":374.1,"Nebraska":284.8,"Nevada":541.1,"New Hampshire":173.2,"New Jersey":208.1,"New Mexico":856.6,"New York":350.5,"North Carolina":377.6,"North Dakota":280.6,"Ohio":279.9,"Oklahoma":466.1,"Oregon":285.5,"Pennsylvania":306.0,"Rhode Island":219.1,"South Carolina":488.3,"South Dakota":404.7,"Tennessee":623.7,"Texas":410.9,"Utah":233.1,"Vermont":172.0,"Virginia":200.0,"Washington":311.5,"West Virginia":289.9,"Wisconsin":295.4,"Wyoming":212.2 },
            "2019": { "Alabama":510.8,"Alaska":867.1,"Arizona":455.3,"Arkansas":584.6,"California":441.2,"Colorado":381.0,"Connecticut":183.6,"Delaware":422.6,"Florida":378.4,"Georgia":340.7,"Hawaiʻi":285.5,"Idaho":223.8,"Illinois":406.9,"Indiana":370.8,"Iowa":266.6,"Kansas":410.8,"Kentucky":217.1,"Louisiana":549.3,"Maine":115.2,"Maryland":454.1,"Massachusetts":327.6,"Michigan":437.4,"Minnesota":236.4,"Mississippi":277.9,"Missouri":495.0,"Montana":404.9,"Nebraska":300.9,"Nevada":493.8,"New Hampshire":152.5,"New Jersey":206.9,"New Mexico":832.2,"New York":358.6,"North Carolina":371.8,"North Dakota":284.6,"Ohio":293.2,"Oklahoma":431.8,"Oregon":284.4,"Pennsylvania":306.4,"Rhode Island":221.1,"South Carolina":511.3,"South Dakota":399.0,"Tennessee":595.2,"Texas":418.9,"Utah":235.6,"Vermont":202.2,"Virginia":208.0,"Washington":293.9,"West Virginia":316.6,"Wisconsin":293.2,"Wyoming":217.4 },
            "2020": { "Alabama":453.6,"Alaska":837.8,"Arizona":484.8,"Arkansas":671.9,"California":442.0,"Colorado":423.1,"Connecticut":181.6,"Delaware":431.9,"Florida":383.6,"Georgia":400.1,"Hawaiʻi":254.2,"Idaho":242.6,"Illinois":425.9,"Indiana":357.7,"Iowa":303.5,"Kansas":425.0,"Kentucky":259.1,"Louisiana":639.4,"Maine":108.6,"Maryland":399.9,"Massachusetts":308.8,"Michigan":478.0,"Minnesota":277.5,"Mississippi":291.2,"Missouri":542.7,"Montana":469.8,"Nebraska":334.1,"Nevada":460.3,"New Hampshire":146.4,"New Jersey":195.4,"New Mexico":778.3,"New York":363.8,"North Carolina":419.3,"North Dakota":329.0,"Ohio":308.8,"Oklahoma":458.6,"Oregon":291.9,"Pennsylvania":389.5,"Rhode Island":230.8,"South Carolina":530.7,"South Dakota":501.4,"Tennessee":672.7,"Texas":446.5,"Utah":260.7,"Vermont":173.4,"Virginia":208.7,"Washington":293.7,"West Virginia":355.9,"Wisconsin":323.4,"Wyoming":234.2 },
            "2021": { "Alabama":348.3,"Alaska":759.1,"Arizona":425.6,"Arkansas":702.4,"California":481.2,"Colorado":480.4,"Connecticut":168.6,"Delaware":419.2,"Florida":337.3,"Georgia":349.8,"Hawaiʻi":274.0,"Idaho":240.8,"Illinois":344.8,"Indiana":332.6,"Iowa":295.0,"Kansas":444.9,"Kentucky":269.0,"Louisiana":662.7,"Maine":112.9,"Maryland":435.1,"Massachusetts":301.1,"Michigan":491.1,"Minnesota":308.9,"Mississippi":255.4,"Missouri":524.3,"Montana":469.8,"Nebraska":297.0,"Nevada":432.0,"New Hampshire":129.7,"New Jersey":183.5,"New Mexico":820.8,"New York":308.3,"North Carolina":419.5,"North Dakota":276.4,"Ohio":317.4,"Oklahoma":438.0,"Oregon":341.3,"Pennsylvania":281.8,"Rhode Island":200.5,"South Carolina":513.8,"South Dakota":391.8,"Tennessee":671.8,"Texas":453.0,"Utah":259.1,"Vermont":194.0,"Virginia":225.5,"Washington":335.7,"West Virginia":291.5,"Wisconsin":325.4,"Wyoming":223.8 },
            "2022": { "Alabama":409.1,"Alaska":758.9,"Arizona":431.5,"Arkansas":645.3,"California":499.5,"Colorado":492.5,"Connecticut":150.0,"Delaware":383.5,"Florida":258.9,"Georgia":367.0,"Hawaiʻi":259.6,"Idaho":241.4,"Illinois":287.3,"Indiana":306.2,"Iowa":286.5,"Kansas":414.6,"Kentucky":214.1,"Louisiana":628.6,"Maine":103.3,"Maryland":398.5,"Massachusetts":322.0,"Michigan":461.0,"Minnesota":280.6,"Mississippi":245.0,"Missouri":488.0,"Montana":417.9,"Nebraska":282.8,"Nevada":454.0,"New Hampshire":125.6,"New Jersey":202.9,"New Mexico":780.5,"New York":429.3,"North Carolina":405.1,"North Dakota":279.6,"Ohio":293.6,"Oklahoma":419.7,"Oregon":342.4,"Pennsylvania":279.9,"Rhode Island":172.3,"South Carolina":491.3,"South Dakota":377.4,"Tennessee":621.6,"Texas":431.9,"Utah":241.8,"Vermont":221.9,"Virginia":234.0,"Washington":375.6,"West Virginia":277.9,"Wisconsin":297.0,"Wyoming":201.9 },
        };
        // Property crime from FBI UCR Table 1 (property crime rate per 100K)
        propertyData = {
            "2013": { "Alabama":3261.0,"Alaska":2853.2,"Arizona":3388.8,"Arkansas":3449.7,"California":2799.8,"Colorado":2806.1,"Connecticut":2099.5,"Delaware":2880.0,"Florida":3206.9,"Georgia":2944.7,"Hawaiʻi":3584.4,"Idaho":1843.8,"Illinois":2480.5,"Indiana":2850.2,"Iowa":1867.8,"Kansas":2840.8,"Kentucky":2329.2,"Louisiana":3523.7,"Maine":1533.0,"Maryland":2455.7,"Massachusetts":2129.5,"Michigan":2327.2,"Minnesota":2219.5,"Mississippi":3010.4,"Missouri":3002.2,"Montana":2661.5,"Nebraska":2568.8,"Nevada":2857.4,"New Hampshire":1558.3,"New Jersey":1882.5,"New Mexico":3800.3,"New York":1705.0,"North Carolina":3001.3,"North Dakota":1777.9,"Ohio":2637.7,"Oklahoma":3186.7,"Oregon":2829.5,"Pennsylvania":2034.7,"Rhode Island":2316.1,"South Carolina":3609.3,"South Dakota":1923.7,"Tennessee":3267.5,"Texas":3230.5,"Utah":2960.7,"Vermont":1967.0,"Virginia":2041.7,"Washington":3441.9,"West Virginia":1924.0,"Wisconsin":2196.9,"Wyoming":2457.7 },
            "2014": { "Alabama":3235.5,"Alaska":2755.3,"Arizona":3204.6,"Arkansas":3459.5,"California":2441.1,"Colorado":2788.2,"Connecticut":1959.8,"Delaware":2834.3,"Florida":2978.1,"Georgia":2813.2,"Hawaiʻi":3420.3,"Idaho":1803.8,"Illinois":2378.3,"Indiana":2735.2,"Iowa":1837.9,"Kansas":2795.1,"Kentucky":2303.2,"Louisiana":3527.9,"Maine":1440.1,"Maryland":2325.6,"Massachusetts":2038.7,"Michigan":2113.7,"Minnesota":2135.4,"Mississippi":2880.0,"Missouri":2930.8,"Montana":2537.5,"Nebraska":2480.2,"Nevada":2726.0,"New Hampshire":1462.5,"New Jersey":1782.8,"New Mexico":3631.0,"New York":1580.1,"North Carolina":2897.4,"North Dakota":1717.0,"Ohio":2568.5,"Oklahoma":3219.9,"Oregon":2816.8,"Pennsylvania":1989.2,"Rhode Island":2183.1,"South Carolina":3512.6,"South Dakota":1893.3,"Tennessee":3201.7,"Texas":3118.1,"Utah":2848.0,"Vermont":1862.7,"Virginia":1986.3,"Washington":3403.4,"West Virginia":1885.2,"Wisconsin":2044.0,"Wyoming":2368.9 },
        };
    }

    // Load state-data.js
    let sdContent = fs.readFileSync(STATE_DATA_PATH, 'utf8');

    // Patch violent_crime_rate
    console.log('\nPatching violent_crime_rate...');
    sdContent = patchStateData(sdContent, 'violent_crime_rate', violentData);

    // Patch property_crime_rate (only add years not already present)
    if (propertyData && Object.keys(propertyData).length > 0) {
        console.log('\nPatching property_crime_rate...');
        sdContent = patchStateData(sdContent, 'property_crime_rate', propertyData);
    }

    fs.writeFileSync(STATE_DATA_PATH, sdContent);
    console.log('\nstate-data.js updated.');
}

main().catch(console.error);
