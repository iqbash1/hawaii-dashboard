#!/usr/bin/env node
// Replace net_estab_growth_pct with net_employer_formation in state-data.js

const fs = require('fs');

const stateData = JSON.parse(fs.readFileSync('/tmp/business-state-data.json', 'utf8'));

// We need the net formation data (entry - exit), not the raw entry rate or QCEW data
// Read from the BDS fetch we already did - but we need entry-exit, not entry alone
// Actually we need to recompute. Let's read the estabs_entry_rate state data and
// compute net = entry_rate[state] - exit_rate[state]
// But we don't have exit rate in state-data yet. Let's just hardcode the precomputed data.

// Read the precomputed net formation data from stdin or hardcode
const netFormationData = {
  "2012":{"Alabama":-0.06,"Alaska":0.43,"Arizona":0.14,"Arkansas":-0.12,"California":1.08,"Colorado":0.69,"Connecticut":0.36,"Delaware":-0.04,"Florida":2.23,"Georgia":0.29,"Hawaii":-0.72,"Idaho":0.3,"Illinois":0.13,"Indiana":0.14,"Iowa":0.39,"Kansas":-0.11,"Kentucky":0.15,"Louisiana":0.55,"Maine":-0.22,"Maryland":0.65,"Massachusetts":0.77,"Michigan":0.09,"Minnesota":0.27,"Mississippi":-0.52,"Missouri":-0.19,"Montana":1.11,"Nebraska":0.68,"Nevada":0.61,"New Hampshire":0.59,"New Jersey":0.89,"New Mexico":0,"New York":1.37,"North Carolina":0.52,"North Dakota":3.87,"Ohio":0.01,"Oklahoma":0.81,"Oregon":0.33,"Pennsylvania":0.2,"Rhode Island":0.09,"South Carolina":0.11,"South Dakota":1.14,"Tennessee":-0.12,"Texas":1.66,"Utah":1.88,"Vermont":0.31,"Virginia":0.25,"Washington":0.08,"West Virginia":-0.61,"Wisconsin":-0.09,"Wyoming":1.07},
  "2013":{"Alabama":-0.39,"Alaska":0.7,"Arizona":0.94,"Arkansas":0.05,"California":0.85,"Colorado":1.35,"Connecticut":-0.02,"Delaware":0.44,"Florida":1.56,"Georgia":0.7,"Hawaii":0.3,"Idaho":0.79,"Illinois":0.04,"Indiana":-0.46,"Iowa":-0.3,"Kansas":-0.45,"Kentucky":0.47,"Louisiana":0.11,"Maine":-0.09,"Maryland":0.54,"Massachusetts":0.5,"Michigan":-0.18,"Minnesota":0.41,"Mississippi":-0.31,"Missouri":1.26,"Montana":0.84,"Nebraska":0.28,"Nevada":1.3,"New Hampshire":0.17,"New Jersey":0.36,"New Mexico":-0.23,"New York":0.58,"North Carolina":0.42,"North Dakota":2.64,"Ohio":-0.31,"Oklahoma":0.62,"Oregon":1.15,"Pennsylvania":0.23,"Rhode Island":-0.27,"South Carolina":0.27,"South Dakota":0.57,"Tennessee":0.33,"Texas":1.68,"Utah":2.16,"Vermont":-0.51,"Virginia":0.54,"Washington":0.98,"West Virginia":-1.25,"Wisconsin":-0.36,"Wyoming":0.02},
  "2014":{"Alabama":0.41,"Alaska":0.99,"Arizona":1.61,"Arkansas":0.04,"California":1.81,"Colorado":2.09,"Connecticut":0.19,"Delaware":0.38,"Florida":1.81,"Georgia":1.32,"Hawaii":0.69,"Idaho":2.32,"Illinois":0.35,"Indiana":-0.03,"Iowa":0.04,"Kansas":0.6,"Kentucky":1.19,"Louisiana":0.56,"Maine":0.7,"Maryland":0.78,"Massachusetts":0.71,"Michigan":0.26,"Minnesota":1.11,"Mississippi":0.37,"Missouri":1.96,"Montana":0.8,"Nebraska":1.26,"Nevada":2.54,"New Hampshire":0.61,"New Jersey":0.33,"New Mexico":-0.04,"New York":0.77,"North Carolina":0.53,"North Dakota":2.65,"Ohio":0.27,"Oklahoma":0.9,"Oregon":1.43,"Pennsylvania":0.12,"Rhode Island":0.15,"South Carolina":0.81,"South Dakota":0.44,"Tennessee":0.66,"Texas":2.11,"Utah":2.38,"Vermont":0.04,"Virginia":0.82,"Washington":1.44,"West Virginia":-1.12,"Wisconsin":0.44,"Wyoming":0.66},
  "2015":{"Alabama":0.66,"Alaska":1.02,"Arizona":1.41,"Arkansas":0.37,"California":1.77,"Colorado":2.04,"Connecticut":0.14,"Delaware":0.96,"Florida":2.29,"Georgia":1.59,"Hawaii":0.46,"Idaho":2.02,"Illinois":0.72,"Indiana":1.16,"Iowa":0.71,"Kansas":0.53,"Kentucky":0.8,"Louisiana":0.51,"Maine":0.88,"Maryland":0.41,"Massachusetts":0.59,"Michigan":1.05,"Minnesota":1.02,"Mississippi":0.02,"Missouri":1.94,"Montana":1.4,"Nebraska":1.25,"Nevada":2.83,"New Hampshire":0.49,"New Jersey":-0.02,"New Mexico":0.37,"New York":0.5,"North Carolina":1.32,"North Dakota":1.81,"Ohio":0.7,"Oklahoma":0.7,"Oregon":2.28,"Pennsylvania":0.31,"Rhode Island":0.9,"South Carolina":1.58,"South Dakota":1.51,"Tennessee":1.19,"Texas":1.83,"Utah":2.58,"Vermont":0.67,"Virginia":0.9,"Washington":2.08,"West Virginia":-0.34,"Wisconsin":0.94,"Wyoming":1.44},
  "2016":{"Alabama":1.39,"Alaska":1.15,"Arizona":2.42,"Arkansas":1.34,"California":2.02,"Colorado":2.81,"Connecticut":1.8,"Delaware":2.47,"Florida":2.98,"Georgia":2.2,"Hawaii":1.34,"Idaho":2.43,"Illinois":1.05,"Indiana":1.55,"Iowa":1.12,"Kansas":1.2,"Kentucky":0.62,"Louisiana":0.77,"Maine":2.31,"Maryland":1.57,"Massachusetts":2.14,"Michigan":1.31,"Minnesota":1.57,"Mississippi":0.51,"Missouri":2.4,"Montana":1.26,"Nebraska":1.5,"Nevada":2.92,"New Hampshire":1.73,"New Jersey":1.21,"New Mexico":0.23,"New York":1.34,"North Carolina":2.35,"North Dakota":-0.11,"Ohio":1.45,"Oklahoma":0.57,"Oregon":2.22,"Pennsylvania":1.18,"Rhode Island":2.22,"South Carolina":2.44,"South Dakota":1.45,"Tennessee":1.84,"Texas":2.22,"Utah":2.66,"Vermont":0.49,"Virginia":1.53,"Washington":2.03,"West Virginia":-0.54,"Wisconsin":2,"Wyoming":-0.43},
  "2017":{"Alabama":0.21,"Alaska":-0.17,"Arizona":1.6,"Arkansas":0.65,"California":1.17,"Colorado":1.78,"Connecticut":-0.99,"Delaware":0.11,"Florida":1.44,"Georgia":1.48,"Hawaii":0.46,"Idaho":1.71,"Illinois":-0.01,"Indiana":0.45,"Iowa":-0.08,"Kansas":-0.45,"Kentucky":-0.51,"Louisiana":-0.46,"Maine":0.04,"Maryland":0.04,"Massachusetts":0.61,"Michigan":-0.14,"Minnesota":0.37,"Mississippi":-0.03,"Missouri":0.14,"Montana":0.33,"Nebraska":0.62,"Nevada":1.32,"New Hampshire":-0.27,"New Jersey":0.13,"New Mexico":-0.37,"New York":0.18,"North Carolina":1.69,"North Dakota":-1.02,"Ohio":-1.17,"Oklahoma":-0.36,"Oregon":1.48,"Pennsylvania":-0.29,"Rhode Island":-0.05,"South Carolina":1.55,"South Dakota":0.06,"Tennessee":0.83,"Texas":1.22,"Utah":2.11,"Vermont":-0.41,"Virginia":0.43,"Washington":1.43,"West Virginia":-1.27,"Wisconsin":-0.09,"Wyoming":-0.55},
  "2018":{"Alabama":-0.22,"Alaska":0.13,"Arizona":1.17,"Arkansas":0.32,"California":0.97,"Colorado":1.42,"Connecticut":-0.75,"Delaware":0.96,"Florida":1.24,"Georgia":0.84,"Hawaii":0.58,"Idaho":3.4,"Illinois":-0.28,"Indiana":0.22,"Iowa":0.72,"Kansas":-0.42,"Kentucky":-0.45,"Louisiana":-0.26,"Maine":0.13,"Maryland":0.14,"Massachusetts":0.14,"Michigan":0.23,"Minnesota":-0.42,"Mississippi":-0.04,"Missouri":-0.01,"Montana":1.02,"Nebraska":-0.31,"Nevada":2.16,"New Hampshire":0.32,"New Jersey":-0.16,"New Mexico":-0.49,"New York":-0.07,"North Carolina":1.08,"North Dakota":-0.4,"Ohio":-0.47,"Oklahoma":-0.1,"Oregon":1.33,"Pennsylvania":0.25,"Rhode Island":-0.4,"South Carolina":1.18,"South Dakota":0.4,"Tennessee":0.5,"Texas":1.16,"Utah":2.4,"Vermont":-0.47,"Virginia":0.17,"Washington":1.43,"West Virginia":-1.31,"Wisconsin":-0.08,"Wyoming":0.66},
  "2019":{"Alabama":1,"Alaska":0.52,"Arizona":1.6,"Arkansas":0.89,"California":1.54,"Colorado":1.53,"Connecticut":0.35,"Delaware":1.57,"Florida":2,"Georgia":1.72,"Hawaii":0.74,"Idaho":3.39,"Illinois":0.23,"Indiana":0.84,"Iowa":0.11,"Kansas":0.06,"Kentucky":0.77,"Louisiana":0.48,"Maine":0.99,"Maryland":0.57,"Massachusetts":1.05,"Michigan":0.22,"Minnesota":0.27,"Mississippi":0.28,"Missouri":0.86,"Montana":1.18,"Nebraska":0.39,"Nevada":1.78,"New Hampshire":0.99,"New Jersey":0.77,"New Mexico":0.68,"New York":0.54,"North Carolina":1.52,"North Dakota":1.09,"Ohio":0,"Oklahoma":0.59,"Oregon":0.83,"Pennsylvania":0.3,"Rhode Island":0.82,"South Carolina":1.62,"South Dakota":0.5,"Tennessee":1.39,"Texas":1.96,"Utah":2.38,"Vermont":-0.42,"Virginia":1.2,"Washington":1.19,"West Virginia":0.15,"Wisconsin":0.52,"Wyoming":0.95},
  "2020":{"Alabama":-0.09,"Alaska":-0.07,"Arizona":1.24,"Arkansas":0.29,"California":1.75,"Colorado":0.56,"Connecticut":-0.59,"Delaware":3.95,"Florida":1.34,"Georgia":1.04,"Hawaii":-0.96,"Idaho":2.51,"Illinois":-0.7,"Indiana":-0.37,"Iowa":0,"Kansas":-0.5,"Kentucky":-0.37,"Louisiana":-0.38,"Maine":0.33,"Maryland":-0.14,"Massachusetts":0.05,"Michigan":-0.53,"Minnesota":-0.1,"Mississippi":-0.55,"Missouri":-0.01,"Montana":1.44,"Nebraska":-0.04,"Nevada":1.93,"New Hampshire":-0.24,"New Jersey":-0.31,"New Mexico":-0.26,"New York":-1.49,"North Carolina":0.89,"North Dakota":0.06,"Ohio":-0.84,"Oklahoma":-0.39,"Oregon":0.31,"Pennsylvania":-0.09,"Rhode Island":0.01,"South Carolina":0.74,"South Dakota":0.77,"Tennessee":0.54,"Texas":1.08,"Utah":2.12,"Vermont":-0.95,"Virginia":-0.04,"Washington":0.05,"West Virginia":-1.56,"Wisconsin":-0.2,"Wyoming":0.98},
  "2021":{"Alabama":1.4,"Alaska":1.57,"Arizona":2.74,"Arkansas":1.13,"California":-0.35,"Colorado":2.19,"Connecticut":-0.81,"Delaware":2.24,"Florida":4.05,"Georgia":3.45,"Hawaii":-3.57,"Idaho":4.09,"Illinois":-0.04,"Indiana":0.86,"Iowa":0.19,"Kansas":0.94,"Kentucky":0.4,"Louisiana":0.53,"Maine":0.98,"Maryland":-0.09,"Massachusetts":-1.86,"Michigan":0.17,"Minnesota":0.8,"Mississippi":0.66,"Missouri":0.79,"Montana":2.6,"Nebraska":1.3,"Nevada":3.14,"New Hampshire":-0.22,"New Jersey":-1.71,"New Mexico":-1,"New York":-2.79,"North Carolina":1.99,"North Dakota":0.56,"Ohio":0.48,"Oklahoma":0.88,"Oregon":0.18,"Pennsylvania":-0.93,"Rhode Island":-1.19,"South Carolina":2.46,"South Dakota":1.68,"Tennessee":1.86,"Texas":2.25,"Utah":5.03,"Vermont":-1.53,"Virginia":0.32,"Washington":0.95,"West Virginia":-0.86,"Wisconsin":0.12,"Wyoming":2.52},
  "2022":{"Alabama":1.4,"Alaska":1.08,"Arizona":2.8,"Arkansas":0.92,"California":3.89,"Colorado":1.47,"Connecticut":1.29,"Delaware":2.51,"Florida":2.71,"Georgia":1.83,"Hawaii":2.71,"Idaho":3.84,"Illinois":1.2,"Indiana":1.36,"Iowa":0.05,"Kansas":0.65,"Kentucky":1.33,"Louisiana":0.62,"Maine":1.88,"Maryland":1.39,"Massachusetts":2.47,"Michigan":1.74,"Minnesota":0.86,"Mississippi":0.7,"Missouri":0.77,"Montana":2.31,"Nebraska":0.77,"Nevada":4.15,"New Hampshire":1.68,"New Jersey":2.44,"New Mexico":1.69,"New York":2.57,"North Carolina":2.57,"North Dakota":0.6,"Ohio":0.85,"Oklahoma":0.5,"Oregon":2.18,"Pennsylvania":1.86,"Rhode Island":3.22,"South Carolina":2.6,"South Dakota":2.22,"Tennessee":1.57,"Texas":2.72,"Utah":3.35,"Vermont":2.02,"Virginia":1.21,"Washington":1.81,"West Virginia":0.57,"Wisconsin":0.78,"Wyoming":2.24},
  "2023":{"Alabama":1.07,"Alaska":1.56,"Arizona":2.16,"Arkansas":1.57,"California":1.14,"Colorado":0.62,"Connecticut":0.31,"Delaware":2.86,"Florida":2.2,"Georgia":1.56,"Hawaii":0.41,"Idaho":1.63,"Illinois":0.39,"Indiana":1.7,"Iowa":0.16,"Kansas":0.85,"Kentucky":1.17,"Louisiana":0.88,"Maine":0.79,"Maryland":0.63,"Massachusetts":1.16,"Michigan":1.32,"Minnesota":0.29,"Mississippi":0.53,"Missouri":0.46,"Montana":1.71,"Nebraska":0.74,"Nevada":1.78,"New Hampshire":0.27,"New Jersey":0.93,"New Mexico":1.03,"New York":0.84,"North Carolina":1.64,"North Dakota":1.26,"Ohio":0.56,"Oklahoma":1.13,"Oregon":0.44,"Pennsylvania":0.1,"Rhode Island":0.51,"South Carolina":2.11,"South Dakota":1.18,"Tennessee":1.89,"Texas":2.46,"Utah":2.3,"Vermont":0.37,"Virginia":1.07,"Washington":0.52,"West Virginia":0.86,"Wisconsin":0.75,"Wyoming":2.42}
};

