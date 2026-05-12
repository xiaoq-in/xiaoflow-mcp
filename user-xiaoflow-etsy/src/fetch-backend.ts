import { apiBaseOrigin, requestTimeoutMs, trustedOrigin } from './config.js';

/** Shared headers for Xiaoflow API (satisfies protectCachedApiMiddleware for api.xiaoflow.com). */
export function backendHeaders(extra?: HeadersInit): Headers {
    const h = new Headers({
        Accept: 'application/json',
        'User-Agent': 'xiaoflow-mcp-user-xiaoflow-etsy/1.1 (+https://xiaoflow.com)',
        Origin: trustedOrigin(),
        'X-Requested-With': 'XMLHttpRequest',
    });
    const token = process.env.XIAOFLOW_AUTH_TOKEN?.trim();
    if (token) h.set('Authorization', `Bearer ${token}`);
    const internal = process.env.XIAOFLOW_INTERNAL_SECRET?.trim();
    if (internal) h.set('x-internal-secret', internal);
    if (extra) {
        const o = new Headers(extra);
        for (const [k, v] of o.entries()) h.set(k, v);
    }
    return h;
}

export async function fetchBackend(absPathAndQuery: string, init?: RequestInit): Promise<Response> {
    const url = `${apiBaseOrigin()}${absPathAndQuery}`;
    return fetch(url, {
        ...init,
        headers: backendHeaders(init?.headers),
        signal: AbortSignal.timeout(requestTimeoutMs()),
    });
}
