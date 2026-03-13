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
    AVG_GRAY: '#666666',
    AVG_GRAY_BG: 'rgba(102, 102, 102, 0.06)',
    GREEN_BEST: [5, 150, 105],
    RED_WORST: [192, 57, 43],
    NEUTRAL_RANGE: [23, 27],

    /** Linear interpolation, rounded to integer */
    lerp(a, b, t) { return Math.round(a + (b - a) * t); },

    /** Check if a state name is Hawaii (handles ʻokina variant) */
    isHawaii(name) { return name === 'Hawaii' || name === 'Hawai\u02BBi'; },

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
                        // Ensure gap between lines fills most of chart height
                        min: (() => {
                            const range = dataMax - dataMin;
                            const gap = Math.abs(latestHI - latestAvg);
                            // The gap should occupy ~50% of visible chart
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

        // Governor term labels - text only, no background bands
        const governorPlugin = {
            id: 'governorLabels',
            beforeDraw(chart) {
                if (!govBoxes || govBoxes.length === 0) return;

                const { ctx, chartArea, scales } = chart;
                const xScale = scales.x;

                ctx.save();
                govBoxes.forEach(gov => {
                    const step = labels.length > 1
                        ? (xScale.getPixelForValue(1) - xScale.getPixelForValue(0))
                        : 0;
                    const x1 = xScale.getPixelForValue(gov.startIdx) - step * 0.5;
                    const x2 = xScale.getPixelForValue(gov.endIdx) + step * 0.5;
                    const left = Math.max(x1, chartArea.left);
                    const right = Math.min(x2, chartArea.right);

                    // Thin vertical line at term boundary
                    if (left > chartArea.left + 2) {
                        ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
                        ctx.lineWidth = 1;
                        ctx.setLineDash([4, 4]);
                        ctx.beginPath();
                        ctx.moveTo(left, chartArea.top);
                        ctx.lineTo(left, chartArea.bottom);
                        ctx.stroke();
                        ctx.setLineDash([]);
                    }

                    // Governor name in party color — pick label that fits
                    const segWidth = right - left;
                    const partyColor = gov.party === 'R' ? '#C0392B' : '#2563EB';
                    const fullLabel = `${gov.name} (${gov.party})`;
                    const shortLabel = gov.name;
                    ctx.font = '600 12px "Inter", sans-serif';
                    const fullW = ctx.measureText(fullLabel).width;
                    const shortW = ctx.measureText(shortLabel).width;
                    let labelText = null;
                    if (fullW + 10 <= segWidth) labelText = fullLabel;
                    else if (shortW + 6 <= segWidth) labelText = shortLabel;
                    if (labelText) {
                        const centerX = (left + right) / 2;
                        const textW = ctx.measureText(labelText).width;
                        // Background pill for readability
                        const pillPad = 4;
                        const pillH = 16;
                        const pillY = chartArea.top + 2;
                        ctx.fillStyle = 'rgba(255,255,255,0.85)';
                        const px = centerX - textW/2 - pillPad;
                        const pw = textW + pillPad*2;
                        if (ctx.roundRect) {
                            ctx.beginPath();
                            ctx.roundRect(px, pillY, pw, pillH, 3);
                            ctx.fill();
                        } else {
                            ctx.fillRect(px, pillY, pw, pillH);
                        }
                        ctx.fillStyle = partyColor;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'top';
                        ctx.fillText(labelText, centerX, pillY + 2);
                    }
                });
                ctx.restore();
            }
        };

        // Same gap-scaled fill as sparklines
        const goodDir = data.goodDirection;
        const latestHI = hawaiiValues.filter(v => v !== null).pop() || 0;
        const latestAvgVal = avgValues.filter(v => v !== null).pop() || 0;
        const mid = (Math.abs(latestHI) + Math.abs(latestAvgVal)) / 2 || 1;
        const gap = Math.abs(latestHI - latestAvgVal) / mid;
        const alpha = Math.min(0.45, 0.10 + gap * 0.55);
        const detailGood = `rgba(5, 150, 105, ${alpha.toFixed(2)})`;
        const detailBad = `rgba(192, 57, 43, ${alpha.toFixed(2)})`;

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
                        pointRadius: hawaiiValues.map(v => v === null ? 0 : 4),
                        pointHoverRadius: 6,
                        pointBackgroundColor: this.HAWAII_BLUE,
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        spanGaps: true,
                    },
                    {
                        label: 'Other State Avg',
                        data: avgValues,
                        borderColor: this.AVG_GRAY,
                        backgroundColor: this.AVG_GRAY_BG,
                        borderWidth: 2,
                        borderDash: [6, 4],
                        fill: false,
                        tension: 0.3,
                        pointRadius: avgValues.map(v => v === null ? 0 : 3),
                        pointHoverRadius: 5,
                        pointBackgroundColor: this.AVG_GRAY,
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        spanGaps: true,
                    }
                ]
            },
            plugins: [governorPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: {
                            usePointStyle: true,
                            pointStyle: 'circle',
                            padding: 16,
                            font: { size: 12, weight: '500' },
                            color: '#555555',
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
                                return `${context.dataset.label}: ${ChartUtils.formatValue(val, data.unit)}`;
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

    /**
     * Format a value based on its unit type
     */
    formatValue(value, unit) {
        if (value === null || value === undefined || isNaN(value)) return 'N/A';

        switch (unit) {
            case '$':
                return '$' + Math.round(value).toLocaleString();
            case '%':
                // Values might be stored as decimals (0.028) or whole (86)
                if (Math.abs(value) < 1 && Math.abs(value) > 0) {
                    return (value * 100).toFixed(1) + '%';
                }
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
            default:
                if (Math.abs(value) >= 1000) {
                    return Math.round(value).toLocaleString();
                }
                return value.toFixed(1);
        }
    },

    /**
     * Format for display on cards (shorter)
     */
    formatCardValue(value, unit) {
        if (value === null || value === undefined || isNaN(value)) return 'N/A';

        switch (unit) {
            case '$':
                if (value >= 1000) {
                    return '$' + (value / 1000).toFixed(0) + 'K';
                }
                return '$' + Math.round(value);
            case '%':
                if (Math.abs(value) < 1 && Math.abs(value) > 0) {
                    return (value * 100).toFixed(1) + '%';
                }
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
            default:
                if (Math.abs(value) >= 1000) {
                    return Math.round(value).toLocaleString();
                }
                return value.toFixed(1);
        }
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

        const fmt = this.formatValue.bind(this);
        const lerp = this.lerp;
        const n = stateValues.length;

        // Uniform bar color; Hawaii stays teal
        const otherColor = '#A0A5AD';
        const bgColors = stateValues.map(s =>
            this.isHawaii(s.state) ? this.HAWAII_BLUE : otherColor
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
                grad.addColorStop(0, `rgba(${gr},${gg},${gb},0.18)`);
                grad.addColorStop(neutralStartPct, `rgba(${gr},${gg},${gb},0.04)`);
                grad.addColorStop((neutralStartPct + neutralEndPct) / 2, 'rgba(255,255,255,0)');
                grad.addColorStop(neutralEndPct, `rgba(${rr},${rg},${rb},0.04)`);
                grad.addColorStop(1, `rgba(${rr},${rg},${rb},0.16)`);
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
                    borderWidth: 0,
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
