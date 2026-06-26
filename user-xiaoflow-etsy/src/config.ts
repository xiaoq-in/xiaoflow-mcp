/** Defaults and env-derived settings for the stdio MCP process. */

export function apiBaseOrigin(): string {
    const raw = (process.env.XIAOFLOW_API_BASE ?? 'https://api.xiaoflow.com').trim();
    return raw.replace(/\/+$/, '');
}

export function trustedOrigin(): string {
    return (process.env.XIAOFLOW_TRUSTED_ORIGIN ?? 'https://www.xiaoflow.com').trim();
}

export function maxResponseChars(): number {
    const n = Number(process.env.XIAOFLOW_MCP_RESPONSE_MAX_CHARS ?? 240_000);
    return Number.isFinite(n) && n > 1024 ? Math.min(Math.floor(n), 2_000_000) : 240_000;
}

/** Outbound Worker fetch timeout (ms). Default 120s, max 600s. */
export function requestTimeoutMs(): number {
    const n = Number(process.env.XIAOFLOW_MCP_REQUEST_TIMEOUT_MS ?? 120_000);
    if (!Number.isFinite(n) || n <= 0) return 120_000;
    return Math.min(Math.floor(n), 600_000);
}

export function hasAnyAuthConfigured(): boolean {
    return Boolean(
        process.env.XIAOFLOW_AUTH_TOKEN?.trim() || process.env.XIAOFLOW_INTERNAL_SECRET?.trim(),
    );
}

export function mcServerInstructions(): string {
    return [
        'Xiaoflow Worker proxy for REST /api/v1/etsy/* and GET /api/v1/user/etsy/insight.',
        'Tools: xiaoflow_etsy_route_catalog (static docs), xiaoflow_etsy_http (GET/POST), xiaoflow_user_etsy_insight.',
        'Set XIAOFLOW_AUTH_TOKEN (Bearer / api token) or XIAOFLOW_INTERNAL_SECRET (INTERNAL_API_SECRET).',
        `Optional: XIAOFLOW_API_BASE (default ${apiBaseOrigin()}), XIAOFLOW_TRUSTED_ORIGIN.`,
    ].join(' ');
}
