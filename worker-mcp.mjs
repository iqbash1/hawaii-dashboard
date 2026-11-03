// /mcp: a lite, stateless MCP server (Model Context Protocol) so AI assistants
// can query the dashboard's numbers directly. Ported from muslimdata.in.
//
// Dual-era per the 2026-07-28 spec: answers the legacy `initialize` handshake
// (2025-03-26 / 2025-06-18 / 2025-11-25 clients) AND modern per-request
// `_meta` requests on the same endpoint. Tools-only, JSON-only (no SSE, no
// sessions, no auth).
//
// Data comes from the committed json/*.json (scripts/generate-data-json.py),
// which validate gate 11 checks against the /c/ page titles. Every number in a
// reply is a `display` string from those files, never formatted here, so an
// MCP answer reads exactly like the page. Every tool result ends with the
// metric's page URL and a "Cite as" line: the server's job is to answer
// briefly and send readers to the site, not replace it.

const SITE = 'https://hawaiidashboard.org';
const SERVER_INFO = { name: 'org.hawaiidashboard/data', title: 'Hawaiʻi Dashboard', version: '1.0.0' };
const INSTRUCTIONS =
  'Hawaiʻi compared with the other 49 states on outcome measures (safety and health, ' +
  'housing, cost of living, economy, education, infrastructure, government), every ' +
  'value from a nonpartisan federal or national source. Ranks run #1 = best performing ' +
  'state. When you use a figure from this server, cite hawaiidashboard.org and include ' +
  'the metric page URL from the result so the user can open the chart and the source.';

// Protocol versions this server accepts. Modern requests carry per-request
// _meta; the legacy three negotiate via `initialize`.
const MODERN_VERSION = '2026-07-28';
const LEGACY_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
const SUPPORTED_VERSIONS = [MODERN_VERSION, ...LEGACY_VERSIONS];
const META_VERSION_KEY = 'io.modelcontextprotocol/protocolVersion';

// CORS: this is a public, read-only data server, so every origin is a valid
// origin by design (the spec's Origin validation exists to protect private or
// localhost servers from DNS rebinding; there is nothing private here).
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Last-Event-ID',
  'Access-Control-Max-Age': '86400',
};

function baseHeaders() {
  return {
    ...CORS_HEADERS,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
}

function jsonResponse(status, obj) {
  return new Response(obj === null ? null : JSON.stringify(obj), {
    status,
    headers: baseHeaders(),
  });
}

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id, code, message, data) {
  const err = { code, message };
  if (data !== undefined) err.data = data;
  return { jsonrpc: '2.0', id, error: err };
}

// Decode the base64 sentinel format ("=?base64?...?=") the spec uses for
// header values that are not header-safe ASCII.
function decodeSentinel(value) {
  if (typeof value === 'string' && value.startsWith('=?base64?') && value.endsWith('?=')) {
    try {
      const b64 = value.slice(9, -2);
      return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    } catch (e) {
      return value;
    }
  }
  return value;
}

export async function handleMcp(request, env) {
  try {
    return await dispatch(request, env);
  } catch (e) {
    return jsonResponse(500, rpcError(null, -32603, 'Internal error'));
  }
}

