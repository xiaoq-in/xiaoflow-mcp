#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import { Hono } from "hono";
import { DurableObject } from "cloudflare:workers";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

const MCP_RESOURCE = "https://mcp.xiaoflow.com/mcp";
const AUTHORIZATION_SERVER = "https://www.xiaoflow.com";
const PROTECTED_RESOURCE_METADATA = "https://mcp.xiaoflow.com/.well-known/oauth-protected-resource";

function brandQueryParam(brand: unknown): 0 | 1 {
  if (brand === 1 || brand === "1" || brand === true) return 1;
  return 0;
}

/** Map MCP tool args to API query params (location/language → backend getStandardParams). */
function apiQueryParams(args: Record<string, unknown>): Record<string, unknown> {
  const { brand, domain, site, keywords, ...rest } = args;
  const params: Record<string, unknown> = { ...rest };
  if (brand !== undefined) params.brand = brandQueryParam(brand);
  return params;
}

function keywordApiPayload(args: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...args };
  if (payload.location !== undefined) {
    payload.gl = payload.location;
    delete payload.location;
  }
  if (payload.language !== undefined) {
    payload.hl = payload.language;
    delete payload.language;
  }
  if (payload.time_range !== undefined && payload.history_months === undefined) {
    const match = String(payload.time_range).match(/^(\d+)/);
    payload.history_months = match ? Number(match[1]) : 12;
    delete payload.time_range;
  }
  payload.history_months = Math.min(48, Math.max(1, Number(payload.history_months || 12)));
  payload.with_history = payload.with_history !== false;
  payload.historical = payload.with_history;
  return payload;
}

function normalizeDomainInput(raw: string): string {
  const s = raw.trim();
  try {
    if (s.includes("://")) return new URL(s).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    /* fall through */
  }
  return s.replace(/^www\./i, "").toLowerCase();
}

/**
 * Durable Object that maintains a single stateful MCP server session.
 * Optimized for Raw Fetch performance and reliability within Cloudflare.
 */
export class McpSession extends DurableObject {
  private transport?: HonoSseTransport;
  private server?: Server;
  private _env: any;

