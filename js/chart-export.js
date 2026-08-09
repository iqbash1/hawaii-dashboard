// ============================================================
// Hawaii Dashboard - Chart Export Module
//
// Downloads the active modal chart as a high-resolution PNG, framed
// with the metric's name, unit label and official definition so the
// image is self-describing once it leaves the site (a bare chart of
// "15.5%" tells a reader nothing about 15.5% of what).
//
// Depends on: App (getActiveMetricData, getLatestValue), Modal
//             (_activeTab + the four live chart instances),
//             ChartUtils (formatValue), Chart (already loaded).
// ============================================================

const ChartExport = {
    // Fixed export geometry, independent of the reader's viewport: on a
    // phone the live canvas is ~340px wide, and exporting that would hand
    // mobile readers an unusable image.
    WIDTH: 1400,
    SCALE: 3,
    PAD: 48,

    COLORS: {
        bg: '#FFFFFF',
        text: '#333333',
        muted: '#555555',
        teal: '#0C7081',
        rule: '#EAEAEA',
    },

    // Which live Chart instance backs each tab, the label that tells the
    // reader which view they are looking at, and who the headline value
    // describes. The county chart carries a line for Hawaiʻi County, so a
    // bare "Hawaiʻi:" there would read as the Big Island.
    TABS: {
        'detail': { chart: 'detailChart', label: 'Performance over time', height: 620 },
        'rankings': { chart: 'rankingsChart', label: 'How Hawaiʻi compares', height: null },
        'rank-history': { chart: 'rankHistoryChart', label: 'Rank over time', height: 620 },
        'county': { chart: 'countyChart', label: 'How counties compare', height: 620, subject: 'Hawaiʻi statewide' },
    },

    font(size, weight) {
        return `${weight || 400} ${size}px Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    },

    /**
     * Build and download the PNG for whichever chart is on screen.
     *
     * With no options this reads the modal's own state. The QOTD proof
     * view renders its chart outside the modal, so it passes its tab and
     * Chart instance explicitly.
     *
     * @param {string} slug - Metric ID
     * @param {{tab?: string, chart?: Chart}} [opts]
     */
    async download(slug, opts) {
        const o = opts || {};
        const tab = o.tab || (typeof Modal !== 'undefined' && Modal._activeTab) || 'detail';
        const spec = this.TABS[tab];
        if (!spec) return;
        const live = o.chart || (typeof Modal !== 'undefined' && Modal[spec.chart]);
        if (!live) return;

        const meta = App.getActiveMetricData(slug);
        // Inter arrives from Google Fonts; without this the first export
        // after a cold load falls back to the system sans.
        if (document.fonts && document.fonts.ready) await document.fonts.ready;

        const chartImg = await this.renderChart(live, spec.height);
        const canvas = this.compose(chartImg, meta, slug, spec);
        this.save(canvas, `hawaii-dashboard-${slug}-${tab}.png`);
    },

    /**
     * Re-render a live chart offscreen at export resolution.
     *
     * Clones the live config rather than re-invoking the ChartUtils
     * creator, so whatever the reader chose (comparator, threshold
     * variant, county set) comes along untouched. Datasets are shallow
     * copied so the two instances never share mutable dataset state;
     * the inline plugins are stateless draw hooks and are reused as is.
     *
     * @param {Chart} live       - the on-screen Chart instance
     * @param {?number} height   - export height, or null to keep the live one
     * @returns {Promise<Image>}
     */
    renderChart(live, height) {
        const cfg = live.config;
        const h = height || parseInt(live.canvas.style.height, 10) || 620;
        const w = this.WIDTH - this.PAD * 2;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:-99999px;top:0;';
        host.appendChild(canvas);
        document.body.appendChild(host);

        const clone = new Chart(canvas, {
            type: cfg.type,
            data: { ...cfg.data, datasets: cfg.data.datasets.map((d) => ({ ...d })) },
            options: {
                ...cfg.options,
                responsive: false,
                maintainAspectRatio: false,
                animation: false,
                devicePixelRatio: this.SCALE,
            },
            plugins: cfg.plugins,
        });

        const url = clone.toBase64Image('image/png', 1);
        clone.destroy();
        host.remove();

        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.src = url;
        });
    },

    /**
     * Draw the framed card: definition header, chart, attribution footer.
     * @returns {HTMLCanvasElement}
     */
    compose(chartImg, meta, slug, spec) {
        const S = this.SCALE, PAD = this.PAD, W = this.WIDTH;
        const inner = W - PAD * 2;
        const chartH = chartImg.height / S;

        // Measure the wrapped definition first so the canvas is sized to fit.
        const probe = document.createElement('canvas').getContext('2d');
        probe.font = this.font(16);
        const defLines = meta.officialName ? this.wrap(probe, meta.officialName, inner) : [];

        const headerH = 30 + 46 + 32 + (defLines.length ? defLines.length * 23 + 10 : 0) + 26;
        const footerH = 58;
        const H = PAD + headerH + chartH + footerH + PAD;

        const canvas = document.createElement('canvas');
        canvas.width = W * S;
        canvas.height = H * S;
        const ctx = canvas.getContext('2d');
        ctx.scale(S, S);

        // Opaque background: Chart.js canvases are transparent, and a
        // transparent PNG dropped into a dark slide deck is unreadable.
        ctx.fillStyle = this.COLORS.bg;
        ctx.fillRect(0, 0, W, H);

        let y = PAD;
        ctx.textBaseline = 'alphabetic';

        // Eyebrow: area · which chart this is
        ctx.font = this.font(13, 600);
        ctx.fillStyle = this.COLORS.teal;
        ctx.fillText(`${(meta.area || '').toUpperCase()}  ·  ${spec.label.toUpperCase()}`, PAD, y + 14);
        y += 30;

        // Metric name
        ctx.font = this.font(34, 700);
        ctx.fillStyle = this.COLORS.text;
        ctx.fillText(meta.metric || slug, PAD, y + 32);
        y += 46;

        // The "% of what" line: Hawaiʻi's latest value in the metric's own
        // words. unitLabel comes from getActiveMetricData, so a metric with
        // threshold variants reports the variant actually on screen.
        ctx.font = this.font(20, 500);
        ctx.fillStyle = this.COLORS.text;
        ctx.fillText(this.valueLine(meta, slug, spec.subject || 'Hawaiʻi'), PAD, y + 20);
        y += 32;

        // Full definition
        if (defLines.length) {
            ctx.font = this.font(16);
            ctx.fillStyle = this.COLORS.muted;
            defLines.forEach((line, i) => ctx.fillText(line, PAD, y + 16 + i * 23));
            y += defLines.length * 23 + 10;
        }

        y += 12;
        this.rule(ctx, PAD, y, W - PAD);
        y += 14;

        ctx.drawImage(chartImg, PAD, y, inner, chartH);
        y += chartH + 20;

        this.rule(ctx, PAD, y, W - PAD);
        y += 26;

        ctx.font = this.font(14);
        ctx.fillStyle = this.COLORS.muted;
        ctx.fillText(`Source: ${meta.source || ''}`, PAD, y);
        ctx.font = this.font(14, 600);
        ctx.fillStyle = this.COLORS.teal;
        ctx.textAlign = 'right';
        ctx.fillText('hawaiidashboard.org', W - PAD, y);
        ctx.textAlign = 'left';

        return canvas;
    },

    /** "Hawaiʻi: 15.5% of road miles rated poor · 2024" */
    valueLine(meta, slug, subject) {
        const zeroOk = typeof ZERO_IS_VALID !== 'undefined' && ZERO_IS_VALID.has(slug);
        const latest = App.getLatestValue(meta.hawaii, zeroOk);
        if (!latest || latest.value == null) return meta.unitLabel || '';
        // Some % metrics store the Hawaiʻi series as decimals (0.1547) even
        // though the ranked cross-section is already percent-scaled.
        const val = ChartUtils.formatValue(latest.value, meta.unit, ChartUtils.isDecimalPctMetric(meta));
        const label = meta.unitLabel ? ` ${meta.unitLabel}` : '';
        return `${subject}: ${val}${label}  ·  ${App.keyEnd(latest.year)}`;
    },

    wrap(ctx, text, maxWidth) {
        const lines = [];
        let line = '';
        for (const word of text.split(' ')) {
            const next = line ? `${line} ${word}` : word;
            if (ctx.measureText(next).width > maxWidth && line) {
                lines.push(line);
                line = word;
            } else {
                line = next;
            }
        }
        if (line) lines.push(line);
        return lines;
    },

    rule(ctx, x1, y, x2) {
        ctx.strokeStyle = this.COLORS.rule;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x1, y + 0.5);
        ctx.lineTo(x2, y + 0.5);
        ctx.stroke();
    },

    save(canvas, filename) {
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/png');
        link.click();
    },
};