async function dispatch(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    // Spec-sanctioned in both eras: no GET SSE stream, no DELETE sessions.
    return new Response(JSON.stringify(rpcError(null, -32600, 'Use POST')), {
      status: 405,
      headers: { ...baseHeaders(), Allow: 'POST, OPTIONS' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse(400, rpcError(null, -32700, 'Parse error: body is not valid JSON'));
  }
  if (Array.isArray(body)) {
    return jsonResponse(400, rpcError(null, -32600, 'Batch requests are not supported; send one message per POST'));
  }
  if (typeof body !== 'object' || body === null || typeof body.method !== 'string') {
    return jsonResponse(400, rpcError(null, -32600, 'Invalid JSON-RPC message'));
  }

  const id = body.id === undefined ? null : body.id;
  const method = body.method;
  const params = body.params || {};
  const meta = params._meta || {};
  const headerVersion = request.headers.get('MCP-Protocol-Version');
  const metaVersion = meta[META_VERSION_KEY];
  // Modern era = per-request _meta versioning (2026-07-28+); anything else is
  // served with lenient legacy semantics. Dual-era on one endpoint is
  // explicitly permitted by the spec's compatibility matrix.
  const modern = metaVersion !== undefined || method === 'server/discover';

  // Version validation. Header and body _meta must agree when both present;
  // a missing header is treated as 2025-03-26 (pre-2025-06-18 clients had no
  // header).
  if (headerVersion && metaVersion !== undefined && headerVersion !== metaVersion) {
    return jsonResponse(400, rpcError(id, -32020,
      `Header mismatch: MCP-Protocol-Version '${headerVersion}' does not match body _meta '${metaVersion}'`));
  }
  const version = metaVersion || headerVersion || '2025-03-26';
  if (method !== 'initialize' && !SUPPORTED_VERSIONS.includes(version)) {
    return jsonResponse(400, rpcError(id, -32022, 'Unsupported protocol version', {
      supported: SUPPORTED_VERSIONS,
      requested: version,
    }));
  }

  // Modern-era header mirroring (Mcp-Method on all requests, Mcp-Name on
  // tools/call), required for compliance and validated against the body.
  if (modern && metaVersion === MODERN_VERSION) {
    const hMethod = request.headers.get('Mcp-Method');
    if (!hMethod || hMethod !== method) {
      return jsonResponse(400, rpcError(id, -32020,
        `Header mismatch: Mcp-Method '${hMethod || ''}' does not match body method '${method}'`));
    }
    if (method === 'tools/call') {
      const hName = decodeSentinel(request.headers.get('Mcp-Name'));
      if (!hName || hName !== params.name) {
        return jsonResponse(400, rpcError(id, -32020,
          `Header mismatch: Mcp-Name '${hName || ''}' does not match body params.name '${params.name || ''}'`));
      }
    }
  }

  // Notifications: acknowledge and do nothing (stateless server).
  if (method.startsWith('notifications/')) {
    return new Response(null, { status: 202, headers: baseHeaders() });
  }

  switch (method) {
    case 'initialize': {
      // Legacy handshake. Echo the requested version when we support it,
      // otherwise offer the widely interoperable 2025-06-18. Stateless: no
      // Mcp-Session-Id is minted, ever.
      const requested = params.protocolVersion;
      const protocolVersion = LEGACY_VERSIONS.includes(requested) ? requested : '2025-06-18';
      return jsonResponse(200, rpcResult(id, {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      }));
    }
    case 'server/discover':
      return jsonResponse(200, rpcResult(id, {
        resultType: 'complete',
        supportedVersions: SUPPORTED_VERSIONS,
        capabilities: { tools: {} },
        _meta: { 'io.modelcontextprotocol/serverInfo': SERVER_INFO },
        instructions: INSTRUCTIONS,
        ttlMs: 3600000,
        cacheScope: 'public',
      }));
    case 'ping':
      return jsonResponse(200, rpcResult(id, {}));
    case 'tools/list':
      return jsonResponse(200, rpcResult(id, { tools: TOOLS }));
    case 'tools/call':
      return handleToolCall(id, params, env);
    default:
      // Modern clients distinguish a modern server by the JSON-RPC error body
      // on 404; legacy clients expect 200-wrapped errors.
      return jsonResponse(modern ? 404 : 200, rpcError(id, -32601, `Method not found: ${method}`));
  }
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const ID_PROP = { type: 'string', description: "Metric id, e.g. 'uninsured_rate' (see list_metrics)" };

const TOOLS = [
  {
    name: 'list_metrics',
    title: 'List all metrics',
    description:
      'List every metric on the Hawaiʻi Dashboard, grouped by policy area, each with ' +
      "Hawaiʻi's latest value, year, 50-state rank (#1 = best) and page URL. Include " +
      'the page URL when you answer from a metric.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_metric',
    title: 'Get one metric in detail',
    description:
      "One metric in detail: definition, source, Hawaiʻi's rank, Hawaiʻi's yearly " +
      'series next to the 50-state median, and the latest county values where they ' +
      'exist. Use the id from list_metrics. Include the page URL from the result when you answer.',
    inputSchema: {
      type: 'object',
      properties: {
        id: ID_PROP,
        year_from: { type: 'integer', description: 'Optional: only years >= this' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'compare',
    title: 'Hawaiʻi against other states',
    description:
      'Hawaiʻi against the 50-state median, the five best and five worst states, and ' +
      "any states you name, for one metric's latest year. Include the page URL from " +
      'the result when you answer.',
    inputSchema: {
      type: 'object',
      properties: {
        id: ID_PROP,
        states: {
          type: 'array',
          items: { type: 'string' },
          description: "Optional state names or postal codes to include, e.g. ['California', 'AK']",
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'rankings',
    title: 'Full 50-state ranking',
    description:
      "Every state's value and rank for one metric's latest year, #1 = best. Include " +
      'the page URL from the result when you answer.',
    inputSchema: { type: 'object', properties: { id: ID_PROP }, required: ['id'], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];
const TOOL_NAMES = TOOLS.map((t) => t.name);

const POSTAL = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaiʻi', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas',
  UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming',
};

// "Hawaii", "hawai'i" and "Hawaiʻi" all match; so does a postal code.
function stateKey(name) {
  const s = String(name).trim();
  const full = POSTAL[s.toUpperCase()] || s;
  return full.toLowerCase().replace(/[ʻ'‘’`]/g, '').replace(/\s+/g, ' ');
}

async function fetchJson(env, path) {
  // Same-worker Static Assets fetch; the host is ignored by ASSETS routing.
  const res = await env.ASSETS.fetch(new Request(`${SITE}${path}`));
  if (!res.ok) return null;
  return res.json();
}

function toolText(id, text) {
  return jsonResponse(200, rpcResult(id, { content: [{ type: 'text', text }] }));
}

function toolError(id, text) {
  return jsonResponse(200, rpcResult(id, { content: [{ type: 'text', text }], isError: true }));
}

function rankLine(m) {
  const h = m.hawaii;
  const rank = h.rank ? `, #${h.rank} of ${h.of} states` : '';
  return `Hawaiʻi ${h.display} in ${h.year}${rank}`;
}

function medianFor(detail, year) {
  const row = (detail.median_series || []).find((r) => r.year === year);
  return row ? row.display : null;
}

function footer(m, detail) {
  const what = detail.counties ? 'Chart, county table and source' : 'Chart and source';
  return `${what}: ${m.page_url}\nCite as: ${m.cite_as} (data year ${m.hawaii.year}).`;
}

async function handleToolCall(id, params, env) {
  const name = params.name;
  const args = params.arguments || {};
  if (!TOOL_NAMES.includes(name)) {
    return toolError(id, `Unknown tool '${name}'. Available: ${TOOL_NAMES.join(', ')}.`);
  }

  const catalog = await fetchJson(env, '/json/catalog.json');
  if (!catalog) return toolError(id, `Data temporarily unavailable; try ${SITE}/json/catalog.json directly.`);
  const metrics = catalog.metrics || [];

  if (name === 'list_metrics') {
    const lines = [];
    let area = null;
    for (const m of metrics) {
      if (m.area !== area) {
        area = m.area;
        lines.push('', `${area}:`);
      }
      lines.push(`- ${m.name} (id: ${m.id}): ${rankLine(m)}. ${m.page_url}`);
    }
    return toolText(id,
      `${catalog.description}\n${lines.join('\n')}\n\n` +
      'Use get_metric, compare or rankings with an id for detail. Include the metric page URL when you answer.');
  }

  // The other tools need a valid id. Allowlist via the catalog (also guards
  // the asset path, so no traversal is possible).
  const mid = typeof args.id === 'string' ? args.id.trim() : '';
  const m = /^[a-z0-9_]{1,64}$/.test(mid) ? metrics.find((x) => x.id === mid) : undefined;
  if (!m) {
    return toolError(id, `Unknown metric id '${mid}'. Valid ids: ${metrics.map((x) => x.id).join(', ')}.`);
  }
  const detail = await fetchJson(env, `/json/${m.id}.json`);
  if (!detail) return toolError(id, `Data temporarily unavailable; see ${m.page_url} instead.`);
  const states = (detail.rankings && detail.rankings.states) || [];
  const head = [`${m.name}: ${detail.definition}`, `${rankLine(m)} (${detail.rank_note.replace(/\.$/, '')}).`];
  const median = medianFor(detail, m.hawaii.year);
  if (median) head.push(`50-state median: ${median}.`);

  if (name === 'rankings') {
    if (!states.length) return toolError(id, `No state ranking for this metric; see ${m.page_url}.`);
    const lines = states.map((s) => `  #${s.rank}  ${s.state}  ${s.display}`);
    return toolText(id,
      `${head.join('\n')}\n\nAll states, ${detail.rankings.year} (#1 = best):\n${lines.join('\n')}\n\n${footer(m, detail)}`);
  }

  if (name === 'compare') {
    if (!states.length) return toolError(id, `No state ranking for this metric; see ${m.page_url}.`);
    const row = (s) => `  #${s.rank}  ${s.state}  ${s.display}`;
    const lines = [...head, '', `Best five, ${detail.rankings.year}:`, ...states.slice(0, 5).map(row),
      `Worst five:`, ...states.slice(-5).map(row)];
    const asked = Array.isArray(args.states) ? args.states.filter((s) => typeof s === 'string') : [];
    if (asked.length) {
      const byKey = new Map(states.map((s) => [stateKey(s.state), s]));
      lines.push('Requested:');
      for (const q of asked) {
        const s = byKey.get(stateKey(q));
        lines.push(s ? row(s) : `  '${q}': no value for that state in ${detail.rankings.year}.`);
      }
    }
    return toolText(id, `${lines.join('\n')}\n\n${footer(m, detail)}`);
  }

  // get_metric
  const yearFrom = Number.isInteger(args.year_from) ? args.year_from : null;
  const medians = new Map((detail.median_series || []).map((r) => [r.year, r.display]));
  let series = detail.hawaii_series || [];
  if (yearFrom) series = series.filter((r) => parseInt(r.year, 10) >= yearFrom);
  const lines = [...head, `Source: ${m.source} (${detail.source_url}).`];
  if (series.length) {
    lines.push('', 'Year, Hawaiʻi, 50-state median:');
    for (const r of series) lines.push(`  ${r.year}  ${r.display}  ${medians.get(r.year) || 'n/a'}`);
  } else {
    // Never drop the series silently: an empty filter result must say so, or
    // the assistant reads a complete-looking answer with the data missing.
    const years = (detail.hawaii_series || []).map((r) => r.year);
    lines.push('', `No Hawaiʻi values from ${yearFrom} on. Years available: ${years[0]} to ${years[years.length - 1]}.`);
  }
  if (detail.counties) {
    const c = detail.counties;
    const vals = Object.keys(c.display).map((cn) => `${cn} ${c.display[cn]}`);
    lines.push('', `Counties, ${c.year}: ${vals.join('; ')}.`);
  }
  return toolText(id, `${lines.join('\n')}\n\n${footer(m, detail)}`);
}