  constructor(ctx: any, env: any) {
    super(ctx, env);
    this._env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    const pathname = url.pathname.replace(/\/$/, "").toLowerCase() || "/";

    console.log(`[DO ${this.ctx.id}] ${method} ${pathname} (Orig: ${url.pathname})`);

    const corsHeaders = getCorsHeaders(request);

    if (method === "OPTIONS" || method === "HEAD") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Streamable HTTP transport. Each request is intentionally stateless, which
    // works across Worker isolates and avoids pinning HTTP clients to one object.
    if (pathname === "/mcp") {
      const apiKey = request.headers.get("X-Xiaoflow-Api-Key") || "";
      if (!apiKey) {
        return oauthErrorResponse("invalid_token", "A valid XiaoFlow access token is required.");
      }

      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      const server = this.createServerInstance(apiKey);
      await server.connect(transport);
      const response = await transport.handleRequest(request);
      return withCors(response, request);
    }

    // SSE Handshake (GET)
    if (pathname === "/sse" && method === "GET") {
      const authHeader = request.headers.get("Authorization");
      let apiKey = url.searchParams.get("key") || "";
      
      if (authHeader && authHeader.startsWith("Bearer ")) {
        apiKey = authHeader.substring(7);
      }
      
      apiKey = apiKey || this._env.XIAOFLOW_API_KEY;

      const sessionId = this.ctx.id.toString();
      const externalBaseUrl = request.headers.get("X-External-Base-Url");
      const finalBaseUrl = externalBaseUrl || `${url.protocol}//${url.host}`;

      console.log(`[DO ${sessionId}] Handling SSE Handshake for key: ${apiKey?.substring(0, 8)}...`);

      // 1. Initialize transport and server
      this.transport = new HonoSseTransport(sessionId);
      this.server = this.createServerInstance(apiKey);

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start: async (controller) => {
          try {
            // Set the controller for the transport to use
            this.transport!.setController(controller, encoder);

            // CRITICAL: Flush headers and initial packet immediately to prove connection is alive
            controller.enqueue(encoder.encode(": ok\n\n"));
            console.log(`[DO ${sessionId}] SSE Stream established, ok sent`);

            // Send endpoint event - Absolute URL is safer
            const messagesUrl = `${finalBaseUrl}/messages?sessionId=${sessionId}`;
            const endpointData = `event: endpoint\ndata: ${messagesUrl}\n\n`;
            controller.enqueue(encoder.encode(endpointData));
            console.log(`[DO ${sessionId}] Endpoint event sent: ${messagesUrl}`);

            // Connect server to transport - This will call transport.start()
            if (this.server && this.transport) {
              await this.server.connect(this.transport as any);
              console.log(`[DO ${sessionId}] MCP Server connected to transport`);
            }

            // Persistence
            if (apiKey) this.ctx.storage.put("apiKey", apiKey);

            // Keep-alive loop (Runs until stream is closed)
            const intervalId = setInterval(() => {
              try {
                controller.enqueue(encoder.encode(": keep-alive\n\n"));
              } catch (e) {
                clearInterval(intervalId);
              }
            }, 10000);
            
          } catch (e) {
            console.error(`[DO ${sessionId}] SSE Start Error:`, e);
            controller.error(e);
          }
        },
        cancel: () => {
          console.log(`[DO ${sessionId}] SSE Stream closed by client`);
          this.transport = undefined;
        }
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "X-Content-Type-Options": "nosniff",
          "Connection": "keep-alive",
          "X-Mcp-Session-Id": sessionId
        },
      });
    }

    // Handle POST probes (Common in Streamable HTTP fallbacks like Cursor & Smithery)
    if (pathname === "/sse" && method === "POST") {
      return new Response(JSON.stringify({ 
        status: "ok", 
        message: "This server supports SSE. Please use GET /sse to initiate the stream.",
        transport: "sse",
        endpoint: "/sse"
      }), { 
        status: 200, 
        headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "Allow": "GET, POST, OPTIONS"
        } 
      });
    }

    // Message Input
    if (pathname === "/messages" && method === "POST") {
      console.log(`[DO ${this.ctx.id}] Incoming message to /messages`);
      if (!this.transport || !this.server) {
        console.warn(`[DO ${this.ctx.id}] Message received but no active transport/server`);
        const storedKey: string | undefined = await this.ctx.storage.get("apiKey");
        if (storedKey) {
            this.server = this.createServerInstance(storedKey);
        }
        return new Response("Session state lost. Please reconnect SSE.", { 
            status: 410, 
            headers: { ...corsHeaders, "Content-Type": "text/plain" } 
        });
      }

      try {
        const message = await request.json() as any;
        console.log(`[DO ${this.ctx.id}] JSON-RPC Request: ${message.method || 'unknown'}`);
        this.transport.onmessage?.(message);
        return new Response("OK", { headers: corsHeaders });
      } catch (e) {
        return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
      }
    }

    // Health Check / Diagnostics
    if (pathname === "/health" || pathname === "/") {
      return new Response(JSON.stringify({ 
        status: "OK", 
        sessionId: this.ctx.id.toString(),
        mcpVersion: "1.3.1-DO",
        timestamp: new Date().toISOString()
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    return new Response(`MCP DO Route Not Found: ${method} ${pathname}`, { status: 404, headers: corsHeaders });
  }

  private createServerInstance(apiKey: string) {
    const server = new Server(
      { name: "xiaoflow-mcp-server", version: "1.3.1" },
      { capabilities: { tools: {} } }
    );

    const axiosInstance = axios.create({
      baseURL: this._env.XIAOFLOW_API_URL || "https://api.xiaoflow.com",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      params: {
        expanded: "true",
        limit: 1000
      }
    });

    this.setupHandlers(server, axiosInstance);
    return server;
  }

  private setupHandlers(server: Server, axiosInstance: any) {
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "discover_keywords",
          description: "Legacy alias for related keyword discovery. Returns paginated keyword metrics and monthly history.",
          inputSchema: {
            type: "object",
            properties: {
              keyword: { type: "string", description: "Primary keyword seed." },
              url: { type: "string", description: "Page URL seed." },
              site: { type: "string", description: "Root domain seed." },
              location: { type: "string", description: "Geo ID or ISO (e.g. 2840 or US)." },
              language: { type: "string", description: "Language ID or code (e.g. 1000 or en)." },
            },
          },
        },
        {
          name: "get_keyword_metrics",
          description: "Get exact-match base metrics and 1-48 months of monthly history for one keyword.",
          inputSchema: {
            type: "object",
            properties: {
              keyword: { type: "string", description: "Exact keyword text." },
              history_months: { type: "integer", minimum: 1, maximum: 48, default: 12 },
              location: { type: "string", description: "Geo ID or ISO country code, e.g. 2840 or US." },
              language: { type: "string", description: "Language ID or code, e.g. 1000 or en." },
            },
            required: ["keyword"],
          },
        },
        {
          name: "get_related_keywords",
          description: "Get all related keywords for a seed with metrics and optional 1-48 month history. Paginate until has_more=false; there is no total-result cap.",
          inputSchema: {
            type: "object",
            properties: {
              seed: { type: "string", description: "Seed keyword." },
              history_months: { type: "integer", minimum: 1, maximum: 48, default: 12 },
              page: { type: "integer", minimum: 1, default: 1 },
              page_size: { type: "integer", minimum: 1, maximum: 1000, default: 100 },
              location: { type: "string" },
              language: { type: "string" },
              force: { type: "boolean", description: "Request fresh discovery when cached coverage is insufficient." },
            },
            required: ["seed"],
          },
        },
        {
          name: "bulk_keyword_metrics",
          description: "Get exact-match base metrics and 1-48 months of history for up to 1,000 keywords in one request.",
          inputSchema: {
            type: "object",
            properties: {
              keywords: { type: "array", minItems: 1, maxItems: 1000, items: { type: "string" } },
              history_months: { type: "integer", minimum: 1, maximum: 48, default: 12 },
              location: { type: "string" },
              language: { type: "string" },
            },
            required: ["keywords"],
          },
        },
        {
          name: "start_keyword_expansion",
          description: "Start an asynchronous breadth-first/round-based keyword expansion from one or more seeds.",
          inputSchema: {
            type: "object",
            properties: {
              seeds: { type: "array", minItems: 1, maxItems: 20, items: { type: "string" } },
              max_iterations: { type: "integer", minimum: 1, maximum: 10, default: 5 },
              min_search_volume: { type: "integer", minimum: 0, default: 0 },
              location_id: { type: "integer", default: 2840 },
              language_id: { type: "integer", default: 1000 },
              include_rules: { type: "array", items: { type: "string" } },
              exclude_rules: { type: "array", items: { type: "string" } },
            },
            required: ["seeds"],
          },
        },
        {
          name: "get_keyword_expansion_status",
          description: "Poll a round-based expansion task. Returns progress, depth, counts, provenance and results when requested.",
          inputSchema: {
            type: "object",
            properties: {
              task_id: { type: "integer" },
              include_results: { type: "boolean", default: false },
            },
            required: ["task_id"],
          },
        },
        {
          name: "analyze_url",
          description: "Domain/site keyword discovery via /api/v1/websites (requires brand=0|1). Use site for full domain mapping; use url for a single page via /api/v1/keywords.",
          inputSchema: {
            type: "object",
            properties: {
              url: { type: "string", description: "Single page URL (uses /api/v1/keywords)." },
              site: { type: "string", description: "Domain for /api/v1/websites discovery." },
              brand: { type: "integer", enum: [0, 1], description: "0=domain keywords, 1=brand keywords (required with site)." },
              location: { type: "string", description: "Geo ID or ISO." },
              language: { type: "string", description: "Language ID or code." },
            },
          },
        },
        {
          name: "get_domain_stats",
          description: "Website overview metrics and traffic history. GET /api/v1/websites/:domain?brand=0|1",
          inputSchema: {
            type: "object",
            properties: {
              domain: { type: "string", description: "Domain (e.g. example.com)." },
              brand: { type: "integer", enum: [0, 1], description: "0=domain overview, 1=brand overview." },
              location: { type: "string", description: "Geo ID or ISO." },
              language: { type: "string", description: "Language ID or code." },
            },
            required: ["domain", "brand"],
          },
        },
        {
          name: "list_domain_keywords",
          description: "Paginated keyword list for a domain. GET /api/v1/websites/:domain/keywords?brand=0|1",
          inputSchema: {
            type: "object",
            properties: {
              domain: { type: "string" },
              brand: { type: "integer", enum: [0, 1] },
              location: { type: "string" },
              language: { type: "string" },
              page: { type: "integer" },
              page_size: { type: "integer" },
            },
            required: ["domain", "brand"],
          },
        },
        {
          name: "get_keyword_details",
          description: "Historical volume for a keyword slug.",
          inputSchema: {
            type: "object",
            properties: {
              slug: { type: "string" },
              time_range: { type: "string", enum: ["12m", "24m", "48m"] },
              location: { type: "string" },
              language: { type: "string" },
            },
            required: ["slug"],
          },
        },
        {
          name: "bulk_keyword_lookup",
          description: "Bulk volume/CPC for up to 1,000 keywords.",
          inputSchema: {
            type: "object",
            properties: {
              keywords: { 
                type: "array", 
                items: { type: "string" },
                description: "List of keywords to analyze."
              },
              location: { type: "string" },
              language: { type: "string" },
            },
            required: ["keywords"],
          },
        },
      ],
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const toolArgs = (args || {}) as Record<string, unknown>;
      try {
        switch (name) {
          case "discover_keywords": {
            const payload = keywordApiPayload({
              ...toolArgs,
              seed: toolArgs.keyword,
              page: toolArgs.page || 1,
              page_size: toolArgs.page_size || 100,
            });
            delete payload.keyword;
            const response = await axiosInstance.post("/api/v1/keywords/related", payload);
            return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
          }
          case "get_keyword_metrics": {
            const response = await axiosInstance.post("/api/v1/keywords/metrics", keywordApiPayload(toolArgs));
            return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
          }
          case "get_related_keywords": {
            const response = await axiosInstance.post("/api/v1/keywords/related", keywordApiPayload(toolArgs));
            return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
          }
          case "bulk_keyword_metrics": {
            const keywords = Array.isArray(toolArgs.keywords) ? toolArgs.keywords : [];
            if (keywords.length < 1 || keywords.length > 1000) {
              throw new McpError(ErrorCode.InvalidParams, "keywords must contain 1 to 1,000 items");
            }
            const response = await axiosInstance.post("/api/v1/keywords/metrics", keywordApiPayload(toolArgs));
            return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
          }
          case "start_keyword_expansion": {
            const response = await axiosInstance.post("/api/v1/keywords/expansions", toolArgs);
            return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
          }
          case "get_keyword_expansion_status": {
            const taskId = Number(toolArgs.task_id);
            if (!Number.isInteger(taskId) || taskId < 1) {
              throw new McpError(ErrorCode.InvalidParams, "task_id must be a positive integer");
            }
            const response = await axiosInstance.get(`/api/v1/keywords/expansions/${taskId}`, {
              params: toolArgs.include_results ? { sync_metrics: 1 } : { live: 1 },
            });
            return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
          }
          case "analyze_url": {
            const site = String(toolArgs.site || "").trim();
            const url = String(toolArgs.url || "").trim();
            if (site && !url) {
              const domain = normalizeDomainInput(site);
              const params = apiQueryParams(toolArgs);
              if (params.brand === undefined) params.brand = 0;
              const response = await axiosInstance.get("/api/v1/websites", {
                params: { ...params, site: domain },
              });
              return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
            }
            const response = await axiosInstance.get("/api/v1/keywords", {
              params: apiQueryParams(toolArgs),
            });
            return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
          }
          case "get_domain_stats": {
            const domain = normalizeDomainInput(String(toolArgs.domain || ""));
            const params = apiQueryParams(toolArgs);
            if (params.brand === undefined) {
              throw new McpError(ErrorCode.InvalidParams, "brand is required (0 or 1)");
            }
            const response = await axiosInstance.get(
              `/api/v1/websites/${encodeURIComponent(domain)}`,
              { params }
            );
            return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
          }
          case "list_domain_keywords": {
            const domain = normalizeDomainInput(String(toolArgs.domain || ""));
            const params = apiQueryParams(toolArgs);
            if (params.brand === undefined) {
              throw new McpError(ErrorCode.InvalidParams, "brand is required (0 or 1)");
            }
            const response = await axiosInstance.get(
              `/api/v1/websites/${encodeURIComponent(domain)}/keywords`,
              { params }
            );
            return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
          }
          case "get_keyword_details": {
            const { slug, ...rest } = toolArgs;
            const response = await axiosInstance.post("/api/v1/keywords/metrics", keywordApiPayload({
              ...rest,
              keyword: String(slug).replace(/-/g, " "),
            }));
            return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
          }
          case "bulk_keyword_lookup": {
            const response = await axiosInstance.post("/api/v1/keywords/metrics", keywordApiPayload(toolArgs));
            return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
          }
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error: any) {
        if (error instanceof McpError) throw error;
        const errorMsg = error.response?.data?.message || error.response?.data?.error || error.message || "Unknown API error";
        return {
          content: [{ type: "text", text: `XiaoFlow API Error: ${errorMsg}` }],
          isError: true,
        };
      }
    });
  }
}

