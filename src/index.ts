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

    // Handle POST probes (Common in Streamable HTTP fallbacks like Cursor)
    if (pathname === "/sse" && method === "POST") {
      return new Response(JSON.stringify({ 
        error: "Method Not Allowed", 
        message: "This server supports SSE. Please use GET to initiate the stream.",
        transport: "sse"
      }), { 
        status: 405, 
        headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "Allow": "GET, OPTIONS"
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
        mcpVersion: "1.2.4-DO",
        timestamp: new Date().toISOString()
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    return new Response(`MCP DO Route Not Found: ${method} ${pathname}`, { status: 404, headers: corsHeaders });
  }

  private createServerInstance(apiKey: string) {
    const server = new Server(
      { name: "xiaoflow-mcp-server", version: "1.2.1" },
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
          description: "Generate keyword ideas and market intelligence from multi-vector seeds (keywords, domains, or specific URLs).",
          inputSchema: {
            type: "object",
            properties: {
              keyword: { type: "string", description: "Primary search vector (e.g. 'wedding rings')." },
              url: { type: "string", description: "Target individual page URL for landing page extraction." },
              site: { type: "string", description: "Root domain or subdomain for full-site keyword mapping." },
              location: { type: "string", description: "Geo-node ID or ISO code (e.g., 2840 or US)." },
              language: { type: "string", description: "Language vector ID or code (e.g., 1000 or en)." },
            },
          },
        },
        {
          name: "analyze_url",
          description: "Perform deep algorithmic extraction of organic keywords from a specific URL or domain.",
          inputSchema: {
            type: "object",
            properties: {
              url: { type: "string", description: "Target URL to analyze." },
              site: { type: "string", description: "Target domain to analyze." },
              location: { type: "string", description: "Target country/region." },
            },
          },
        },
        {
          name: "get_domain_stats",
          description: "Get SEO metrics (traffic, keywords) for a specific domain.",
          inputSchema: {
            type: "object",
            properties: {
              domain: { type: "string" },
            },
            required: ["domain"],
          },
        },
        {
          name: "get_keyword_details",
          description: "Get detailed historical data for a specific keyword slug.",
          inputSchema: {
            type: "object",
            properties: {
              slug: { type: "string" },
              time_range: { type: "string", enum: ["12m", "24m", "48m"] },
            },
            required: ["slug"],
          },
        },
        {
          name: "bulk_keyword_lookup",
          description: "Get search volume and CPC metrics for a large list of keywords (up to 1,000).",
          inputSchema: {
            type: "object",
            properties: {
              keywords: { 
                type: "array", 
                items: { type: "string" },
                description: "List of keywords to analyze."
              },
              location: { type: "string", description: "Location ID (optional)." },
              language: { type: "string", description: "Language code (optional)." },
            },
            required: ["keywords"],
          },
        },
      ],
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
        switch (name) {
          case "discover_keywords":
          case "analyze_url": {
            const response = await axiosInstance.get("/api/keywords", { params: args });
            return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
          }
          case "get_domain_stats": {
            const { domain, ...params } = args as any;
            const response = await axiosInstance.get(`/api/domains/${domain}`, { params });
            return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
          }
          case "get_keyword_details": {
            const { slug, ...params } = args as any;
            const response = await axiosInstance.get(`/api/keywords/${slug}/history`, { params });
            return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
          }
          case "bulk_keyword_lookup": {
            const response = await axiosInstance.post("/api/keywords/bulk", args);
            return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
          }
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error: any) {
        const errorMsg = error.response?.data?.message || error.message || "Unknown API error";
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

  const isAllowed = true;
  const allowedOrigin = origin || "*";
  const allowCredentials = "true";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-mcp-session-id",
    "Access-Control-Expose-Headers": "Content-Type, x-mcp-session-id",
    "Access-Control-Allow-Credentials": allowCredentials,
  };
};

const app = new Hono<{ Bindings: { MCP_SESSION: DurableObjectNamespace } }>();

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
            timestamp: new Date().toISOString()
        }, 200, getCorsHeaders(c));
    } catch (err: any) {
        return c.json({ status: "Error", message: err.message }, 500, getCorsHeaders(c));
    }
});

export default {
    async fetch(request: Request, env: any, ctx: any): Promise<Response> {
        const url = new URL(request.url);
        const method = request.method;
        const pathname = url.pathname.replace(/\/$/, "").toLowerCase() || "/";

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
};
