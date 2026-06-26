import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';
import { apiBaseOrigin, hasAnyAuthConfigured, maxResponseChars, mcServerInstructions, requestTimeoutMs } from './config.js';
import { ETSY_ROUTE_CATALOG } from './etsy-route-catalog.js';
import { fetchBackend } from './fetch-backend.js';

function normalizeEtsyPath(pathInput: string): string {
    const p = pathInput.trim();
    if (!p) throw new Error('path is empty');
    if (/^[a-z][a-z0-9+.-]*:/i.test(p)) throw new Error('path must not include a URL scheme');

    let pathOnly = p;
    let qs = '';
    const qidx = pathOnly.indexOf('?');
    if (qidx >= 0) {
        qs = pathOnly.slice(qidx);
        pathOnly = pathOnly.slice(0, qidx);
    }

    pathOnly = pathOnly.replace(/^\/+/, '');
    if (pathOnly.startsWith('api/etsy')) {
        return `/${pathOnly}${qs}`;
    }
    return `/api/v1/etsy/${pathOnly}${qs}`;
}

function mergeQuery(url: URL, extra: Record<string, unknown>): void {
    for (const [key, raw] of Object.entries(extra)) {
        if (raw === undefined || raw === null) continue;
        if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
            url.searchParams.set(key, String(raw));
            continue;
        }
        url.searchParams.set(key, JSON.stringify(raw));
    }
}

function formatFetchError(err: unknown): string {
    if (err instanceof Error && err.name === 'AbortError') {
        return `Request timed out after ${requestTimeoutMs()}ms (XIAOFLOW_MCP_REQUEST_TIMEOUT_MS).`;
    }
    return err instanceof Error ? err.message : String(err);
}

async function requestEtsy(
    method: 'GET' | 'POST',
    pathInput: string,
    query?: Record<string, unknown>,
    jsonBody?: unknown,
): Promise<{ ok: boolean; status: number; text: string; contentType: string | null; effectivePath: string }> {
    const pathNorm = normalizeEtsyPath(pathInput);
    const url = new URL(pathNorm, `${apiBaseOrigin()}/`);
    mergeQuery(url, query ?? {});
    const pathAndSearch = `${url.pathname}${url.search}`;
    const pathForLabel = pathNorm.split('?')[0] ?? pathNorm;

    const init: RequestInit = { method };
    if (method === 'POST' && jsonBody !== undefined) {
        init.headers = { 'Content-Type': 'application/json' };
        init.body = JSON.stringify(jsonBody);
    }

    const res = await fetchBackend(pathAndSearch, init);
    const text = await res.text();
    return {
        ok: res.ok,
        status: res.status,
        text,
        contentType: res.headers.get('content-type'),
        effectivePath: pathForLabel,
    };
}

async function parseBodyDisplay(text: string, contentType: string | null): Promise<string> {
    let out = text;
    if (contentType?.includes('application/json')) {
        try {
            out = JSON.stringify(JSON.parse(text), null, 2);
        } catch {
            /* raw */
        }
    }
    const maxChars = maxResponseChars();
    if (out.length > maxChars) {
        return `${out.slice(0, maxChars)}\n...[truncated ${out.length - maxChars} chars]`;
    }
    return out;
}

const mcpServer = new McpServer(
    { name: 'user-xiaoflow-etsy', version: '1.1.0' },
    { instructions: mcServerInstructions() },
);

mcpServer.registerTool(
    'xiaoflow_etsy_route_catalog',
    {
        description:
            'Static JSON catalog for every Xiaoflow `/api/v1/etsy/*` Worker route (method, relative path segment, typical query keys, POST bodies). Matches `backend/src/routes/etsy.ts`.',
    },
    async () => ({
        content: [{ type: 'text', text: JSON.stringify({ routes: ETSY_ROUTE_CATALOG }, null, 2) }],
    }),
);

mcpServer.registerTool(
    'xiaoflow_etsy_http',
    {
        title: 'Proxy /api/v1/etsy',
        description:
            'HTTP proxy for Xiaoflow `/api/v1/etsy/*`. Uses `Authorization: Bearer` when `XIAOFLOW_AUTH_TOKEN` is set (JWT or api token from `auth_tokens`), or `XIAOFLOW_INTERNAL_SECRET` for Worker internal role. Sends first-party Origin and `X-Requested-With: XMLHttpRequest`.',
        inputSchema: {
            method: z.enum(['GET', 'POST']).describe('HTTP verb'),
            path: z
                .string()
                .describe(
                    'Examples: `shop`, `listing?query=…`, `listing/reviews?listing_id=…`, `buyer/999` — path segments after `/api/v1/etsy/`.',
                ),
            query: z
                .record(z.string(), z.unknown())
                .optional()
                .describe('Merged into query string (object/array values JSON-stringified).'),
            json_body: z.any().optional().describe('POST JSON body.'),
        },
    },
    async ({ method, path, query, json_body: jsonBody }) => {
        try {
            const r = await requestEtsy(method, path, query, jsonBody);
            const disp = await parseBodyDisplay(r.text, r.contentType);
            const headline = `[${method} ${r.effectivePath}] HTTP ${r.status}`;
            return {
                content: [{ type: 'text', text: `${headline}\n\n${disp}` }],
                isError: !r.ok,
            };
        } catch (err: unknown) {
            return {
                content: [{ type: 'text', text: formatFetchError(err) }],
                isError: true,
            };
        }
    },
);

mcpServer.registerTool(
    'xiaoflow_user_etsy_insight',
    {
        title: 'GET /api/v1/user/etsy/insight',
        description:
            'Linked seller snapshot (shop + receipts + listings). Same auth as Worker REST; requires Etsy OAuth linked user when using Bearer.',
    },
    async () => {
        try {
            const res = await fetchBackend('/api/v1/user/etsy/insight', { method: 'GET' });
            const raw = await res.text();
            const disp = await parseBodyDisplay(raw, res.headers.get('content-type'));
            return {
                content: [{ type: 'text', text: `[GET /api/v1/user/etsy/insight] HTTP ${res.status}\n\n${disp}` }],
                isError: !res.ok,
            };
        } catch (err: unknown) {
            return {
                content: [{ type: 'text', text: formatFetchError(err) }],
                isError: true,
            };
        }
    },
);

async function main() {
    if (!hasAnyAuthConfigured()) {
        console.warn(
            '[user-xiaoflow-etsy] Missing XIAOFLOW_AUTH_TOKEN and XIAOFLOW_INTERNAL_SECRET — Worker calls usually return 401 until one is set.',
        );
    }
    await mcpServer.connect(new StdioServerTransport());
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