class HonoSseTransport {
  private controller?: ReadableStreamDefaultController;
  private encoder?: TextEncoder;
  public onmessage?: (message: any) => void;
  public onerror?: (error: Error) => void;
  public onclose?: () => void;

  constructor(private sessionId: string) {}

  setController(controller: ReadableStreamDefaultController, encoder: TextEncoder) {
    this.controller = controller;
    this.encoder = encoder;
  }

  async start() {
    console.log(`[DO ${this.sessionId}] [Transport] start() called`);
  }

  async send(message: any) {
    if (this.controller && this.encoder) {
      const data = `event: message\ndata: ${JSON.stringify(message)}\n\n`;
      try {
        this.controller.enqueue(this.encoder.encode(data));
        console.log(`[DO ${this.sessionId}] [Transport] Sent message: ${message.id || 'notify'}`);
      } catch (e) {
        console.error(`[DO ${this.sessionId}] [Transport] Error sending message:`, e);
        this.onclose?.();
      }
    } else {
        console.warn(`[DO ${this.sessionId}] [Transport] Attempted to send message but controller is missing`);
    }
  }

  async close() {
    console.log(`[DO ${this.sessionId}] [Transport] close() called`);
    this.onclose?.();
  }
}

const getCorsHeaders = (cOrReq: any) => {
  let origin: string | null = null;
  if (cOrReq instanceof Request) {
    origin = cOrReq.headers.get("Origin");
  } else if (cOrReq && cOrReq.req && typeof cOrReq.req.header === "function") {
    origin = cOrReq.req.header("Origin");
  }

  const allowedOrigin = origin || "*";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Last-Event-ID, MCP-Protocol-Version, MCP-Session-Id, x-mcp-session-id",
    "Access-Control-Expose-Headers": "Content-Type, MCP-Protocol-Version, MCP-Session-Id, x-mcp-session-id, WWW-Authenticate",
  };
};

