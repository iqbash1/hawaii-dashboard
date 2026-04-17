// ============================================================
// Hawaii Dashboard - Export Module
//
// Generates multi-tab XLSX downloads for metric data.
// Depends on: App (for getEffectiveData, computeRankHistory),
//             ChartUtils, DASHBOARD_DATA, STATE_DATA, COUNTY_DATA,
//             XLSX (lazy-loaded from CDN on first use).
// ============================================================

const Export = {
    /**
     * Generate and download a multi-tab xlsx for the given metric.
     * Sheet order: Raw Data, Chart Data, Rankings, All Data, County Data (if avail), Methodology.
     * @param {string} slug - Metric ID
     */
    downloadData(slug) {
        const m = DASHBOARD_DATA[slug];
        if (!m) return;

        // Lazy-load SheetJS on first download (~200KB saved on initial page load)
        if (typeof XLSX === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
            script.integrity = 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw';
            script.crossOrigin = 'anonymous';
            script.onload = () => Export.downloadData(slug);
            script.onerror = () => alert('Could not load the export library. Please try again.'); // eslint-disable-line no-alert
            document.head.appendChild(script);
            return;
        }

        const wb = XLSX.utils.book_new();
        const sd = typeof STATE_DATA !== 'undefined' && STATE_DATA[slug];

        // Detect FIPS-keyed structure (e.g. pcp_per_100k)
        let isFIPS = false;
        if (sd && sd.data) {
            const firstKey = Object.keys(sd.data)[0];
            isFIPS = sd.data[firstKey] && typeof sd.data[firstKey].name === 'string';
        }

        // --- Tab 1: "Raw Data" (per-state source data, single source of truth) ---
        if (sd && sd.data) {
            let stateRows;

            if (isFIPS) {
                const allYears = new Set();
                const stateMap = {};
                Object.values(sd.data).forEach(entry => {
                    stateMap[entry.name] = entry;
                    Object.keys(entry).forEach(k => { if (k !== 'name') allYears.add(k); });
                });
                const years = [...allYears].sort();
                const stateNames = Object.keys(stateMap).sort();

                stateRows = [
                    [`${m.metric} (${m.unit}) - Raw Per-State Data`],
                    [`Source: ${sd.source}`],
                    sd.calculation ? [`Calculation: ${sd.calculation}`] : [],
                    [],
                    ['Year', ...stateNames],
                ];

                years.forEach(y => {
                    const row = [y];
                    stateNames.forEach(s => {
                        row.push(stateMap[s]?.[y] ?? '');
                    });
                    stateRows.push(row);
                });
            } else {
                const allYears = Object.keys(sd.data).sort();
                const allStates = [...new Set(
                    Object.values(sd.data).flatMap(d => Object.keys(d))
                )].sort();

                stateRows = [
                    [`${m.metric} (${m.unit}) - Raw Per-State Data`],
                    [`Source: ${sd.source}`],
                    sd.calculation ? [`Calculation: ${sd.calculation}`] : [],
                    sd.rawVariables ? [`Raw variables: ${sd.rawVariables}`] : [],
                    [],
                    ['Year', ...allStates],
                ];

                allYears.forEach(y => {
                    const row = [y];
                    allStates.forEach(s => {
                        row.push(sd.data[y]?.[s] ?? '');
                    });
                    stateRows.push(row);
                });
            }

            const wsStates = XLSX.utils.aoa_to_sheet(stateRows.filter(r => r.length > 0));
            XLSX.utils.book_append_sheet(wb, wsStates, 'Raw Data');
        }

        // --- Tab 2: "Chart Data" (Hawai'i + Other-state average) ---
        const effective = App.getEffectiveData(slug);
        const isDecimalPct = ChartUtils.isDecimalPctMetric(m);
        const sdYears = sd ? Object.keys(sd.data || {}).sort() : [];
        const effectiveYears = Object.keys(effective.hawaii).sort();
        const sdLastYear = sdYears[sdYears.length - 1];
        const effectiveLastYear = effectiveYears[effectiveYears.length - 1];
        const chartIsTrimmed = sd && sdLastYear && effectiveLastYear && effectiveLastYear < sdLastYear;
        const chartNotes = [];
        if (sd) chartNotes.push(['Note: Hawai\u02BBi and Other-state average are computed from the Raw Data tab']);
        if (isDecimalPct) chartNotes.push(['Unit note: Values are decimal fractions (e.g. 0.2162 = 21.62%). Multiply by 100 to convert to percent.']);
        if (chartIsTrimmed) chartNotes.push([`Year range note: Chart ends at ${effectiveLastYear}. Raw Data extends to ${sdLastYear}. Chart is trimmed to the latest year with complete state data for consistent rankings.`]);
        const chartRows = [
            [`${m.metric} (${m.unit}) - Dashboard Chart Data`],
            [`Source: ${m.source}`],
            ...chartNotes,
            [],
            ['Year', 'Hawai\u02BBi', 'Other-state average'],
        ];
        const chartYears = [...new Set([
            ...Object.keys(effective.hawaii),
            ...Object.keys(effective.otherStateAvg),
        ])].sort();
        chartYears.forEach(y => {
            chartRows.push([
                y,
                effective.hawaii[y] != null ? effective.hawaii[y] : '',
                effective.otherStateAvg[y] != null ? effective.otherStateAvg[y] : '',
            ]);
        });
        const wsChart = XLSX.utils.aoa_to_sheet(chartRows.filter(r => r.length > 0));
        XLSX.utils.book_append_sheet(wb, wsChart, 'Chart Data');

        // --- Tab 3: "Rankings" + Tab 4: "All Data" ---
        if (sd) {
            const rankHistory = App.computeRankHistory(slug);
            if (rankHistory && rankHistory.years.length > 0) {
                const { years: rankYears, stateRanks, stateValues, latestYearRanked, hiKey } = rankHistory;

                const latestRankMap = {};
                latestYearRanked.forEach(e => { latestRankMap[e.state] = e.rank; });
                const allStates = Object.keys(stateRanks).sort((a, b) => {
                    const ra = latestRankMap[a] || 999;
                    const rb = latestRankMap[b] || 999;
                    return ra - rb;
                });

                // Wide grid: State rows, Year columns, rank values
                const rankRows = [
                    [`${m.metric} - National Rankings by Year`],
                    [`${m.goodDirection === 'up' ? 'Higher is better (rank 1 = highest value)' : 'Lower is better (rank 1 = lowest value)'}`],
                    [`Ranks are among states with available data that year. Hawai\u02BBi rows are marked with *.`],
                    [],
                    ['State', ...rankYears],
                ];
                allStates.forEach(state => {
                    const isHI = (state === hiKey);
                    const row = [isHI ? `${state} *` : state];
                    rankYears.forEach(yr => {
                        row.push(stateRanks[state][yr] != null ? stateRanks[state][yr] : '');
                    });
                    rankRows.push(row);
                });
                const wsRank = XLSX.utils.aoa_to_sheet(rankRows);
                XLSX.utils.book_append_sheet(wb, wsRank, 'Rankings');

                // Long format
                const longRows = [
                    [`${m.metric} - All States, All Years: Values and Rankings`],
                    [`${m.goodDirection === 'up' ? 'Higher is better - rank 1 = highest value' : 'Lower is better - rank 1 = lowest value'}. Hawai\u02BBi rows marked *.`],
                    [],
                    ['Year', 'State', `Value (${m.unit})`, 'Rank', 'Out of N States'],
                ];
                rankYears.forEach(yr => {
                    const yearEntries = allStates
                        .filter(state => stateRanks[state]?.[yr] != null)
                        .map(state => ({
                            state,
                            rank: stateRanks[state][yr],
                            value: stateValues[state]?.[yr],
                        }))
                        .sort((a, b) => a.rank - b.rank);
                    const n = yearEntries.length;
                    yearEntries.forEach(({ state, rank, value }) => {
                        const isHI = state === hiKey;
                        longRows.push([
                            yr,
                            isHI ? `${state} *` : state,
                            value != null ? value : '',
                            rank,
                            n,
                        ]);
                    });
                });
                const wsLong = XLSX.utils.aoa_to_sheet(longRows);
                XLSX.utils.book_append_sheet(wb, wsLong, 'All Data');
            }
        }

        // --- Tab 5: "County Data" ---
        const countyData = typeof COUNTY_DATA !== 'undefined' && COUNTY_DATA[slug];
        if (countyData) {
            const counties = countyData.counties || Object.keys(countyData.data);
            const allCountyYears = [...new Set(
                counties.flatMap(c => Object.keys(countyData.data[c] || {}))
            )].sort();

            const countyRows = [
                [`${m.metric} (${m.unit}) - County Data`],
                [],
                ['Year', ...counties],
            ];

            allCountyYears.forEach(y => {
                const row = [y];
                counties.forEach(c => {
                    row.push(countyData.data[c]?.[y] ?? '');
                });
                countyRows.push(row);
            });

            const wsCounty = XLSX.utils.aoa_to_sheet(countyRows);
            XLSX.utils.book_append_sheet(wb, wsCounty, 'County Data');
        }

        // --- Tab 6: "Methodology" ---
        const methRows = [
            ['METRIC DEFINITION'],
            ['Metric', m.metric],
            m.officialName ? ['Metric definition', m.officialName] : [],
            ['Unit', m.unit],
            ['Area', m.area],
            ['Direction', m.goodDirection === 'up' ? 'Higher is better' : 'Lower is better'],
            [],
            ['DATA SOURCE'],
            ['Source', m.source],
            ['Source URL', m.sourceUrl],
        ];
        if (sd) {
            methRows.push(
                ['Calculation', sd.calculation || ''],
                ['Raw Variables', sd.rawVariables || ''],
                ['Source Table', sd.source || ''],
            );
        }
        methRows.push(
            [],
            ['COMPARATOR'],
            ['Other-state average', 'Simple mean of 49 states, excluding Hawai\u02BBi. DC excluded from rankings.'],
            ['Hawai\u02BBi Value', 'Pulled from same source, same variable, same year.'],
        );
        if (slug === 'real_per_capita_income') {
            methRows.push(
                [],
                ['COST-OF-LIVING ADJUSTMENT'],
                ['Method', 'BEA Regional Price Parities (RPPs)'],
                ['What RPPs do', 'Adjust nominal income by state-level price differences for goods, services, and housing.'],
                ['Reference', 'https://www.bea.gov/data/prices-inflation/regional-price-parities-state-and-metro-area'],
            );
        }
        methRows.push(
            [],
            ['DATA TRANSFORMATIONS'],
        );
        if (isDecimalPct) {
            methRows.push(
                ['Step 1 - Raw storage', `Values in the Raw Data tab are stored as decimal fractions (0 to 1). Example: 0.2162 = 21.62%.`],
                ['Step 2 - Chart Data tab', 'Hawai\u02BBi and Other-state average are the same decimal fractions as Raw Data. Multiply by 100 to display as percentages.'],
                ['Step 3 - Rankings / All Data tabs', 'Values are multiplied by 100 and shown as percentages (e.g. 21.62%).'],
                ['Step 4 - Other-state average', 'Computed as the simple mean of all non-Hawai\u02BBi state values for that year (decimal form), then displayed as a percentage.'],
            );
        } else {
            methRows.push(
                ['Step 1 - Raw storage', `Values are stored in display units (${m.unit}). No unit scaling is applied.`],
                ['Step 2 - Other-state average', 'Computed as the simple mean of all non-Hawai\u02BBi state values for that year.'],
            );
        }
        if (chartIsTrimmed) {
            methRows.push(
                ['Step - Year trimming', `Chart Data ends at ${effectiveLastYear} (the latest year with complete state data). Raw Data extends to ${sdLastYear}. This keeps Hawai\u02BBi, the other-state average, and rankings consistent with the same endpoint.`],
            );
        }
        methRows.push(
            [],
            ['NARRATIVE'],
            ['Why It Matters', m.whyItMatters.replace(/<[^>]*>/g, '')],
            ['How To Read It', m.howToRead],
        );
        if (m.potentialDrivers) methRows.push(['Potential Drivers', m.potentialDrivers.replace(/<[^>]*>/g, '')]);
        if (m.policyLevers) methRows.push(['Main Policy Levers', m.policyLevers]);
        if (m.dataNote) methRows.push([], ['Data Note', m.dataNote]);
        const reproText = isDecimalPct
            ? `Pull raw variables from the source URL for all 50 states. Apply the calculation formula. Results are decimal fractions (0\u20131). Divide by 100 if needed to match Raw Data tab. Compute Other-state average as the simple mean excluding Hawai\u02BBi. Multiply by 100 to display as percentages.`
            : `Pull raw variables from the source URL for all 50 states. Apply the calculation formula. Compute Other-state average as the simple mean excluding Hawai\u02BBi.`;
        methRows.push(
            [],
            ['REPRODUCIBILITY'],
            ['To reproduce', reproText],
            ['Dashboard', 'hawaiidashboard.org'],
            ['Last reviewed', document.getElementById('last-updated')?.textContent || ''],
        );
        const wsMeth = XLSX.utils.aoa_to_sheet(methRows.filter(r => r.length > 0));
        XLSX.utils.book_append_sheet(wb, wsMeth, 'Methodology');

        const safeName = m.metric.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
        XLSX.writeFile(wb, `Hawaii_${safeName}.xlsx`);

        // Download feedback
        const dlLink = document.getElementById('csv-download');
        if (dlLink) {
            const orig = dlLink.textContent;
            dlLink.textContent = 'Downloaded!';
            setTimeout(() => { dlLink.textContent = orig; }, 2000);
        }
    },
};
