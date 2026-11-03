// ============================================================
// Unit tests for worker-mcp.mjs: the /mcp server for AI assistants.
// Run with: node --test mcp.test.js  (Node 20+)
//
// env.ASSETS is stubbed from the committed json/ files, so the tests
// exercise the same data the deployed worker serves.
// ============================================================

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://hawaiidashboard.org';
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'json', 'catalog.json'), 'utf8'));
const detail = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'json', `${id}.json`), 'utf8'));

const env = {
    ASSETS: {
        fetch: async (req) => {
            const file = path.join(ROOT, new URL(req.url).pathname);
            if (!fs.existsSync(file)) return new Response('not found', { status: 404 });
            return new Response(fs.readFileSync(file), { status: 200 });
        },
    },
};

let handleMcp;
before(async () => { ({ handleMcp } = await import('../worker-mcp.mjs')); });

const post = (body, headers = {}) => new Request(`${ORIGIN}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
});
const rpc = (method, params, id = 1) => ({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });
const call = async (name, args = {}) => (await (await handleMcp(post(rpc('tools/call', { name, arguments: args })), env)).json()).result;
const text = async (name, args) => (await call(name, args)).content[0].text;

describe('protocol', () => {
    it('OPTIONS preflight returns 204 with CORS', async () => {
        const res = await handleMcp(new Request(`${ORIGIN}/mcp`, { method: 'OPTIONS' }), env);
        assert.equal(res.status, 204);
        assert.equal(res.headers.get('access-control-allow-origin'), '*');
    });

    it('GET returns 405 with Allow', async () => {
        const res = await handleMcp(new Request(`${ORIGIN}/mcp`, { method: 'GET' }), env);
        assert.equal(res.status, 405);
        assert.equal(res.headers.get('allow'), 'POST, OPTIONS');
    });

    it('legacy initialize echoes a supported version, no session header', async () => {
        const res = await handleMcp(post(rpc('initialize', {
            protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' },
        })), env);
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('mcp-session-id'), null);
        const j = await res.json();
        assert.equal(j.result.protocolVersion, '2025-06-18');
        assert.ok(j.result.capabilities.tools);
        assert.equal(j.result.serverInfo.name, 'org.hawaiidashboard/data');
        assert.ok(j.result.instructions.includes('hawaiidashboard.org'));
    });

    it('initialize with an unknown version falls back to 2025-06-18', async () => {
        const j = await (await handleMcp(post(rpc('initialize', { protocolVersion: '1900-01-01' })), env)).json();
        assert.equal(j.result.protocolVersion, '2025-06-18');
    });

    it('notifications/initialized returns 202 with empty body', async () => {
        const res = await handleMcp(post({ jsonrpc: '2.0', method: 'notifications/initialized' }), env);
        assert.equal(res.status, 202);
        assert.equal(await res.text(), '');
    });

    it('ping returns empty result with no-store, nosniff and CORS', async () => {
        const res = await handleMcp(post(rpc('ping')), env);
        assert.deepEqual((await res.json()).result, {});
        assert.equal(res.headers.get('cache-control'), 'no-store');
        assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(res.headers.get('access-control-allow-origin'), '*');
    });

    it('tools/list returns the 4 read-only tools with schemas', async () => {
        const j = await (await handleMcp(post(rpc('tools/list')), env)).json();
        assert.deepEqual(j.result.tools.map((t) => t.name), ['list_metrics', 'get_metric', 'compare', 'rankings']);
        for (const t of j.result.tools) {
            assert.ok(t.inputSchema, `${t.name} has inputSchema`);
            assert.equal(t.annotations.readOnlyHint, true);
        }
    });

    it('unknown method (legacy) returns 200 with -32601', async () => {
        const res = await handleMcp(post(rpc('resources/list')), env);
        assert.equal(res.status, 200);
        assert.equal((await res.json()).error.code, -32601);
    });

    it('batch and non-JSON bodies are rejected', async () => {
        const batch = await handleMcp(post([rpc('ping', undefined, 1), rpc('ping', undefined, 2)]), env);
        assert.equal(batch.status, 400);
        assert.equal((await batch.json()).error.code, -32600);
        const junk = await handleMcp(new Request(`${ORIGIN}/mcp`, { method: 'POST', body: 'not json' }), env);
        assert.equal((await junk.json()).error.code, -32700);
    });
});

describe('modern era (2026-07-28)', () => {
    const META = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' };
    const H = (method) => ({ 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': method });

    it('server/discover returns supportedVersions incl 2026-07-28 and 2025-03-26', async () => {
        const res = await handleMcp(post(rpc('server/discover', { _meta: META }), H('server/discover')), env);
        const j = await res.json();
        assert.equal(j.result.resultType, 'complete');
        assert.ok(j.result.supportedVersions.includes('2026-07-28'));
        assert.ok(j.result.supportedVersions.includes('2025-03-26'));
        assert.ok(j.result._meta['io.modelcontextprotocol/serverInfo'].name);
    });

    it('mismatched Mcp-Method is 400 / -32020', async () => {
        const res = await handleMcp(post(rpc('tools/list', { _meta: META }), H('tools/call')), env);
        assert.equal(res.status, 400);
        assert.equal((await res.json()).error.code, -32020);
    });

    it('tools/call validates Mcp-Name against params.name', async () => {
        const body = rpc('tools/call', { _meta: META, name: 'compare', arguments: { id: 'uninsured_rate' } });
        assert.equal((await handleMcp(post(body, { ...H('tools/call'), 'Mcp-Name': 'compare' }), env)).status, 200);
        assert.equal((await handleMcp(post(body, { ...H('tools/call'), 'Mcp-Name': 'other' }), env)).status, 400);
    });

    it('unsupported protocol version is 400 / -32022 with the supported list', async () => {
        const res = await handleMcp(post(rpc('tools/list', {
            _meta: { 'io.modelcontextprotocol/protocolVersion': '1900-01-01' },
        }), { 'MCP-Protocol-Version': '1900-01-01', 'Mcp-Method': 'tools/list' }), env);
        assert.equal(res.status, 400);
        const j = await res.json();
        assert.equal(j.error.code, -32022);
        assert.ok(j.error.data.supported.includes('2026-07-28'));
    });

    it('unknown method returns 404 with -32601', async () => {
        const res = await handleMcp(post(rpc('subscriptions/listen', { _meta: META }), H('subscriptions/listen')), env);
        assert.equal(res.status, 404);
        assert.equal((await res.json()).error.code, -32601);
    });

    it('header/body protocol version mismatch is 400 / -32020', async () => {
        const res = await handleMcp(post(rpc('tools/list', { _meta: META }),
            { 'MCP-Protocol-Version': '2025-06-18', 'Mcp-Method': 'tools/list' }), env);
        assert.equal(res.status, 400);
        assert.equal((await res.json()).error.code, -32020);
    });
});

describe('tools', () => {
    it('list_metrics lists every catalog metric with its page URL', async () => {
        const t = await text('list_metrics');
        // Counted from the catalog, so adding a metric can't leave this test stale.
        assert.equal((t.match(/^- /gm) || []).length, catalog.metrics.length);
        for (const m of catalog.metrics) assert.ok(t.includes(`(id: ${m.id})`) && t.includes(m.page_url), m.id);
    });

    it('every reply quotes the same value, year and rank as the catalog (and so the /c/ page)', async () => {
        // Gate 11 ties the catalog to the /c/ page titles; this ties the MCP text to the catalog.
        for (const m of catalog.metrics) {
            const h = m.hawaii;
            const line = `Hawaiʻi ${h.display} in ${h.year}, #${h.rank} of ${h.of} states`;
            for (const tool of ['get_metric', 'compare', 'rankings']) {
                const t = await text(tool, { id: m.id });
                assert.ok(t.includes(line), `${tool} ${m.id}: expected "${line}"`);
                assert.ok(t.includes(m.page_url) && t.includes('Cite as:'), `${tool} ${m.id}: page URL + cite line`);
            }
        }
    });

    it('rankings lists all states with Hawaiʻi at its catalog rank', async () => {
        const t = await text('rankings', { id: 'pcp_per_100k' });
        const m = catalog.metrics.find((x) => x.id === 'pcp_per_100k');
        assert.equal((t.match(/^ {2}#\d+ /gm) || []).length, detail('pcp_per_100k').rankings.states.length);
        // pcp is FIPS-keyed and stores 'Hawaii'; the JSON normalizes it.
        assert.ok(t.includes(`#${m.hawaii.rank}  Hawaiʻi  ${m.hawaii.display}`));
    });

    it('compare finds named states by name, okina-free spelling or postal code', async () => {
        const t = await text('compare', { id: 'uninsured_rate', states: ['ak', 'California', 'Hawaii', 'Atlantis'] });
        const st = detail('uninsured_rate').rankings.states;
        for (const name of ['Alaska', 'California', 'Hawaiʻi']) {
            const s = st.find((x) => x.state === name);
            assert.ok(t.includes(`#${s.rank}  ${name}  ${s.display}`), name);
        }
        assert.ok(t.includes("'Atlantis': no value"));
        assert.ok(t.includes('Best five') && t.includes('Worst five'));
    });

    it('get_metric shows the median next to each year and the county values', async () => {
        const d = detail('renter_cost_burden_pct');
        const t = await text('get_metric', { id: 'renter_cost_burden_pct', year_from: 2020 });
        const last = d.hawaii_series[d.hawaii_series.length - 1];
        const med = d.median_series.find((r) => r.year === last.year);
        assert.ok(t.includes(`${last.year}  ${last.display}  ${med.display}`));
        assert.ok(!/^ {2}2019 /m.test(t), 'year_from filter applied');
        assert.ok(t.includes(`Counties, ${d.counties.year}: Honolulu ${d.counties.display.Honolulu}`));
        assert.ok(t.includes('county table'));
    });

    it('footer promises a county table only where one exists', async () => {
        const t = await text('get_metric', { id: 'violent_crime_rate' });
        assert.equal(detail('violent_crime_rate').counties, null);
        assert.ok(!t.includes('county table') && !t.includes('Counties,'));
    });

    it('an empty year filter says so instead of dropping the series', async () => {
        const t = await text('get_metric', { id: 'uninsured_rate', year_from: 2999 });
        assert.ok(t.includes('No Hawaiʻi values from 2999 on. Years available:'));
    });

    it('traversal-shaped id is a tool error listing valid ids, no throw', async () => {
        const res = await handleMcp(post(rpc('tools/call', { name: 'get_metric', arguments: { id: '../etc' } })), env);
        assert.equal(res.status, 200);
        const r = (await res.json()).result;
        assert.equal(r.isError, true);
        assert.ok(r.content[0].text.includes('Valid ids:'));
    });

    it('unknown tool name is a tool error listing the tools', async () => {
        const r = await call('drop_tables');
        assert.equal(r.isError, true);
        assert.ok(r.content[0].text.includes('list_metrics, get_metric, compare, rankings'));
    });

    it('missing data files are a tool error, not a 500', async () => {
        const empty = { ASSETS: { fetch: async () => new Response('', { status: 404 }) } };
        const res = await handleMcp(post(rpc('tools/call', { name: 'list_metrics', arguments: {} })), empty);
        assert.equal(res.status, 200);
        assert.equal((await res.json()).result.isError, true);
    });
});