let stateJs = fs.readFileSync('js/state-data.js', 'utf8');

// Find the start of net_estab_growth_pct section
const marker = '  "net_estab_growth_pct":';
const startIdx = stateJs.indexOf(marker);
if (startIdx === -1) {
  console.error('Could not find net_estab_growth_pct in state-data.js');
  process.exit(1);
}

// Everything before this section (minus the trailing comma+newline on previous entry)
const before = stateJs.substring(0, startIdx);

// Build new section
function formatEntry(data) {
  let s = '  "net_employer_formation": {\n';
  s += '    "source": "Census Business Dynamics Statistics",\n';
  s += '    "calculation": "Establishment entry rate minus exit rate (net formation of employer businesses)",\n';
  s += '    "rawVariables": "ESTABS_ENTRY_RATE - ESTABS_EXIT_RATE from BDS timeseries",\n';
  s += '    "data": {\n';
  const years = Object.keys(data).sort();
  for (let yi = 0; yi < years.length; yi++) {
    const year = years[yi];
    const states = data[year];
    s += '      "' + year + '": {\n';
    const stateNames = Object.keys(states).sort();
    for (let si = 0; si < stateNames.length; si++) {
      const st = stateNames[si];
      s += '        "' + st + '": ' + states[st];
      if (si < stateNames.length - 1) s += ',';
      s += '\n';
    }
    s += '      }';
    if (yi < years.length - 1) s += ',';
    s += '\n';
  }
  s += '    }\n  }\n};\n';
  return s;
}

const newSection = formatEntry(netFormationData);
stateJs = before + newSection;

fs.writeFileSync('js/state-data.js', stateJs);
console.log('Done. Lines:', stateJs.split('\n').length);