function withCors(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(getCorsHeaders(request))) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function oauthErrorResponse(error = "invalid_token", description = "Authentication required."): Response {
  return new Response(JSON.stringify({
    error,
    error_description: description,
  }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "WWW-Authenticate": `Bearer resource_metadata="${PROTECTED_RESOURCE_METADATA}", scope="mcp", error="${error}"`,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "WWW-Authenticate",
    },
  });
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get("Authorization") || "";
  return authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
}

async function validateAccessToken(token: string, apiBaseUrl: string): Promise<boolean> {
  if (!token) return false;
  try {
    const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/v1/user`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
      },
    });
    return response.ok;
  } catch (error) {
    console.error(JSON.stringify({
      event: "mcp_token_validation_failed",
      error: error instanceof Error ? error.message : String(error),
    }));
    return false;
  }
}

const app = new Hono<{ Bindings: Env }>();

app.get("/.well-known/oauth-protected-resource", (c) => c.json({
  resource: MCP_RESOURCE,
  authorization_servers: [AUTHORIZATION_SERVER],
  scopes_supported: ["mcp"],
  bearer_methods_supported: ["header"],
  resource_documentation: "https://www.xiaoflow.com/mcp",
}, 200, {
  ...getCorsHeaders(c),
  "Cache-Control": "public, max-age=300",
}));

app.get("/.well-known/oauth-protected-resource/mcp", (c) => c.json({
  resource: MCP_RESOURCE,
  authorization_servers: [AUTHORIZATION_SERVER],
  scopes_supported: ["mcp"],
  bearer_methods_supported: ["header"],
  resource_documentation: "https://www.xiaoflow.com/mcp",
}, 200, {
  ...getCorsHeaders(c),
  "Cache-Control": "public, max-age=300",
}));

// Compatibility for clients that attempt authorization-server discovery on the
// resource host before following the issuer from protected-resource metadata.
app.get("/.well-known/oauth-authorization-server", (c) => c.json({
  issuer: AUTHORIZATION_SERVER,
  authorization_endpoint: `${AUTHORIZATION_SERVER}/mcp/authorize`,
  token_endpoint: `${AUTHORIZATION_SERVER}/api/v1/mcp/oauth/token`,
  registration_endpoint: `${AUTHORIZATION_SERVER}/api/v1/mcp/oauth/register`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code"],
  token_endpoint_auth_methods_supported: ["none"],
  code_challenge_methods_supported: ["S256"],
  scopes_supported: ["mcp"],
}, 200, {
  ...getCorsHeaders(c),
  "Cache-Control": "public, max-age=300",
}));

app.get("/.well-known/mcp/server-card.json", (c) => {
  const url = new URL(c.req.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  return c.json({
    "$schema": "https://smithery.ai/server-card-schema.json",
    "name": "xiaoflow-mcp-server",
    "description": "XiaoFlow AI SEO and keyword intelligence MCP Server",
    "version": "1.3.1",
    "protocolVersion": "2025-03-26",
    "capabilities": {
      "tools": {}
    },
    "transport": {
      "type": "streamable-http",
      "endpoint": `${baseUrl}/mcp`
    },
    "configSchema": {
      "type": "object",
      "additionalProperties": false,
      "properties": {}
    },
    "securitySchemes": {
      "oauth2": {
        "type": "oauth2",
        "description": "Authorize by logging into your XiaoFlow.com account",
        "flows": {
          "authorizationCode": {
            "authorizationUrl": `${baseUrl}/oauth/authorize`,
            "tokenUrl": `${baseUrl}/oauth/token`,
            "scopes": {}
          }
        }
      },
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "API_KEY",
        "description": "Provide your XiaoFlow API key as a Bearer token"
      }
    }
  }, 200, getCorsHeaders(c));
});

app.get("/.well-known/mcp-server-card.json", (c) => {
  const url = new URL(c.req.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  return c.json({
    "$schema": "https://smithery.ai/server-card-schema.json",
    "name": "xiaoflow-mcp-server",
    "description": "XiaoFlow AI SEO and keyword intelligence MCP Server",
    "version": "1.3.1",
    "protocolVersion": "2025-03-26",
    "capabilities": {
      "tools": {}
    },
    "transport": {
      "type": "streamable-http",
      "endpoint": `${baseUrl}/mcp`
    },
    "configSchema": {
      "type": "object",
      "additionalProperties": false,
      "properties": {}
    },
    "securitySchemes": {
      "oauth2": {
        "type": "oauth2",
        "description": "Authorize by logging into your XiaoFlow.com account",
        "flows": {
          "authorizationCode": {
            "authorizationUrl": `${baseUrl}/oauth/authorize`,
            "tokenUrl": `${baseUrl}/oauth/token`,
            "scopes": {}
          }
        }
      },
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "API_KEY",
        "description": "Provide your XiaoFlow API key as a Bearer token"
      }
    }
  }, 200, getCorsHeaders(c));
});

// OAuth compatibility routes. Standards-compliant clients discover the
// authorization server above; older clients may call these resource-host URLs.
app.get("/oauth/authorize", (c) => {
  const url = new URL(c.req.url);
  const target = new URL(`${AUTHORIZATION_SERVER}/mcp/authorize`);
  url.searchParams.forEach((value, key) => target.searchParams.set(key, value));
  return c.redirect(target.toString(), 302);
});

app.get("/authorize", (c) => c.redirect(`${AUTHORIZATION_SERVER}/mcp/authorize?${new URL(c.req.url).searchParams}`, 302));

app.all("/oauth/token", async (c) => {
  const target = `${AUTHORIZATION_SERVER}/api/v1/mcp/oauth/token`;
  const response = await fetch(target, {
    method: c.req.method,
    headers: {
      "Content-Type": c.req.header("Content-Type") || "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: ["GET", "HEAD"].includes(c.req.method) ? undefined : c.req.raw.body,
  });
  return withCors(response, c.req.raw);
});

app.post("/oauth/register", async (c) => {
  const response = await fetch(`${AUTHORIZATION_SERVER}/api/v1/mcp/oauth/register`, {
    method: "POST",
    headers: {
      "Content-Type": c.req.header("Content-Type") || "application/json",
      "Accept": "application/json",
    },
    body: c.req.raw.body,
  });
  return withCors(response, c.req.raw);
});

app.get("/", async (c) => {
    try {
        const id = c.env.MCP_SESSION.newUniqueId();
        const obj = c.env.MCP_SESSION.get(id);
        const res = await obj.fetch(new Request("https://mcp.xiaoflow.com/health"));
        const data: any = await res.json();
        return c.json({
            status: "XiaoFlow MCP is Online",
            worker: "OnlineV2.4",
            durableObject: "Active",
            sessionId: data.sessionId,
            instructions: "Connect to /sse",
            streamableHttp: "/mcp",
            oauthProtectedResource: "/.well-known/oauth-protected-resource",
            timestamp: new Date().toISOString()
        }, 200, getCorsHeaders(c));
    } catch (err: any) {
        return c.json({ status: "Error", message: err.message }, 500, getCorsHeaders(c));
    }
});

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);
        const method = request.method;
        const pathname = url.pathname.replace(/\/$/, "").toLowerCase() || "/";

        if (method === "OPTIONS") {
            return new Response(null, { status: 204, headers: getCorsHeaders(request) });
        }

        if (pathname === "/mcp") {
            const token = bearerToken(request);
            if (!token) return oauthErrorResponse();

            const apiBaseUrl = env.XIAOFLOW_API_URL || "https://api.xiaoflow.com";
            if (!await validateAccessToken(token, apiBaseUrl)) {
                return oauthErrorResponse("invalid_token", "The XiaoFlow access token is invalid or expired.");
            }

            const id = env.MCP_SESSION.newUniqueId();
            const obj = env.MCP_SESSION.get(id);
            const forwarded = new Request(request);
            forwarded.headers.set("X-Xiaoflow-Api-Key", token);
            return obj.fetch(forwarded);
        }

        if (pathname === "/sse" || pathname === "/messages") {
            const sessionId = url.searchParams.get("sessionId") || request.headers.get("x-mcp-session-id");
            let id;
            if (sessionId) {
                try { id = env.MCP_SESSION.idFromString(sessionId); } catch { id = env.MCP_SESSION.newUniqueId(); }
            } else {
                id = env.MCP_SESSION.newUniqueId();
            }

            const obj = env.MCP_SESSION.get(id);
            const baseUrl = `${url.protocol}//${url.host}`;
            const newRequest = new Request(request);
            newRequest.headers.set("X-External-Base-Url", baseUrl);
            
            return obj.fetch(newRequest);
        }

        return app.fetch(request, env, ctx);
    }
} satisfies ExportedHandler<Env>;
