// ============================================================
// Hawaiʻi Dashboard - Chart Rendering (Chart.js v4)
//
// createSparkline()   - mini card charts with gap-scaled fill
// createDetailChart() - full modal chart with governor overlays
// formatValue()       - unit-aware number formatting
// formatCardValue()   - compact formatting for card display
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

        // Build an accessible label describing the trend
        const nonNullHI = values.filter(v => v !== null);
        const nonNullAvg = avgValues.filter(v => v !== null);
        if (nonNullHI.length > 0 && nonNullAvg.length > 0) {
            const latestHIVal = nonNullHI[nonNullHI.length - 1];
            const latestAvgVal = nonNullAvg[nonNullAvg.length - 1];
            const aboveBelow = latestHIVal >= latestAvgVal ? 'above' : 'below';
            let trend = 'stable';
            if (nonNullHI.length >= 2) {
                const prev = nonNullHI[nonNullHI.length - 2];
                const curr = nonNullHI[nonNullHI.length - 1];
                const moved = curr > prev ? 'up' : curr < prev ? 'down' : 'flat';
                if (moved === 'flat') {
                    trend = 'stable';
                } else if (goodDirection === 'up') {
                    trend = moved === 'up' ? 'improving' : 'worsening';
                } else {
                    trend = moved === 'down' ? 'improving' : 'worsening';
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
        // Map: 0-5% gap -> 0.08, 10% -> 0.12, 25% -> 0.20, 50%+ -> 0.35
        const fillAlpha = Math.min(0.40, 0.08 + gapPct * 0.55);

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
                                // Always show first 4 chars as 'XX (handles "2012", "2012-2013", "2012–2013")
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

        // Same gap-scaled fill as sparklines
        const goodDir = data.goodDirection;
        const latestHI = hawaiiValues.filter(v => v !== null).pop() || 0;
        const latestAvgVal = avgValues.filter(v => v !== null).pop() || 0;
        const mid = (Math.abs(latestHI) + Math.abs(latestAvgVal)) / 2 || 1;
        const gap = Math.abs(latestHI - latestAvgVal) / mid;
        const alpha = Math.min(0.45, 0.10 + gap * 0.55);
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
                        label: 'Other State Avg',
                        data: avgValues,
                        borderColor: this.AVG_GRAY,
                        backgroundColor: this.AVG_GRAY_BG,
                        borderWidth: 1.5,
                        borderDash: [6, 4],
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
                                return `${context.dataset.label}: ${ChartUtils.formatValue(val, data.unit, isDecimalPct)}`;
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
                const pillPad = 5;
                const pillH = 18;
                const yScale = chart.scales.y;
                const midY = (yScale.top + yScale.bottom) / 2;
                const avgPixel = yScale.getPixelForValue(dataAvg);
                const dataInTopHalf = avgPixel < midY;
                const pillY = dataInTopHalf
                    ? chartArea.bottom - pillH - 4
                    : chartArea.top + 2;
                ctx.font = '400 11px "Inter", sans-serif';
                const gap = 6;
                const step = xScale.ticks.length > 1
                    ? (xScale.getPixelForValue(1) - xScale.getPixelForValue(0)) : 0;
                const candidates = govBoxes.map((gov, gi) => {
                    const x1 = xScale.getPixelForValue(gov.startIdx) - step * 0.5;
                    const x2 = xScale.getPixelForValue(gov.endIdx) + step * 0.5;
                    const left = Math.max(x1, chartArea.left);
                    const right = Math.min(x2, chartArea.right);
                    const parts = gov.name.split(' ');
                    const lastName = parts[parts.length - 1];
                    const variants = [
                        `${gov.name} (${gov.party})`,
                        `${lastName} (${gov.party})`,
                        lastName,
                    ];
                    return { gov, left, right, variants, idx: gi, centerX: (left + right) / 2 };
                });
                // Always draw alternating background bands
                candidates.forEach(c => {
                    if (c.idx % 2 === 0) {
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.025)';
                        ctx.fillRect(c.left, chartArea.top, c.right - c.left, chartArea.bottom - chartArea.top);
                    }
                });
                // On narrow charts, skip text labels and only show bands
                const chartWidth = chartArea.right - chartArea.left;
                if (chartWidth < 500) {
                    ctx.restore();
                    return;
                }
                // Inset from left edge so labels do not overlap y-axis values
                const leftInset = chartArea.left + 30;
                // Filter out governors whose band is too narrow for any label
                const minLabelWidth = 30;
                const fittable = candidates.filter(c => (c.right - c.left) >= minLabelWidth);
                let prevRight = leftInset;
                const placed = [];
                fittable.forEach(c => {
                    // Find the longest variant that fits within the band
                    let bestText = null;
                    for (const v of c.variants) {
                        const w = ctx.measureText(v).width;
                        if (w + pillPad * 2 <= (c.right - c.left) && c.left >= prevRight) {
                            bestText = v;
                            break;
                        }
                    }
                    // Fall back to shortest variant if it fits with gap from previous
                    if (!bestText) {
                        const shortest = c.variants[c.variants.length - 1];
                        const sw = ctx.measureText(shortest).width;
                        if (c.centerX - sw / 2 >= prevRight + gap) {
                            bestText = shortest;
                        }
                    }
                    if (!bestText) return; // skip this label entirely
                    const tw = ctx.measureText(bestText).width;
                    // Center within the band, but do not overlap previous label
                    let px = c.centerX - tw / 2;
                    if (px < prevRight + gap) px = prevRight + gap;
                    if (px + tw > chartArea.right) px = chartArea.right - tw;
                    prevRight = px + tw;
                    placed.push({ ...c, labelText: bestText, textX: px + tw / 2 });
                });
                const lastIdx = placed.length - 1;
                placed.forEach((c, i) => {
                    const partyColor = c.gov.party === 'R' ? '#C0392B' : '#2563EB';
                    ctx.fillStyle = partyColor;
                    ctx.textBaseline = 'top';
                    // Right-align the last governor label if it would clip
                    if (i === lastIdx) {
                        const tw = ctx.measureText(c.labelText).width;
                        if (c.textX + tw / 2 > chartArea.right) {
                            ctx.textAlign = 'right';
                            ctx.fillText(c.labelText, Math.min(c.centerX, chartArea.right - 5), pillY + 3);
                        } else {
                            ctx.textAlign = 'center';
                            ctx.fillText(c.labelText, c.textX, pillY + 3);
                        }
                    } else {
                        ctx.textAlign = 'center';
                        ctx.fillText(c.labelText, c.textX, pillY + 3);
                    }
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
                borderDash: [10, 5],
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
    createRankingsChart(canvas, stateValues, goodDirection, unit) {
        const ctx = canvas.getContext('2d');
        const existingChart = Chart.getChart(canvas);
        if (existingChart) existingChart.destroy();

        const labels = stateValues.map(s => s.state);
        const values = stateValues.map(s => s.value);
        // Dynamic height: 22px per bar, minimum 500px
        const barHeight = 22;
        const chartHeight = Math.max(500, stateValues.length * barHeight);
        canvas.style.height = chartHeight + 'px';
        canvas.parentElement.style.height = chartHeight + 'px';

        // Rankings values are pre-converted to display scale, so never multiply % by 100
        const fmt = (v, u) => this.formatValue(v, u, false);
        const lerp = this.lerp;
        const n = stateValues.length;

        // Uniform bar color; Hawaii stays teal
        const otherColor = '#A0A5AD';
        const bgColors = stateValues.map(s =>
            this.isHawaii(s.state) ? this.HAWAII_BLUE : otherColor
        );
        const borderColors = stateValues.map(s =>
            this.isHawaii(s.state) ? '#0D7C8F' : 'transparent'
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
        const hawaiiIdx = labels.findIndex(l => this.isHawaii(l));

        // 3 evenly spaced x-axis ticks: start, middle, end
        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);
        const range = maxVal - minVal;
        // Nice rounding helper
        const niceRound = (v, step) => Math.round(v / step) * step;
        // Pick rounding step based on range
        const mag = Math.pow(10, Math.floor(Math.log10(Math.max(range, 1))));
        const roundStep = mag >= range / 2 ? mag / 5 : mag / 2;
        const xStart = minVal <= 0 ? niceRound(minVal, roundStep) : Math.max(0, niceRound(minVal - range * 0.05, roundStep));
        const xEnd = niceRound(maxVal + range * 0.05, roundStep);
        const xMid = niceRound((xStart + xEnd) / 2, roundStep);
        const xTicks = [xStart, xMid, xEnd];

        // Smooth background gradient plugin
        const rowBgPlugin = {
            id: 'rowBackground',
            beforeDatasetsDraw(chart) {
                const { ctx, chartArea } = chart;
                const { top, bottom, left, right } = chartArea;
                ctx.save();
                const grad = ctx.createLinearGradient(0, top, 0, bottom);
                grad.addColorStop(0, `rgba(34,197,94,0.55)`);
                grad.addColorStop(0.5, `rgba(255,255,255,0.0)`);
                grad.addColorStop(1, `rgba(239,68,68,0.55)`);
                ctx.fillStyle = grad;
                ctx.fillRect(left, top, right - left, bottom - top);
                ctx.restore();
            }
        };

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
                layout: { padding: { right: 10 } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => fmt(ctx.raw, unit)
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        min: xTicks[0],
                        max: xTicks[2],
                        afterBuildTicks(axis) {
                            axis.ticks = xTicks.map(v => ({ value: v }));
                        },
                        grid: {
                            display: true,
                            color: 'rgba(0,0,0,0.12)',
                            borderDash: [4, 3],
                            drawTicks: false,
                            drawOnChartArea: true,
                            lineWidth: 1,
                        },
                        border: { display: false },
                        ticks: {
                            font: { size: 10, family: "'Inter', sans-serif" },
                            color: '#aaa',
                            callback: (v) => fmt(v, unit),
                        },
                    },
                    y: {
                        grid: { display: false },
                        ticks: {
                            font: (ctx) => ({
                                size: 11,
                                family: "'Inter', sans-serif",
                                weight: self.isHawaii(ctx.tick?.label) ? 'bold' : 'normal',
                            }),
                            color: (ctx) => {
                                return self.isHawaii(ctx.tick?.label)
                                    ? self.HAWAII_BLUE : '#555';
                            },
                        }
                    }
                },
                animation: { duration: 400 }
            },
            plugins: [rowBgPlugin, {
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
                        // Place label after bar, but clamp inside chart area
                        let x = barEnd + 6;
                        if (x + textW > chartArea.right - 2) {
                            x = barEnd - textW - 6;
                            ctx.fillStyle = '#fff';
                        } else {
                            ctx.fillStyle = '#555';
                        }
                        ctx.fillText(label, x, meta.y);
                    });
                    ctx.restore();
                }
            }]
        });
    }
};
