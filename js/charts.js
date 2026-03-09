// ============================================================
// Hawai'i State Government Dashboard — Chart Rendering
// Uses Chart.js v4
// ============================================================

const ChartUtils = {
    // Color constants — GUILD brand palette
    HAWAII_BLUE: '#d03135',
    HAWAII_BLUE_BG: 'rgba(208, 49, 53, 0.08)',
    AVG_GRAY: '#666666',
    AVG_GRAY_BG: 'rgba(102, 102, 102, 0.06)',
    POSITIVE: '#059669',
    NEGATIVE: '#DC2626',

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

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        data: values,
                        spanGaps: true,
                        borderColor: this.HAWAII_BLUE,
                        backgroundColor: this.HAWAII_BLUE_BG,
                        borderWidth: 2,
                        fill: true,
                        tension: 0.3,
                        pointRadius: 0,
                        pointHoverRadius: 0,
                    },
                    {
                        data: avgValues.length > 0 ? avgValues : undefined,
                        borderColor: this.AVG_GRAY,
                        borderWidth: 1,
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
                    x: { display: false },
                    y: { display: false },
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

        // Build governor background bands as a custom plugin
        const governorPlugin = {
            id: 'governorBands',
            beforeDraw(chart) {
                if (!govBoxes || govBoxes.length === 0) return;

                const { ctx, chartArea, scales } = chart;
                const xScale = scales.x;

                ctx.save();
                govBoxes.forEach(gov => {
                    // Calculate pixel positions — extend half a step beyond each edge
                    const step = labels.length > 1
                        ? (xScale.getPixelForValue(1) - xScale.getPixelForValue(0))
                        : 0;
                    const x1 = xScale.getPixelForValue(gov.startIdx) - step * 0.5;
                    const x2 = xScale.getPixelForValue(gov.endIdx) + step * 0.5;

                    // Clamp to chart area
                    const left = Math.max(x1, chartArea.left);
                    const right = Math.min(x2, chartArea.right);

                    // Draw background band — strong enough to clearly distinguish terms
                    const bgColor = gov.party === 'R'
                        ? 'rgba(220, 38, 38, 0.10)'
                        : 'rgba(37, 99, 235, 0.08)';
                    ctx.fillStyle = bgColor;
                    ctx.fillRect(left, chartArea.top, right - left, chartArea.bottom - chartArea.top);

                    // Draw solid border at term boundaries (not at chart edges)
                    if (left > chartArea.left + 2) {
                        ctx.strokeStyle = gov.party === 'R'
                            ? 'rgba(220, 38, 38, 0.5)'
                            : 'rgba(37, 99, 235, 0.5)';
                        ctx.lineWidth = 1.5;
                        ctx.setLineDash([]);
                        ctx.beginPath();
                        ctx.moveTo(left, chartArea.top);
                        ctx.lineTo(left, chartArea.bottom);
                        ctx.stroke();
                    }

                    // Draw governor name label at top of band — bold and clear
                    const centerX = (left + right) / 2;
                    const partyColor = gov.party === 'R' ? '#DC2626' : '#2563EB';

                    // Label background pill for readability
                    const labelText = `Gov. ${gov.name} (${gov.party})`;
                    ctx.font = '700 11px "Open Sans", sans-serif';
                    const textWidth = ctx.measureText(labelText).width;
                    const pillPadX = 6;
                    const pillPadY = 3;
                    const pillY = chartArea.top + 4;
                    const pillHeight = 16;

                    ctx.fillStyle = gov.party === 'R'
                        ? 'rgba(220, 38, 38, 0.12)'
                        : 'rgba(37, 99, 235, 0.10)';
                    ctx.fillRect(
                        centerX - textWidth / 2 - pillPadX,
                        pillY,
                        textWidth + pillPadX * 2,
                        pillHeight
                    );

                    ctx.fillStyle = partyColor;
                    ctx.globalAlpha = 1;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillText(labelText, centerX, pillY + pillPadY);
                });
                ctx.restore();
            }
        };

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: "Hawai'i",
                        data: hawaiiValues,
                        borderColor: this.HAWAII_BLUE,
                        backgroundColor: this.HAWAII_BLUE_BG,
                        borderWidth: 3,
                        fill: true,
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
    },

    /**
     * Calculate trend info (compares last two non-null values)
     */
    getTrend(data, goodDirection) {
        // Filter out null/undefined/zero values
        const values = Object.values(data).filter(v => v !== null && v !== undefined && v !== 0);
        if (values.length < 2) return { direction: 'neutral', label: '--', class: 'neutral' };

        const latest = values[values.length - 1];
        const previous = values[values.length - 2];
        const change = latest - previous;
        const pctChange = previous !== 0 ? ((change / Math.abs(previous)) * 100) : 0;

        let isGood;
        if (goodDirection === 'up') {
            isGood = change >= 0;
        } else {
            isGood = change <= 0;
        }

        const arrow = change > 0 ? '\u2191' : change < 0 ? '\u2193' : '\u2192';
        const absChange = Math.abs(pctChange);
        let label;
        if (absChange < 0.1) {
            label = '\u2192 Flat';
        } else if (absChange > 100) {
            label = `${arrow} ${absChange.toFixed(0)}%`;
        } else {
            label = `${arrow} ${absChange.toFixed(1)}%`;
        }

        return {
            direction: isGood ? 'positive' : change === 0 ? 'neutral' : 'negative',
            label: label,
            class: isGood ? 'positive' : change === 0 ? 'neutral' : 'negative',
        };
    }
};
