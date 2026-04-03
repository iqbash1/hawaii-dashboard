// ============================================================
// Hawaiʻi Dashboard - Chart Rendering (Chart.js v4)
//
// createSparkline()          - mini card charts with gap-scaled fill
// createDetailChart()        - full modal chart with governor overlays
// createCountyChart()        - multi-line county comparison chart
// createRankingsChart()      - horizontal bar chart for all 50 states
// createRankHistoryChart()   - rank-over-time line chart with quartile
//                              zones, reference lines, and click-to-compare
// formatValue()              - unit-aware number formatting
// formatCardValue()          - compact formatting for card display
// ============================================================

// Set global Chart.js font to Inter
Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const ChartUtils = {
    // Color constants
    HAWAII_BLUE: '#0D7C8F',
    HAWAII_BLUE_BG: 'rgba(13, 124, 143, 0.08)',
    AVG_GRAY: '#999999',
    AVG_GRAY_BG: 'rgba(153, 153, 153, 0.06)',
    GREEN_BEST: [5, 150, 105],
    RED_WORST: [192, 57, 43],
    NEUTRAL_RANGE: [24, 26],
    PARTY_DEM: '#2563EB',
    PARTY_REP: '#C0392B',
    // Standardized dash patterns
    DASH_AVG: [6, 4],
    DASH_STATE_REF: [8, 4],
    // Rank history comparison line visual parameters
    COMP_LINE_COLOR: 'rgba(130, 135, 142, 0.55)',  // solid line for pinned comparison state
    COMP_LINE_WIDTH: 1.8,
    COMP_DOT_RADIUS: 2.5,
    HOVER_LINE_COLOR: 'rgba(160, 165, 173, 0.40)', // dashed ghost line for hovered state
    HOVER_LINE_WIDTH: 2,
    HOVER_DOT_RADIUS: 0,
    COMP_LABEL_COLOR: '#555',

    /** Linear interpolation, rounded to integer */
    lerp(a, b, t) { return Math.round(a + (b - a) * t); },

    /** Check if a state name is Hawaii (handles ʻokina variant) */
    isHawaii(name) { return name === 'Hawaii' || name === 'Hawai\u02BBi'; },

    /**
     * Determine if a % metric stores values as decimals (0.028 = 2.8%)
     * vs whole numbers (86 = 86%). Uses dataset-level check: if ALL
     * non-null values are ≤ 1, it's decimal-stored.
     */
    isDecimalPctMetric(metricData) {
        if (metricData.unit !== '%') return false;
        const allVals = [...Object.values(metricData.hawaii), ...Object.values(metricData.otherStateAvg)]
            .filter(v => v !== null && v !== 0);
        return allVals.length > 0 && allVals.every(v => Math.abs(v) <= 1);
    },

    /**
     * Create a mini sparkline chart for a card
     */
    createSparkline(canvas, data, goodDirection) {
        const ctx = canvas.getContext('2d');
        // Replace 0 with null (0 = missing data, not a real value)
        const values = Object.values(data.hawaii).map(v => v === 0 ? null : v);
        const avgValues = Object.values(data.otherStateAvg).map(v => v === 0 ? null : v);
        const labels = Object.keys(data.hawaii);

        if (values.filter(v => v !== null).length === 0) return null;

        // Build an accessible label describing the trend (3-year avg direction)
        const nonNullHI = values.filter(v => v !== null);
        const nonNullAvg = avgValues.filter(v => v !== null);
        if (nonNullHI.length > 0 && nonNullAvg.length > 0) {
            const latestHIVal = nonNullHI[nonNullHI.length - 1];
            const latestAvgVal = nonNullAvg[nonNullAvg.length - 1];
            const aboveBelow = latestHIVal >= latestAvgVal ? 'above' : 'below';
            let trend = 'stable';
            if (nonNullHI.length >= 4) {
                const recent3 = nonNullHI.slice(-3);
                const prior3 = nonNullHI.slice(-6, -3);
                if (prior3.length >= 2) {
                    const avgR = recent3.reduce((a, b) => a + b, 0) / recent3.length;
                    const avgP = prior3.reduce((a, b) => a + b, 0) / prior3.length;
                    const moved = avgR > avgP ? 'up' : avgR < avgP ? 'down' : 'flat';
                    if (moved === 'flat') trend = 'stable';
                    else if (goodDirection === 'up') trend = moved === 'up' ? 'improving' : 'worsening';
                    else trend = moved === 'down' ? 'improving' : 'worsening';
                }
            }
            const ariaText = `Trend chart: Hawaii is ${aboveBelow} the other-state average and ${trend}`;
            canvas.setAttribute('role', 'img');
            canvas.setAttribute('aria-label', ariaText);
        }

        // Tighten y-axis around actual data range to maximize visual gap between lines
        const allValues = [...values, ...avgValues].filter(v => v !== null);
        const dataMin = Math.min(...allValues);
        const dataMax = Math.max(...allValues);

        // Scale fill opacity by gap magnitude: bigger gap = bolder fill
        const latestHI = values.filter(v => v !== null).pop() || 0;
        const latestAvg = avgValues.filter(v => v !== null).pop() || 0;
        const avgMid = (Math.abs(latestHI) + Math.abs(latestAvg)) / 2 || 1;
        const gapPct = Math.abs(latestHI - latestAvg) / avgMid;
        // Map: 0% gap -> 0.22, 5% -> 0.25, 25% -> 0.37, 50%+ -> 0.50
        const fillAlpha = Math.min(0.50, 0.22 + gapPct * 0.60);

        const goodColor = `rgba(5, 150, 105, ${fillAlpha.toFixed(2)})`;
        const badColor = `rgba(192, 57, 43, ${fillAlpha.toFixed(2)})`;

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        data: values,
                        spanGaps: true,
                        borderColor: this.HAWAII_BLUE,
                        borderWidth: 2,
                        // Fill between Hawaii and Avg lines: green = better, red = worse
                        // Opacity scales with gap size
                        fill: avgValues.length > 0 ? {
                            target: 1,
                            above: goodDirection === 'up' ? goodColor : badColor,
                            below: goodDirection === 'up' ? badColor : goodColor,
                        } : true,
                        backgroundColor: this.HAWAII_BLUE_BG,
                        tension: 0.3,
                        pointRadius: 0,
                        pointHoverRadius: 0,
                    },
                    {
                        data: avgValues.length > 0 ? avgValues : undefined,
                        borderColor: this.AVG_GRAY,
                        borderWidth: 1.5,
                        borderDash: [3, 3],
                        fill: false,
                        tension: 0.3,
                        pointRadius: 0,
                        pointHoverRadius: 0,
                        spanGaps: true,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false },
                },
                scales: {
                    x: {
                        display: true,
                        border: { display: false },
                        grid: { display: false },
                        ticks: {
                            font: { size: 9 },
                            color: '#999',
                            maxRotation: 0,
                            autoSkip: false,
                            callback: function(value, index, ticks) {
                                const total = ticks.length;
                                const label = this.getLabelForValue(value);
                                // Always show first 4 chars as 'XX (handles "2012", "2012-2013")
                                const short = "'" + label.slice(2, 4);
                                // Show first, last, and one middle tick
                                if (index === 0 || index === total - 1) return short;
                                const mid = Math.round(total / 2);
                                if (total > 5 && index === mid) return short;
                                return '';
                            },
                            padding: 2,
                        },
                    },
                    y: {
                        display: false,
                        min: (() => {
                            const range = dataMax - dataMin;
                            const gap = Math.abs(latestHI - latestAvg);
                            const minRange = gap * 2;
                            const effectiveRange = Math.max(range, minRange);
                            const mid = (dataMin + dataMax) / 2;
                            return mid - effectiveRange * 0.55;
                        })(),
                        max: (() => {
                            const range = dataMax - dataMin;
                            const gap = Math.abs(latestHI - latestAvg);
                            const minRange = gap * 2;
                            const effectiveRange = Math.max(range, minRange);
                            const mid = (dataMin + dataMax) / 2;
                            return mid + effectiveRange * 0.55;
                        })(),
                    },
                },
                animation: {
                    duration: 800,
                    easing: 'easeOutQuart',
                },
                interaction: {
                    intersect: false,
                    mode: 'index',
                },
            }
        });
    },

    /**
     * Create a full detail chart for the modal
     * @param {HTMLCanvasElement} canvas
     * @param {Object} data - metric data with hawaii and otherStateAvg
     * @param {Array} govBoxes - governor term annotations [{name, party, startIdx, endIdx}]
     */
    createDetailChart(canvas, data, govBoxes) {
        const ctx = canvas.getContext('2d');
        const labels = Object.keys(data.hawaii);
        // Replace 0 with null (0 = missing data, not a real value)
        const hawaiiValues = Object.values(data.hawaii).map(v => v === 0 ? null : v);
        const avgValues = Object.values(data.otherStateAvg).map(v => v === 0 ? null : v);

        // Destroy existing chart if any
        const existingChart = Chart.getChart(canvas);
        if (existingChart) existingChart.destroy();

        const nonNullHawaii = hawaiiValues.filter(v => v !== null);

        // Governor overlay (reusable plugin)
        const hiDataAvg = nonNullHawaii.length > 0
            ? nonNullHawaii.reduce((a, b) => a + b, 0) / nonNullHawaii.length : 0;
        const governorPlugin = ChartUtils._buildGovernorPlugin(govBoxes, hiDataAvg);

        // Gap-scaled fill: 0% gap -> 0.25, 5% -> 0.28, 25% -> 0.41, 50%+ -> 0.55
        const goodDir = data.goodDirection;
        const latestHI = hawaiiValues.filter(v => v !== null).pop() || 0;
        const latestAvgVal = avgValues.filter(v => v !== null).pop() || 0;
        const mid = (Math.abs(latestHI) + Math.abs(latestAvgVal)) / 2 || 1;
        const gap = Math.abs(latestHI - latestAvgVal) / mid;
        const alpha = Math.min(0.55, 0.25 + gap * 0.65);
        const detailGood = `rgba(5, 150, 105, ${alpha.toFixed(2)})`;
        const detailBad = `rgba(192, 57, 43, ${alpha.toFixed(2)})`;

        // Detect if % values are stored as decimals (0.028 = 2.8%) vs whole (86 = 86%)
        const isDecimalPct = this.isDecimalPctMetric(data);

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: "Hawaiʻi",
                        data: hawaiiValues,
                        borderColor: this.HAWAII_BLUE,
                        borderWidth: 3,
                        fill: avgValues.length > 0 ? {
                            target: 1,
                            above: goodDir === 'up' ? detailGood : detailBad,
                            below: goodDir === 'up' ? detailBad : detailGood,
                        } : true,
                        tension: 0.3,
                        pointRadius: (() => {
                            const n = nonNullHawaii.length;
                            if (n <= 15) return hawaiiValues.map(v => v === null ? 0 : 3);
                            const step = Math.ceil(n / 12);
                            const firstIdx = hawaiiValues.findIndex(x => x !== null);
                            const lastIdx = hawaiiValues.length - 1 - [...hawaiiValues].reverse().findIndex(x => x !== null);
                            return hawaiiValues.map((v, i) =>
                                v === null ? 0 : (i % step === 0 || i === firstIdx || i === lastIdx) ? 2.5 : 0
                            );
                        })(),
                        pointHoverRadius: 5,
                        pointBackgroundColor: this.HAWAII_BLUE,
                        pointBorderColor: '#fff',
                        pointBorderWidth: 1.5,
                        spanGaps: true,
                    },
                    {
                        label: 'Other-states average',
                        data: avgValues,
                        borderColor: this.AVG_GRAY,
                        backgroundColor: this.AVG_GRAY_BG,
                        borderWidth: 1.5,
                        borderDash: this.DASH_AVG,
                        fill: false,
                        tension: 0.3,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        pointBackgroundColor: this.AVG_GRAY,
                        pointBorderColor: '#fff',
                        pointBorderWidth: 1,
                        spanGaps: true,
                    }
                ]
            },
            plugins: [governorPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: 0 },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'center',
                        labels: {
                            usePointStyle: true,
                            pointStyle: 'circle',
                            padding: 16,
                            font: { size: 12, weight: '500' },
                            color: '#555555',
                            boxWidth: 8,
                            boxHeight: 8,
                        }
                    },
                    tooltip: {
                        backgroundColor: '#333333',
                        titleColor: '#fff',
                        bodyColor: '#E5E7EB',
                        padding: 12,
                        cornerRadius: 8,
                        titleFont: { size: 13, weight: '600' },
                        bodyFont: { size: 12 },
                        displayColors: true,
                        callbacks: {
                            label: function(context) {
                                const val = context.parsed.y;
                                const formatted = ChartUtils.formatValue(val, data.unit, isDecimalPct);
                                // YoY % change
                                const idx = context.dataIndex;
                                const series = context.dataset.data;
                                if (idx > 0 && val !== null && series[idx - 1] !== null) {
                                    const prev = series[idx - 1];
                                    if (prev !== 0) {
                                        const pct = ((val - prev) / Math.abs(prev)) * 100;
                                        const arrow = pct > 0 ? '\u2191' : pct < 0 ? '\u2193' : '';
                                        return `${context.dataset.label}: ${formatted}  ${arrow} ${Math.abs(pct).toFixed(1)}%`;
                                    }
                                }
                                return `${context.dataset.label}: ${formatted}`;
                            }
                        }
                    },
                },
                scales: {
                    x: {
                        grid: {
                            display: false,
                        },
                        ticks: {
                            font: { size: 11 },
                            color: '#888888',
                            maxRotation: 45,
                        },
                        border: {
                            display: false,
                        }
                    },
                    y: {
                        grid: {
                            color: 'rgba(0,0,0,0.04)',
                        },
                        ticks: {
                            font: { size: 11 },
                            color: '#888888',
                            callback: function(value) {
                                if (isDecimalPct) return (value * 100).toFixed(1) + '%';
                                return ChartUtils.formatValue(value, data.unit);
                            }
                        },
                        border: {
                            display: false,
                        }
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart',
                },
                interaction: {
                    intersect: false,
                    mode: 'index',
                },
            }
        });
    },

    /** Build reusable governor overlay Chart.js plugin */
    _buildGovernorPlugin(govBoxes, dataAvg) {
        return {
            id: 'governorLabels',
            beforeDatasetsDraw(chart) {
                if (!govBoxes || govBoxes.length === 0) return;
                const { ctx, chartArea, scales } = chart;
                const xScale = scales.x;
                ctx.save();
                const step = xScale.ticks.length > 1
                    ? (xScale.getPixelForValue(1) - xScale.getPixelForValue(0)) : 0;
                const bands = govBoxes.map((gov, gi) => {
                    const x1 = xScale.getPixelForValue(gov.startIdx) - step * 0.5;
                    const x2 = xScale.getPixelForValue(gov.endIdx) + step * 0.5;
                    const left = Math.max(x1, chartArea.left);
                    const right = Math.min(x2, chartArea.right);
                    const parts = gov.name.split(' ');
                    const lastName = parts[parts.length - 1];
                    return { gov, left, right, lastName, idx: gi, centerX: (left + right) / 2 };
                });
                // Draw alternating background bands
                bands.forEach(b => {
                    if (b.idx % 2 === 0) {
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.025)';
                        ctx.fillRect(b.left, chartArea.top, b.right - b.left, chartArea.bottom - chartArea.top);
                    }
                });
                // Vertical governor labels along right edge of each band
                ctx.font = '400 10px "Inter", sans-serif';
                const chartHeight = chartArea.bottom - chartArea.top;
                bands.forEach(b => {
                    const bandWidth = b.right - b.left;
                    if (bandWidth < 10) return;
                    const partyColor = b.gov.party === 'R' ? ChartUtils.PARTY_REP : ChartUtils.PARTY_DEM;
                    ctx.fillStyle = partyColor;
                    // Pick best label: "LastName (P)" or just "LastName"
                    const fullLabel = `${b.lastName} (${b.gov.party})`;
                    const labelText = ctx.measureText(fullLabel).width < chartHeight - 20 ? fullLabel : b.lastName;
                    ctx.save();
                    ctx.translate(b.centerX, chartArea.top + 8);
                    ctx.rotate(Math.PI / 2);
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(labelText, 0, 0);
                    ctx.restore();
                });
                ctx.restore();
            }
        };
    },

    /** County-level multi-line chart with governor overlay and state reference line */
    createCountyChart(canvas, countyData, metricData, govBoxes, countyColors, stateData) {
        const ctx = canvas.getContext('2d');
        const existingChart = Chart.getChart(canvas);
        if (existingChart) existingChart.destroy();

        const allYears = new Set();
        for (const county of countyData.counties) {
            Object.keys(countyData.data[county]).forEach(y => allYears.add(y));
        }
        const labels = [...allYears].sort();
        const isDecimalPct = this.isDecimalPctMetric(metricData);

        // Compute average across all counties for governor label placement
        let totalSum = 0, totalCount = 0;
        for (const county of countyData.counties) {
            for (const y of labels) {
                const v = countyData.data[county][y];
                if (v != null && v !== 0) { totalSum += v; totalCount++; }
            }
        }
        const dataAvg = totalCount > 0 ? totalSum / totalCount : 0;
        const governorPlugin = this._buildGovernorPlugin(govBoxes, dataAvg);

        const datasets = countyData.counties.map(county => {
            const color = countyColors[county];
            const values = labels.map(y => {
                const v = countyData.data[county][y];
                return (v === 0 || v == null) ? null : v;
            });
            return {
                label: county,
                data: values,
                borderColor: color,
                borderWidth: 1.5,
                fill: false,
                tension: 0.3,
                pointRadius: labels.length <= 15 ? 3 : 0,
                pointHoverRadius: 5,
                pointBackgroundColor: color,
                pointBorderColor: '#fff',
                pointBorderWidth: 1.5,
                spanGaps: true,
            };
        });

        // Add state-level reference line (bold dashed black)
        if (stateData) {
            // Find the range of years that have at least one county data point
            const yearsWithCountyData = new Set();
            for (const county of countyData.counties) {
                for (const y of labels) {
                    const v = countyData.data[county][y];
                    if (v != null && v !== 0) yearsWithCountyData.add(y);
                }
            }
            const countyYearsSorted = [...yearsWithCountyData].sort();
            const countyMinYear = countyYearsSorted[0];
            const countyMaxYear = countyYearsSorted[countyYearsSorted.length - 1];

            const stateValues = labels.map(y => {
                // Only include state values within the county data range
                if (y < countyMinYear || y > countyMaxYear) return null;
                const v = stateData[y];
                return (v === 0 || v == null) ? null : v;
            });
            datasets.push({
                label: 'State',
                data: stateValues,
                borderColor: '#111111',
                borderWidth: 2.5,
                borderDash: this.DASH_STATE_REF,
                fill: false,
                tension: 0.3,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointBackgroundColor: '#111111',
                pointBorderColor: '#fff',
                pointBorderWidth: 1.5,
                spanGaps: true,
                order: -1,
            });
        }

        return new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            plugins: [governorPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: 0 },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'center',
                        labels: {
                            usePointStyle: true,
                            pointStyle: 'circle',
                            padding: 14,
                            font: { size: 11, weight: '500' },
                            color: '#555555',
                            boxWidth: 8,
                            boxHeight: 8,
                            generateLabels: function(chart) {
                                const defaultLabels = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                                return defaultLabels.map(label => {
                                    if (label.text === 'State') {
                                        label.pointStyle = 'line';
                                        label.lineDash = [6, 3];
                                        label.lineWidth = 2.5;
                                        label.strokeStyle = '#111111';
                                        label.fontColor = '#111111';
                                    }
                                    return label;
                                });
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: '#333333',
                        titleColor: '#fff',
                        bodyColor: '#E5E7EB',
                        padding: 12,
                        cornerRadius: 8,
                        titleFont: { size: 13, weight: '600' },
                        bodyFont: { size: 12 },
                        usePointStyle: true,
                        filter: (tooltipItem) => {
                            return tooltipItem.parsed.y !== null;
                        },
                        callbacks: {
                            label: (context) => {
                                const val = context.parsed.y;
                                return ` ${context.dataset.label}: ${ChartUtils.formatValue(val, metricData.unit, isDecimalPct)}`;
                            }
                        }
                    },
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            font: { size: 11 },
                            color: '#888888',
                            maxRotation: 45,
                            minRotation: 0,
                        }
                    },
                    y: {
                        grid: { color: 'rgba(0,0,0,0.04)' },
                        ticks: {
                            font: { size: 11 },
                            color: '#888888',
                            callback: (value) => {
                                if (isDecimalPct) return (value * 100).toFixed(1) + '%';
                                return ChartUtils.formatValue(value, metricData.unit);
                            }
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index',
                },
                animation: { duration: 1000, easing: 'easeOutQuart' },
            }
        });
    },

    /**
     * Format a value based on its unit type.
     * @param {number} value
     * @param {string} unit
     * @param {boolean} [isDecimalPct] - For % units: true if values are stored as decimals (0.028 = 2.8%).
     *                                   Pass this from isDecimalPctMetric() for accurate formatting.
     */
    formatValue(value, unit, isDecimalPct) {
        if (value === null || value === undefined || isNaN(value)) return 'N/A';

        switch (unit) {
            case '$':
                return '$' + Math.round(value).toLocaleString();
            case '%':
                if (isDecimalPct) return (value * 100).toFixed(1) + '%';
                return value.toFixed(1) + '%';
            case 'per 100K':
                return Math.round(value).toLocaleString();
            case 'per 10K':
                return value.toFixed(1);
            case 'per 1,000':
                return value.toFixed(2);
            case '\u00a2/kWh':
                return value.toFixed(1) + '\u00a2';
            case '\u00d7':
                return value.toFixed(1) + '\u00d7';
            case 'Index (2017=100)':
                return value.toFixed(1);
            default:
                if (Math.abs(value) >= 1000) {
                    return Math.round(value).toLocaleString();
                }
                return value.toFixed(1);
        }
    },

    /**
     * Format for display on cards (shorter). Delegates to formatValue
     * but uses compact dollar format ($65K instead of $65,000).
     * @param {number} value
     * @param {string} unit
     * @param {boolean} [isDecimalPct] - For % units: true if values are stored as decimals.
     */
    formatCardValue(value, unit, isDecimalPct) {
        if (value === null || value === undefined || isNaN(value)) return 'N/A';
        if (unit === '$') {
            return value >= 1000
                ? '$' + (value / 1000).toFixed(0) + 'K'
                : '$' + Math.round(value);
        }
        return this.formatValue(value, unit, isDecimalPct);
    },

    /**
     * Horizontal bar chart ranking all 50 states for a given metric.
     * @param {HTMLCanvasElement} canvas
     * @param {Array<{state: string, value: number}>} stateValues - sorted best-to-worst
     * @param {string} goodDirection - 'up' or 'down'
     * @param {string} unit - metric unit for label formatting
     * @returns {Chart}
     */
    createRankingsChart(canvas, stateValues, goodDirection, unit, distStats) {
        const ctx = canvas.getContext('2d');
        const existingChart = Chart.getChart(canvas);
        if (existingChart) existingChart.destroy();

        const abbreviateState = (name) => STATE_ABBREVS[name] || name.slice(0, 2).toUpperCase();

        const labels = stateValues.map(s => abbreviateState(s.state));
        const values = stateValues.map(s => s.value);
        // Dynamic height: 22px per bar + 70px top for dot strip, minimum 500px
        const dotStripHeight = 70;
        const barHeight = 22;
        const chartHeight = Math.max(500, stateValues.length * barHeight + dotStripHeight);
        canvas.style.height = chartHeight + 'px';
        canvas.parentElement.style.height = chartHeight + 'px';

        // Rankings values are pre-converted to display scale, so never multiply % by 100
        const fmt = (v, u) => this.formatValue(v, u, false);
        const lerp = this.lerp;
        const n = stateValues.length;

        // Bar colors: Hawaii highlighted, others gray
        const otherColor = '#A0A5AD';
        const bgColors = stateValues.map(s =>
            this.isHawaii(s.state) ? this.HAWAII_BLUE : otherColor
        );
        const borderColors = stateValues.map(s =>
            this.isHawaii(s.state) ? this.HAWAII_BLUE : 'transparent'
        );
        const borderWidths = stateValues.map(s =>
            this.isHawaii(s.state) ? 2 : 0
        );

        // Background gradient: green (best) → white → red (worst)
        const [neutralStart, neutralEnd] = this.NEUTRAL_RANGE;
        const [gr, gg, gb] = this.GREEN_BEST;
        const [rr, rg, rb] = this.RED_WORST;
        const neutralStartPct = (neutralStart - 1) / (n - 1);
        const neutralEndPct = (neutralEnd - 1) / (n - 1);

        // Precompute formatted value labels and Hawaii index
        const formattedLabels = values.map(v => fmt(v, unit));
        const hawaiiIdx = labels.findIndex(l => l === 'HI');

        // 3 evenly spaced x-axis ticks: start, middle, end
        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);
        const range = maxVal - minVal;
        // Nice rounding helper
        const niceRound = (v, step) => Math.round(v / step) * step;
        // Pick rounding step based on range
        const mag = Math.pow(10, Math.floor(Math.log10(Math.max(range, 1))));
        const roundStep = mag >= range / 2 ? mag / 5 : mag / 2;
        const xStart = minVal <= 0 ? niceRound(minVal - range * 0.12, roundStep) : Math.max(0, niceRound(minVal - range * 0.05, roundStep));
        const xEnd = niceRound(maxVal + range * 0.15, roundStep);
        const xMid = niceRound((xStart + xEnd) / 2, roundStep);
        const xTicks = [xStart, xMid, xEnd];

        // Background gradient anchored to median position
        // Find which bar index is closest to the median value
        const medianIdx = distStats
            ? values.reduce((best, v, i) => Math.abs(v - distStats.median) < Math.abs(values[best] - distStats.median) ? i : best, 0)
            : Math.floor(n / 2);
        const rowBgPlugin = {
            id: 'rowBackground',
            beforeDatasetsDraw(chart) {
                const { ctx, chartArea } = chart;
                const { top, bottom, left, right } = chartArea;
                const medFrac = (medianIdx + 0.5) / n;
                ctx.save();
                const grad = ctx.createLinearGradient(0, top, 0, bottom);
                grad.addColorStop(0, 'rgba(34,197,94,0.45)');
                grad.addColorStop(Math.max(0, medFrac - 0.08), 'rgba(34,197,94,0.08)');
                grad.addColorStop(medFrac, 'rgba(255,255,255,0.0)');
                grad.addColorStop(Math.min(1, medFrac + 0.08), 'rgba(239,68,68,0.08)');
                grad.addColorStop(1, 'rgba(239,68,68,0.45)');
                ctx.fillStyle = grad;
                ctx.fillRect(left, top, right - left, bottom - top);
                ctx.restore();
            }
        };

        // Integrated dot strip + distribution lines plugin
        const hiIdx = labels.findIndex(l => l === 'HI');
        const dotStripPlugin = {
            id: 'dotStripAndDistLines',
            afterDatasetsDraw(chart) {
                const { ctx, chartArea, scales } = chart;
                const xScale = scales.x;
                const dotY = chartArea.top - 35;
                const topEdge = chartArea.top - dotStripHeight + 5;
                ctx.save();

                // Distribution lines: run from dot strip through entire chart
                if (distStats) {
                    const q1x = xScale.getPixelForValue(distStats.q1);
                    const q3x = xScale.getPixelForValue(distStats.q3);
                    const bestX = xScale.getPixelForValue(values[0]);
                    const worstX = xScale.getPixelForValue(values[n - 1]);
                    const isGoodDown = goodDirection === 'down';

                    const topZoneLeft = isGoodDown ? bestX : q3x;
                    const topZoneRight = isGoodDown ? q1x : bestX;
                    const botZoneLeft = isGoodDown ? q3x : worstX;
                    const botZoneRight = isGoodDown ? worstX : q1x;

                    ctx.fillStyle = 'rgba(5, 150, 105, 0.07)';
                    ctx.fillRect(topZoneLeft, topEdge, topZoneRight - topZoneLeft, chartArea.bottom - topEdge);
                    ctx.fillStyle = 'rgba(192, 57, 43, 0.06)';
                    ctx.fillRect(botZoneLeft, topEdge, botZoneRight - botZoneLeft, chartArea.bottom - topEdge);

                    ctx.font = '500 11px Inter, sans-serif';
                    ctx.fillStyle = '#7A8A9A';
                    ctx.textAlign = 'center';
                    const lines = [
                        { val: distStats.q1, dash: [4, 4], alpha: 0.2, width: 1 },
                        { val: distStats.median, dash: [6, 3], alpha: 0.3, width: 1.5, label: 'Median' },
                        { val: distStats.q3, dash: [4, 4], alpha: 0.2, width: 1 },
                    ];
                    lines.forEach(line => {
                        const x = xScale.getPixelForValue(line.val);
                        if (x >= chartArea.left && x <= chartArea.right) {
                            ctx.beginPath();
                            ctx.setLineDash(line.dash);
                            ctx.strokeStyle = `rgba(13, 124, 143, ${line.alpha})`;
                            ctx.lineWidth = line.width;
                            ctx.moveTo(x, topEdge + 14);
                            ctx.lineTo(x, chartArea.bottom);
                            ctx.stroke();
                            ctx.setLineDash([]);
                            if (line.label) ctx.fillText(line.label, x, topEdge + 8);
                            ctx.fillText(distStats.fmt(line.val), x, chartArea.bottom + 14);
                        }
                    });

                    ctx.fillText('Top 25%', (topZoneLeft + topZoneRight) / 2, topEdge + 8);
                    ctx.fillText('Bottom 25%', (botZoneLeft + botZoneRight) / 2, topEdge + 8);
                }

                // Dot strip dots
                ctx.setLineDash([]);
                stateValues.forEach((s, i) => {
                    const x = xScale.getPixelForValue(s.value);
                    const isHi = (i === hiIdx);
                    const r = isHi ? 5.5 : 3;
                    ctx.beginPath();
                    ctx.arc(x, dotY, r, 0, Math.PI * 2);
                    ctx.fillStyle = isHi ? '#0D7C8F' : '#C3CDD7';
                    ctx.fill();
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = isHi ? 1.5 : 0.5;
                    ctx.stroke();
                });

                // Labels for Hawaii and endpoints
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                // Hawaii
                if (hiIdx >= 0) {
                    const hx = xScale.getPixelForValue(values[hiIdx]);
                    ctx.font = '700 9px Inter, sans-serif';
                    ctx.fillStyle = '#0D7C8F';
                    ctx.fillText('HI', hx, dotY + 8);
                }
                // First (best) state
                const firstX = xScale.getPixelForValue(values[0]);
                ctx.font = '500 8px Inter, sans-serif';
                ctx.fillStyle = '#999';
                if (Math.abs(firstX - xScale.getPixelForValue(values[hiIdx])) > 35) {
                    ctx.fillText(labels[0], firstX, dotY + 8);
                }
                // Last (worst) state
                const lastX = xScale.getPixelForValue(values[n - 1]);
                if (Math.abs(lastX - xScale.getPixelForValue(values[hiIdx])) > 35) {
                    ctx.fillText(labels[n - 1], lastX, dotY + 8);
                }

                ctx.restore();
            }
        };

        // Dot strip hover/click interaction
        let hoveredDotIdx = -1;
        const dotStripHoverPlugin = {
            id: 'dotStripHover',
            afterDatasetsDraw(chart) {
                if (hoveredDotIdx < 0 || hoveredDotIdx >= stateValues.length) return;
                const { ctx: c, scales, chartArea } = chart;
                const xScale = scales.x;
                const s = stateValues[hoveredDotIdx];
                const x = xScale.getPixelForValue(s.value);
                const y = chartArea.top - 35;
                const lineTop = chartArea.top - dotStripHeight + 5;
                c.save();
                // Ghost vertical line spanning from top of dot strip to bottom of rank chart
                c.beginPath();
                c.setLineDash([4, 3]);
                c.strokeStyle = 'rgba(100, 100, 100, 0.25)';
                c.lineWidth = 1;
                c.moveTo(x, lineTop);
                c.lineTo(x, chartArea.bottom);
                c.stroke();
                c.setLineDash([]);
                // Enlarged dot
                c.beginPath();
                c.arc(x, y, 6, 0, Math.PI * 2);
                c.fillStyle = hoveredDotIdx === hiIdx ? '#0D7C8F' : '#7A8A9A';
                c.fill();
                c.strokeStyle = '#fff';
                c.lineWidth = 1.5;
                c.stroke();
                // Label above
                const abbr = abbreviateState(s.state);
                const text = `${abbr} ${fmt(s.value, unit)}`;
                c.font = '600 10px Inter, sans-serif';
                c.textAlign = 'center';
                c.fillStyle = '#444';
                c.fillText(text, x, y - 12);
                c.restore();
            }
        };
        const canvasEl = ctx.canvas || ctx;
        const findDot = (e, chart) => {
            const rect = canvasEl.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const ca = chart.chartArea;
            const lineTop = ca.top - dotStripHeight + 5;
            if (my < lineTop || my > ca.bottom || mx < ca.left || mx > ca.right) return -1;
            const dotY = ca.top - 35;
            const snapRadius = Math.abs(my - dotY) <= 12 ? 15 : 20;
            const xScale = chart.scales.x;
            let closest = -1, closestDist = snapRadius;
            stateValues.forEach((s, i) => {
                const dx = Math.abs(mx - xScale.getPixelForValue(s.value));
                if (dx < closestDist) { closestDist = dx; closest = i; }
            });
            return closest;
        };
        canvasEl.addEventListener('mousemove', (e) => {
            const chart = Chart.getChart(canvasEl);
            if (!chart) return;
            const idx = findDot(e, chart);
            if (idx !== hoveredDotIdx) {
                hoveredDotIdx = idx;
                canvasEl.style.cursor = idx >= 0 ? 'pointer' : '';
                chart.draw();
            }
        });
        canvasEl.addEventListener('mouseleave', () => {
            if (hoveredDotIdx >= 0) {
                hoveredDotIdx = -1;
                const chart = Chart.getChart(canvasEl);
                if (chart) chart.draw();
            }
        });
        canvasEl.addEventListener('click', (e) => {
            const chart = Chart.getChart(canvasEl);
            if (!chart) return;
            const idx = findDot(e, chart);
            if (idx >= 0) {
                hoveredDotIdx = idx;
                chart.draw();
            }
        });

        const self = this;
        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: bgColors,
                    borderColor: borderColors,
                    borderWidth: borderWidths,
                    barPercentage: 0.75,
                    categoryPercentage: 0.9,
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { right: 20, top: dotStripHeight, bottom: 20 } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (items) => {
                                const idx = items[0]?.dataIndex;
                                return idx != null ? stateValues[idx].state : '';
                            },
                            label: (ctx) => fmt(ctx.raw, unit)
                        }
                    }
                },
                scales: {
                    x: {
                        display: false,
                        min: xTicks[0],
                        max: xTicks[2],
                    },
                    y: {
                        grid: { display: false },
                        ticks: {
                            font: (ctx) => ({
                                size: 11,
                                family: "'Inter', sans-serif",
                                weight: ctx.tick?.label === 'HI' ? 'bold' : 'normal',
                            }),
                            color: (ctx) => {
                                return ctx.tick?.label === 'HI'
                                    ? self.HAWAII_BLUE : '#555';
                            },
                        }
                    }
                },
                animation: { duration: 400 }
            },
            plugins: [rowBgPlugin, dotStripPlugin, dotStripHoverPlugin, {
                id: 'valueLabels',
                afterDatasetsDraw(chart) {
                    const { ctx, chartArea } = chart;
                    ctx.save();
                    ctx.textBaseline = 'middle';
                    chart.data.datasets[0].data.forEach((val, i) => {
                        const meta = chart.getDatasetMeta(0).data[i];
                        if (!meta) return;
                        const isBold = i === hawaiiIdx;
                        ctx.font = isBold ? 'bold 11px Inter, sans-serif' : '11px Inter, sans-serif';
                        const label = formattedLabels[i];
                        const textW = ctx.measureText(label).width;
                        const barEnd = meta.x;
                        const barBase = meta.base;
                        const isNegative = barEnd < barBase;
                        ctx.fillStyle = '#555';
                        let x;
                        if (isNegative) {
                            // Negative bar: label to the left of the bar tip
                            x = barEnd - textW - 6;
                            if (x < chartArea.left) x = chartArea.left;
                        } else {
                            // Positive bar: label to the right of the bar tip
                            x = barEnd + 6;
                            if (x + textW > chartArea.right - 2) {
                                const insideX = barEnd - textW - 6;
                                if (insideX >= chartArea.left + 4) {
                                    x = insideX;
                                    ctx.fillStyle = '#fff';
                                }
                            }
                        }
                        ctx.fillText(label, x, meta.y);
                    });
                    ctx.restore();
                }
            }]
        });
    },

    // ============================================================
    // Rank History Chart - line chart showing Hawaii's rank over time
    // with interactive state comparison
    // ============================================================
    createRankHistoryChart(canvas, rankHistory, metricData, govBoxes, onCompare, initialCompare) {
        const ctx = canvas.getContext('2d');
        const existingChart = Chart.getChart(canvas);
        if (existingChart) existingChart.destroy();

        const { years, stateRanks, stateValues, latestYearRanked, hiKey } = rankHistory;
        const totalStates = latestYearRanked.length;

        // Build Hawaii's rank array for each year
        const hiRanks = years.map(yr => stateRanks[hiKey] ? (stateRanks[hiKey][yr] || null) : null);

        // Always show the full rank range 1–N so all state codes are visible on both axes
        const yBoundsMin = 0.5;
        const yBoundsMax = totalStates;

        // State currently being compared (may be pre-set from URL)
        let compState = (initialCompare && stateRanks[initialCompare]) ? initialCompare : null;
        // State being hovered on right side
        let hoverState = null;

        // Abbreviation helper
        const abbr = (name) => {
            const map = typeof STATE_ABBREVS !== 'undefined' ? STATE_ABBREVS : {};
            return map[name] || name.slice(0, 2).toUpperCase();
        };

        // Build comparison dataset data
        function getCompRanks(stateName) {
            if (!stateName || !stateRanks[stateName]) return years.map(() => null);
            return years.map(yr => stateRanks[stateName][yr] || null);
        }

        // Format a raw metric value for display in tooltips
        function fmtVal(v) {
            if (v == null) return '';
            const unit = metricData.unit || '';
            if (unit === '%') return v.toFixed(1) + '%';
            if (unit === '$') return '$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'K' : Math.round(v).toLocaleString());
            if (unit === '\u00a2/kWh') return v.toFixed(1) + '\u00a2/kWh';
            if (unit === 'per 100K') return (v >= 10 ? Math.round(v) : +v.toFixed(1)).toLocaleString() + ' per 100K';
            if (unit === 'per 10K') return v.toFixed(1) + ' per 10K';
            if (unit === 'score' || unit === 'Index (2017=100)') return (+v.toFixed(1)).toLocaleString();
            return (v >= 100 ? Math.round(v) : +v.toFixed(1)).toLocaleString() + (unit ? ' ' + unit : '');
        }

        // Chart height: fixed 14px per rank row so all 50 rows + labels fit
        const rowH = 14;
        const rankChartH = totalStates * rowH + 60;
        canvas.style.height = rankChartH + 'px';

        // Datasets - Hawaii only; comparison is drawn via custom plugin
        const datasets = [
            {
                label: 'Hawai\u02BBi',
                data: hiRanks,
                borderColor: this.HAWAII_BLUE,
                borderWidth: 3,
                pointRadius: hiRanks.map(v => v == null ? 0 : 5),
                pointHoverRadius: 7,
                pointBackgroundColor: this.HAWAII_BLUE,
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                tension: 0,
                spanGaps: true,
            },
        ];

        // Governor bands plugin (same as Trend tab)
        const governorPlugin = ChartUtils._buildGovernorPlugin(govBoxes || [], 0);

        // Background gradient: green (best/top) → transparent (median) → red (worst/bottom)
        const quartilePlugin = {
            id: 'rankHistoryQuartiles',
            beforeDraw(chart) {
                const { ctx: c, chartArea: { left, right, top, bottom } } = chart;
                const yScale = chart.scales.y;
                // Fraction of chart height where rank 25.5 (median) sits
                const medY = yScale.getPixelForValue(25.5);
                const medFrac = Math.max(0, Math.min(1, (medY - top) / (bottom - top)));
                c.save();
                const grad = c.createLinearGradient(0, top, 0, bottom);
                // Symmetric around median: equal fade zones above and below
                grad.addColorStop(0, 'rgba(34,197,94,0.45)');
                grad.addColorStop(Math.max(0, medFrac - 0.12), 'rgba(34,197,94,0.08)');
                grad.addColorStop(Math.max(0, medFrac - 0.05), 'rgba(255,255,255,0.0)');
                grad.addColorStop(Math.min(1, medFrac + 0.05), 'rgba(255,255,255,0.0)');
                grad.addColorStop(Math.min(1, medFrac + 0.12), 'rgba(239,68,68,0.08)');
                grad.addColorStop(1, 'rgba(239,68,68,0.45)');
                c.fillStyle = grad;
                c.fillRect(left, top, right - left, bottom - top);
                c.restore();
            }
        };

        // Gridlines + Q1/Median/Q3 reference lines drawn early so tooltip renders on top
        const gridlinesPlugin = {
            id: 'rankHistoryGridlines',
            beforeDatasetsDraw(chart) {
                const { ctx: c, chartArea: { left, right } } = chart;
                const yScale = chart.scales.y;
                const rMin = Math.ceil(yScale.min);
                const rMax = Math.floor(yScale.max);

                // Fine rank gridlines (only within visible range)
                for (let r = rMin; r <= rMax; r++) {
                    const y = yScale.getPixelForValue(r);
                    c.strokeStyle = (r % 10 === 0) ? '#e0e0e0' : '#f2f2f2';
                    c.lineWidth = (r % 10 === 0) ? 0.8 : 0.4;
                    c.beginPath();
                    c.moveTo(left, y);
                    c.lineTo(right, y);
                    c.stroke();
                }

                // Q1 / Median / Q3 reference lines (skip if outside visible range)
                const refs = [
                    { rank: 12.5, label: 'Top 25%',    color: 'rgba(5,150,105,0.55)',   lw: 1.2 },
                    { rank: 25.5, label: 'Median',      color: 'rgba(100,100,100,0.55)', lw: 1.5 },
                    { rank: 37.5, label: 'Bottom 25%',  color: 'rgba(192,57,43,0.55)',   lw: 1.2 },
                ];
                for (const ref of refs) {
                    if (ref.rank < yScale.min || ref.rank > yScale.max) continue;
                    const y = yScale.getPixelForValue(ref.rank);
                    c.save();
                    c.strokeStyle = ref.color;
                    c.lineWidth = ref.lw;
                    c.setLineDash([5, 4]);
                    c.beginPath();
                    c.moveTo(left, y);
                    c.lineTo(right, y);
                    c.stroke();
                    c.setLineDash([]);
                    // Label at left edge, above the line
                    c.fillStyle = ref.color;
                    c.font = 'italic 600 9px Inter, sans-serif';
                    c.textAlign = 'left';
                    c.textBaseline = 'bottom';
                    c.fillText(ref.label, left + 3, y - 2);
                    c.restore();
                }
            }
        };

        // State labels on right edge drawn after datasets (on top of lines)
        const stateLabelsPlugin = {
            id: 'rankHistoryStateLabels',
            afterDraw(chart) {
                const { ctx: c, chartArea: { right } } = chart;
                const yScale = chart.scales.y;
                c.textAlign = 'left';
                for (const entry of latestYearRanked) {
                    // Skip labels whose rank falls outside the current visible range
                    if (entry.rank < yScale.min || entry.rank > yScale.max) continue;
                    const y = yScale.getPixelForValue(entry.rank);
                    const code = abbr(entry.state);
                    const isHI = (entry.state === hiKey);
                    const isComp = (entry.state === compState);
                    const isHover = (entry.state === hoverState);

                    if (isHI) {
                        c.fillStyle = ChartUtils.HAWAII_BLUE;
                        c.font = '700 10px Inter';
                    } else if (isComp) {
                        c.fillStyle = ChartUtils.COMP_LABEL_COLOR;
                        c.font = '700 10px Inter';
                    } else if (isHover) {
                        c.fillStyle = '#777';
                        c.font = '600 10px Inter';
                    } else {
                        c.fillStyle = '#bbb';
                        c.font = '400 9px Inter';
                    }
                    c.fillText(code, right + 6, y + 3.5);
                }
            }
        };

        // Helper: draw a line from rank data using raw canvas
        function drawRankLine(c, xScale, yScale, ranks, color, lineWidth, dashed, dotRadius) {
            c.save();
            c.strokeStyle = color;
            c.lineWidth = lineWidth;
            if (dashed) c.setLineDash([4, 3]);
            c.beginPath();
            let started = false;
            const points = [];
            for (let i = 0; i < years.length; i++) {
                if (ranks[i] == null) continue;
                const x = xScale.getPixelForValue(i);
                const y = yScale.getPixelForValue(ranks[i]);
                if (!started) { c.moveTo(x, y); started = true; }
                else c.lineTo(x, y);
                points.push({ x, y });
            }
            c.stroke();
            c.setLineDash([]);
            // Draw dots at each year
            if (dotRadius > 0) {
                c.fillStyle = color;
                for (const p of points) {
                    c.beginPath();
                    c.arc(p.x, p.y, dotRadius, 0, Math.PI * 2);
                    c.fill();
                }
            }
            c.restore();
        }

        // Ghost preview + comparison line plugin (both drawn via raw canvas)
        const overlayPlugin = {
            id: 'rankHistoryOverlay',
            beforeDatasetsDraw(chart) {
                const { ctx: c } = chart;
                const xScale = chart.scales.x;
                const yScale = chart.scales.y;

                // Draw solid comparison line first (behind Hawaii)
                if (compState && compState !== hiKey) {
                    const ranks = getCompRanks(compState);
                    drawRankLine(c, xScale, yScale, ranks, ChartUtils.COMP_LINE_COLOR, ChartUtils.COMP_LINE_WIDTH, false, ChartUtils.COMP_DOT_RADIUS);
                }

                // Draw ghost preview for hovered state (dashed, transparent)
                if (hoverState && hoverState !== hiKey && hoverState !== compState) {
                    const ranks = getCompRanks(hoverState);
                    drawRankLine(c, xScale, yScale, ranks, ChartUtils.HOVER_LINE_COLOR, ChartUtils.HOVER_LINE_WIDTH, true, ChartUtils.HOVER_DOT_RADIUS);
                }
            }
        };

        const chart = new Chart(ctx, {
            type: 'line',
            data: { labels: years.map(y => String(y)), datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { right: 34, top: 10, bottom: 5, left: 5 } },
                scales: {
                    y: {
                        reverse: true,
                        min: yBoundsMin,
                        max: yBoundsMax,
                        grid: { display: false },
                        ticks: {
                            callback: (v) => Number.isInteger(v) && v >= 1 ? '#' + v : '',
                            font: { size: 9 },
                            color: '#aaa',
                            padding: 3,
                        },
                        afterBuildTicks(scale) {
                            scale.ticks = [{ value: 1 }];
                            for (let r = 5; r <= totalStates; r += 5) {
                                scale.ticks.push({ value: r });
                            }
                        },
                        title: { display: false },
                    },
                    x: {
                        border: { display: false },
                        grid: { display: false },
                        ticks: {
                            font: { size: 11 },
                            color: '#888888',
                            maxRotation: 45,
                            autoSkip: false,
                        },
                    }
                },
                animation: { duration: 300 },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: true,
                        filter: (item) => item.raw != null,
                        callbacks: {
                            title: (items) => items.length ? years[items[0].dataIndex] : '',
                            label: (item) => {
                                if (item.raw == null) return '';
                                const yr = years[item.dataIndex];
                                const val = stateValues && stateValues[hiKey] && stateValues[hiKey][yr];
                                const valStr = val != null ? '  \u00b7  ' + fmtVal(val) : '';
                                return `Hawai\u02BBi: #${item.raw}${valStr}`;
                            },
                            afterBody: (items) => {
                                if (!compState || !items.length) return [];
                                const yr = years[items[0].dataIndex];
                                const rank = stateRanks[compState] && stateRanks[compState][yr];
                                if (!rank) return [];
                                const val = stateValues && stateValues[compState] && stateValues[compState][yr];
                                const valStr = val != null ? '  \u00b7  ' + fmtVal(val) : '';
                                return [`${compState}: #${rank}${valStr}`];
                            }
                        },
                        displayColors: false,
                        backgroundColor: 'rgba(51,51,51,0.92)',
                        titleFont: { size: 11, weight: 600 },
                        bodyFont: { size: 11 },
                        padding: 8,
                        cornerRadius: 5,
                    }
                }
            },
            plugins: [governorPlugin, quartilePlugin, gridlinesPlugin, overlayPlugin, stateLabelsPlugin]
        });

        // --- Click interaction: detect state label clicks on right side ---
        function getStateAtPosition(evt) {
            // Use CSS pixel coordinates (offsetX/Y) to match Chart.js coordinate space
            const mx = evt.offsetX;
            const my = evt.offsetY;
            const { right, top, bottom } = chart.chartArea;
            const yScale = chart.scales.y;
            // Row height based on visible range (adaptive bounds may show fewer than totalStates)
            const visibleRange = yScale.max - yScale.min;
            const rowH = (bottom - top) / visibleRange;

            // Hit zone: from chartArea right edge outward to cover the label text
            if (mx >= right - 4 && mx <= right + 50) {
                for (const entry of latestYearRanked) {
                    if (entry.rank < yScale.min || entry.rank > yScale.max) continue;
                    const y = yScale.getPixelForValue(entry.rank);
                    if (Math.abs(my - y) < rowH * 0.9) {
                        return entry.state;
                    }
                }
            }
            return null;
        }

        canvas.addEventListener('click', (evt) => {
            const state = getStateAtPosition(evt);
            if (state && state !== hiKey) {
                compState = (compState === state) ? null : state;
                onCompare(compState);
                chart.update('none');
            }
        });

        canvas.addEventListener('mousemove', (evt) => {
            const labelState = getStateAtPosition(evt);
            if (labelState && labelState !== hiKey) {
                canvas.style.cursor = 'pointer';
                if (hoverState !== labelState) {
                    hoverState = labelState;
                    chart.update('none');
                }
            } else {
                canvas.style.cursor = 'default';
                if (hoverState !== null) {
                    hoverState = null;
                    chart.update('none');
                }
            }
        });

        canvas.addEventListener('mouseleave', () => {
            if (hoverState !== null) {
                hoverState = null;
                chart.update('none');
            }
        });

        // Expose clear function for external button
        chart._clearComparison = () => {
            compState = null;
            hoverState = null;
            chart.update('none');
        };

        return chart;
    }
};
