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
        const badColor = `rgba(220, 38, 38, ${fillAlpha.toFixed(2)})`;

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

                    // Governor name in party color (no background)
                    const centerX = (left + right) / 2;
                    const partyColor = gov.party === 'R' ? '#DC2626' : '#2563EB';
                    const labelText = `${gov.name} (${gov.party})`;
                    ctx.font = '600 11px "Inter", sans-serif';
                    ctx.fillStyle = partyColor;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillText(labelText, centerX, chartArea.top + 4);
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
        const detailBad = `rgba(220, 38, 38, ${alpha.toFixed(2)})`;

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
            default:
                if (Math.abs(value) >= 1000) {
                    return Math.round(value).toLocaleString();
                }
                return value.toFixed(1);
        }
    }
};
