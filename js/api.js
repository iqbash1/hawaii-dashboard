// ============================================================
// Hawaiʻi State Government Dashboard — Live API Integration
// Fetches latest data from federal sources
// Falls back silently to embedded data on failure
// ============================================================

const LiveAPI = {
    // ---- API KEY CONFIGURATION ----
    // Register for free keys and paste them here:
    keys: {
        FBI: '7iEgyLhNkI34cYUFEBWaAXgxYjjg6g16sK3AsoIP',      // https://api.data.gov/signup/
        EIA: 'FFsf7F17guAaB6ClmCeckdIippnW8ElrDrLEb236',      // https://www.eia.gov/opendata/register.php
        BEA: 'C51F8C25-E865-4DCC-B502-13BAFEB7D8AD',      // https://apps.bea.gov/api/signup/
    },

    // Track which metrics were updated live
    liveUpdates: [],

    /**
     * Clip live data to the embedded otherStateAvg range so Hawaii's
     * line never extends beyond the comparison line.
     */
    clipToAvgRange(metricObj, yearData) {
        if (!metricObj || !metricObj.otherStateAvg) return yearData;
        const avgYears = Object.keys(metricObj.otherStateAvg).map(Number);
        const minYear = Math.min(...avgYears);
        const clipped = {};
        for (const [y, v] of Object.entries(yearData)) {
            if (Number(y) >= minYear) clipped[y] = v;
        }
        return clipped;
    },

    /**
     * Attempt to fetch live data for all supported metrics
     */
    async fetchAll(baselineData) {
        const fetchers = [
            // No key needed
            this.fetchBLSUnemployment(baselineData),
            this.fetchCensusACS(baselineData),

            // Needs free API key
            this.fetchFBICrime(baselineData),
            this.fetchEIARenewables(baselineData),
            this.fetchEIAResidentialPrice(baselineData),
            this.fetchEIAEnergyImport(baselineData),
        ];

        await Promise.allSettled(fetchers);

        // Show live badge if any updates succeeded
        if (this.liveUpdates.length > 0) {
            const badge = document.getElementById('live-badge');
            if (badge) badge.style.display = 'inline-flex';
            console.log(`[API] Live updates for: ${[...new Set(this.liveUpdates)].join(', ')}`);
        }

        return baselineData;
    },

    // ===========================================================
    // NO API KEY REQUIRED
    // ===========================================================

    /**
     * BLS API v1 — Unemployment Rate for Hawaii
     * No API key required, CORS enabled
     */
    async fetchBLSUnemployment(data) {
        try {
            const seriesId = 'LASST150000000000003'; // Hawaii unemployment rate
            const url = `https://api.bls.gov/publicAPI/v1/timeseries/data/${seriesId}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`BLS: ${response.status}`);

            const json = await response.json();
            if (json.status !== 'REQUEST_SUCCEEDED') throw new Error('BLS request failed');

            const series = json.Results.series[0];
            if (!series || !series.data) throw new Error('No BLS series data');

            // BLS returns monthly data; get annual averages
            const yearData = {};
            series.data.forEach(d => {
                if (d.period === 'M13') { // M13 is annual average
                    yearData[d.year] = parseFloat(d.value);
                }
            });

            // If no annual averages, calculate from monthly
            if (Object.keys(yearData).length === 0) {
                const byYear = {};
                series.data.forEach(d => {
                    if (d.period.startsWith('M') && d.period !== 'M13') {
                        if (!byYear[d.year]) byYear[d.year] = [];
                        byYear[d.year].push(parseFloat(d.value));
                    }
                });
                for (const [year, vals] of Object.entries(byYear)) {
                    yearData[year] = parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
                }
            }

            // BLS returns percentages as whole numbers (e.g., 2.93 = 2.93%)
            // Convert to decimal fractions to match Excel format (0.0293)
            for (const [year, val] of Object.entries(yearData)) {
                if (val === null || val === undefined || isNaN(val)) {
                    delete yearData[year];
                } else {
                    yearData[year] = parseFloat((val / 100).toFixed(4));
                }
            }

            // Merge into baseline
            if (Object.keys(yearData).length > 0 && data.unemployment_rate) {
                Object.assign(data.unemployment_rate.hawaii, yearData);
                this.liveUpdates.push('unemployment_rate');
                console.log('[API] BLS unemployment data updated:', Object.keys(yearData).length, 'years');
            }
        } catch (err) {
            console.log('[API] BLS fetch failed (using embedded data):', err.message);
        }
    },

    /**
     * Census ACS API — Multiple metrics for Hawaii
     * No API key required, CORS enabled
     */
    async fetchCensusACS(data) {
        const years = [2023, 2022];

        for (const year of years) {
            try {
                const variables = [
                    'B15003_022E',  // Bachelor's degree
                    'B15003_023E',  // Master's degree
                    'B15003_024E',  // Professional degree
                    'B15003_025E',  // Doctorate
                    'B15003_001E',  // Total 25+ population
                ].join(',');

                const url = `https://api.census.gov/data/${year}/acs/acs1?get=NAME,${variables}&for=state:15`;
                const response = await fetch(url);
                if (!response.ok) continue;

                const json = await response.json();
                if (!json || json.length < 2) continue;

                const headers = json[0];
                const values = json[1];
                const lookup = {};
                headers.forEach((h, i) => { lookup[h] = values[i]; });

                // Bachelor's+ percentage (store as decimal to match Excel)
                const totalPop25 = parseFloat(lookup['B15003_001E']);
                const bach = parseFloat(lookup['B15003_022E']);
                const masters = parseFloat(lookup['B15003_023E']);
                const prof = parseFloat(lookup['B15003_024E']);
                const doc = parseFloat(lookup['B15003_025E']);
                if (!isNaN(totalPop25) && totalPop25 > 0 && data.ba_or_higher_pct) {
                    const baPct = (bach + masters + prof + doc) / totalPop25;
                    data.ba_or_higher_pct.hawaii[year.toString()] = parseFloat(baPct.toFixed(4));
                    this.liveUpdates.push('ba_or_higher_pct');
                }

                console.log(`[API] Census ACS ${year} data updated`);
                break;
            } catch (err) {
                console.log(`[API] Census ACS ${year} failed:`, err.message);
            }
        }

        // Also fetch broadband from detailed table B28002
        for (const year of years) {
            try {
                // B28002_001E = Total households, B28002_004E = With an Internet subscription: Broadband
                const url = `https://api.census.gov/data/${year}/acs/acs1?get=NAME,B28002_001E,B28002_004E&for=state:15`;
                const response = await fetch(url);
                if (!response.ok) continue;

                const json = await response.json();
                if (!json || json.length < 2) continue;

                const headers = json[0];
                const values = json[1];
                const lookup = {};
                headers.forEach((h, i) => { lookup[h] = values[i]; });

                const totalHH = parseFloat(lookup['B28002_001E']);
                const broadbandHH = parseFloat(lookup['B28002_004E']);
                if (!isNaN(totalHH) && !isNaN(broadbandHH) && totalHH > 0) {
                    const pct = broadbandHH / totalHH;
                    // Sanity check: broadband % should be between 0 and 1
                    if (pct > 0 && pct <= 1 && data.broadband_subscription_pct) {
                        data.broadband_subscription_pct.hawaii[year.toString()] = parseFloat(pct.toFixed(4));
                        this.liveUpdates.push('broadband_subscription_pct');
                        console.log(`[API] Census broadband ${year} data updated: ${(pct * 100).toFixed(1)}%`);
                    }
                }
                break;
            } catch (err) {
                console.log(`[API] Census broadband ${year} failed:`, err.message);
            }
        }

        // Also fetch Renter Cost Burden from B25070
        for (const year of years) {
            try {
                // B25070_001E = Total renters, 007-010 = paying 30%+ of income, 011 = not computed
                const url = `https://api.census.gov/data/${year}/acs/acs1?get=NAME,B25070_001E,B25070_007E,B25070_008E,B25070_009E,B25070_010E,B25070_011E&for=state:15`;
                const response = await fetch(url);
                if (!response.ok) continue;

                const json = await response.json();
                if (!json || json.length < 2) continue;

                const headers = json[0];
                const values = json[1];
                const lookup = {};
                headers.forEach((h, i) => { lookup[h] = values[i]; });

                const totalRenters = parseFloat(lookup['B25070_001E']);
                const notComputed = parseFloat(lookup['B25070_011E']);
                const over30 = parseFloat(lookup['B25070_007E']) + parseFloat(lookup['B25070_008E']) +
                               parseFloat(lookup['B25070_009E']) + parseFloat(lookup['B25070_010E']);
                const denom = totalRenters - notComputed;
                if (!isNaN(denom) && denom > 0) {
                    const pct = over30 / denom;
                    if (pct > 0 && pct <= 1 && data.renter_cost_burden_pct) {
                        data.renter_cost_burden_pct.hawaii[year.toString()] = parseFloat(pct.toFixed(4));
                        this.liveUpdates.push('renter_cost_burden_pct');
                        console.log(`[API] Census renter cost burden ${year} updated: ${(pct * 100).toFixed(1)}%`);
                    }
                }
                break;
            } catch (err) {
                console.log(`[API] Census renter cost burden ${year} failed:`, err.message);
            }
        }
    },

    // ===========================================================
    // REQUIRE FREE API KEYS
    // ===========================================================

    /**
     * FBI Crime Data Explorer — Violent Crime Rate for Hawaii
     * Requires free data.gov API key
     */
    async fetchFBICrime(data) {
        if (!this.keys.FBI) return;
        try {
            const url = `https://api.usa.gov/crime/fbi/sapi/api/estimates/states/HI/violent_crime?api_key=${this.keys.FBI}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`FBI: ${response.status}`);

            const json = await response.json();
            if (!json.results || json.results.length === 0) throw new Error('No FBI data');

            let yearData = {};
            json.results.forEach(r => {
                if (r.year && r.violent_crime && r.population) {
                    const rate = (r.violent_crime / r.population) * 100000;
                    yearData[r.year.toString()] = parseFloat(rate.toFixed(2));
                }
            });

            if (Object.keys(yearData).length > 0 && data.violent_crime_rate) {
                yearData = this.clipToAvgRange(data.violent_crime_rate, yearData);
                Object.assign(data.violent_crime_rate.hawaii, yearData);
                this.liveUpdates.push('violent_crime_rate');
                console.log('[API] FBI crime data updated:', Object.keys(yearData).length, 'years');
            }
        } catch (err) {
            console.log('[API] FBI fetch failed (using embedded data):', err.message);
        }
    },

    /**
     * EIA API v2 — Renewables Share of Generation for Hawaii
     * Requires free EIA API key
     */
    async fetchEIARenewables(data) {
        if (!this.keys.EIA) return;
        try {
            // Electric power operational data: AOR = All Renewables, ALL = All Fuels, sector 99 = All Sectors
            const base = `https://api.eia.gov/v2/electricity/electric-power-operational-data/data/?api_key=${this.keys.EIA}&frequency=annual&data[0]=generation&facets[location][]=HI&facets[sectorid][]=99&sort[0][column]=period&sort[0][direction]=desc&length=20`;
            const [resRenew, resTotal] = await Promise.all([
                fetch(base + '&facets[fueltypeid][]=AOR'),
                fetch(base + '&facets[fueltypeid][]=ALL')
            ]);
            if (!resRenew.ok || !resTotal.ok) throw new Error(`EIA renewables: ${resRenew.status}/${resTotal.status}`);

            const jsonRenew = await resRenew.json();
            const jsonTotal = await resTotal.json();

            if (jsonRenew.response?.data && jsonTotal.response?.data) {
                const renew = {};
                jsonRenew.response.data.forEach(d => {
                    if (d.period && d.generation !== null) renew[d.period.toString()] = parseFloat(d.generation);
                });
                const total = {};
                jsonTotal.response.data.forEach(d => {
                    if (d.period && d.generation !== null) total[d.period.toString()] = parseFloat(d.generation);
                });

                let yearData = {};
                for (const year of Object.keys(total)) {
                    if (renew[year] !== undefined && total[year] > 0) {
                        const share = renew[year] / total[year];
                        if (share >= 0 && share <= 1) {
                            yearData[year] = parseFloat(share.toFixed(4));
                        }
                    }
                }

                if (Object.keys(yearData).length > 0 && data.renewables_share_gen) {
                    yearData = this.clipToAvgRange(data.renewables_share_gen, yearData);
                    Object.assign(data.renewables_share_gen.hawaii, yearData);
                    this.liveUpdates.push('renewables_share_gen');
                    console.log('[API] EIA renewables updated:', Object.keys(yearData).length, 'years');
                }
            }
        } catch (err) {
            console.log('[API] EIA renewables fetch failed (using embedded data):', err.message);
        }
    },

    /**
     * EIA API v2 — Residential Electricity Price for Hawaii
     */
    async fetchEIAResidentialPrice(data) {
        if (!this.keys.EIA) return;
        try {
            const url = `https://api.eia.gov/v2/electricity/retail-sales/data/?api_key=${this.keys.EIA}&frequency=annual&data[0]=price&facets[stateid][]=HI&facets[sectorid][]=RES&sort[0][column]=period&sort[0][direction]=desc&length=20`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`EIA price: ${response.status}`);

            const json = await response.json();
            if (json.response && json.response.data) {
                let yearData = {};
                json.response.data.forEach(d => {
                    if (d.period && d.price !== null) {
                        yearData[d.period.toString()] = parseFloat(d.price);
                    }
                });
                if (Object.keys(yearData).length > 0 && data.residential_price_cpkwh) {
                    yearData = this.clipToAvgRange(data.residential_price_cpkwh, yearData);
                    Object.assign(data.residential_price_cpkwh.hawaii, yearData);
                    this.liveUpdates.push('residential_price_cpkwh');
                    console.log('[API] EIA residential price updated:', Object.keys(yearData).length, 'years');
                }
            }
        } catch (err) {
            console.log('[API] EIA price fetch failed (using embedded data):', err.message);
        }
    },

    /**
     * EIA API v2 — State Energy Data System (SEDS) for Energy Import %
     */
    async fetchEIAEnergyImport(data) {
        if (!this.keys.EIA) return;
        try {
            // Fetch total production and consumption for Hawaii
            const urlProd = `https://api.eia.gov/v2/seds/data/?api_key=${this.keys.EIA}&frequency=annual&data[0]=value&facets[stateId][]=HI&facets[seriesId][]=TETPB&sort[0][column]=period&sort[0][direction]=desc&length=15`;
            const urlCons = `https://api.eia.gov/v2/seds/data/?api_key=${this.keys.EIA}&frequency=annual&data[0]=value&facets[stateId][]=HI&facets[seriesId][]=TETCB&sort[0][column]=period&sort[0][direction]=desc&length=15`;

            const [resProd, resCons] = await Promise.all([fetch(urlProd), fetch(urlCons)]);
            if (!resProd.ok || !resCons.ok) throw new Error('EIA SEDS fetch error');

            const jsonProd = await resProd.json();
            const jsonCons = await resCons.json();

            if (jsonProd.response?.data && jsonCons.response?.data) {
                const prod = {};
                jsonProd.response.data.forEach(d => {
                    if (d.period && d.value !== null) prod[d.period.toString()] = parseFloat(d.value);
                });
                const cons = {};
                jsonCons.response.data.forEach(d => {
                    if (d.period && d.value !== null) cons[d.period.toString()] = parseFloat(d.value);
                });

                let yearData = {};
                for (const year of Object.keys(cons)) {
                    if (prod[year] !== undefined && cons[year] > 0) {
                        const netImport = (cons[year] - prod[year]) / cons[year];
                        yearData[year] = parseFloat(netImport.toFixed(4));
                    }
                }

                if (Object.keys(yearData).length > 0 && data.net_energy_import_pct) {
                    yearData = this.clipToAvgRange(data.net_energy_import_pct, yearData);
                    Object.assign(data.net_energy_import_pct.hawaii, yearData);
                    this.liveUpdates.push('net_energy_import_pct');
                    console.log('[API] EIA energy import updated:', Object.keys(yearData).length, 'years');
                }
            }
        } catch (err) {
            console.log('[API] EIA energy import fetch failed (using embedded data):', err.message);
        }
    },

    /**
     * BEA API — Tourism GDP Share for Hawaii
};
