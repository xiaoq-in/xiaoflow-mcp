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
import { cors } from "hono/cors";
import { DurableObject } from "cloudflare:workers";

/**
 * Durable Object that maintains a single stateful MCP server session.
 * Optimized for Raw Fetch performance and reliability within Cloudflare.
 */
export class McpSession extends DurableObject {
  private transport?: HonoSseTransport;
  private server?: Server;
  private env: any;

  constructor(ctx: any, env: any) {
    super(ctx, env);
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    // Normalize path: ignore trailing slash and casing
    const pathname = url.pathname.replace(/\/$/, "").toLowerCase() || "/";

    console.log(`[DO ${this.ctx.id}] ${method} ${pathname} (Orig: ${url.pathname})`);

    const corsHeaders = getCorsHeaders(request);

    if (method === "OPTIONS" || method === "HEAD") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // SSE Handshake
    if (pathname === "/sse" && method === "GET") {
      const authHeader = request.headers.get("Authorization");
      let apiKey = url.searchParams.get("key");
      
      if (authHeader && authHeader.startsWith("Bearer ")) {
        apiKey = authHeader.substring(7);
      }
      
      apiKey = apiKey || this.env.XIAOFLOW_API_KEY;
      
      // Persist apiKey in DO storage for session recovery
      if (apiKey) await this.ctx.storage.put("apiKey", apiKey);

      const sessionId = this.ctx.id.toString();
      const externalBaseUrl = request.headers.get("X-External-Base-Url");
      
      this.transport = new HonoSseTransport(sessionId);
      this.server = this.createServerInstance(apiKey);

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      // Setup the transport with a bridge to this stream
      this.transport.setWriter(writer, encoder);

      const streamTask = async () => {
        try {
          // Immediately flush the endpoint info
          const finalBaseUrl = externalBaseUrl || `${url.protocol}//${url.host}`;
          const endpointData = `retry: 1000\nevent: endpoint\ndata: ${finalBaseUrl}/messages?sessionId=${sessionId}\n\n`;
          await writer.write(encoder.encode(endpointData));

          if (this.server && this.transport) {
            await this.server.connect(this.transport as any);
          }

          // Keep-alive loop (Aggressive 10s for IDE stability)
          while (true) {
            await new Promise(resolve => setTimeout(resolve, 10000));
            await writer.write(encoder.encode(": keep-alive\n\n"));
          }
        } catch (e) {
          console.error("[DO Stream Error]", e);
        } finally {
          try { await writer.close(); } catch {}
        }
      };

      // Start the stream task
      streamTask();

      return new Response(readable, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "X-Content-Type-Options": "nosniff",
          "Connection": "keep-alive",
        },
      });
    }

    // Message Input
    if (pathname === "/messages" && method === "POST") {
      if (!this.transport || !this.server) {
        // Try to re-initialize from storage if possible (unlikely to fix streaming but better than nothing)
        const storedKey: string | undefined = await this.ctx.storage.get("apiKey");
        if (storedKey) {
            this.server = this.createServerInstance(storedKey);
            // Note: transport remains disconnected from SSE stream, client needs to reconnect SSE
        }
        return new Response("Session state lost. Please reconnect SSE.", { status: 410, headers: corsHeaders });
      }

      try {
        const message = await request.json();
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
        mcpVersion: "1.2.2-DO",
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
      baseURL: this.env.XIAOFLOW_API_URL || "https://api.xiaoflow.com",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      params: {
        expanded: "true" // Always request human-readable JSON for MCP
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
          description: "Generate keyword ideas and find high-potential keywords related to a seed keyword.",
          inputSchema: {
            type: "object",
            properties: {
              keyword: { type: "string" },
              location: { type: "string" },
              language: { type: "string" },
            },
            required: ["keyword"],
          },
        },
        {
          name: "analyze_url",
          description: "Extract and analyze keywords from a specific URL.",
          inputSchema: {
            type: "object",
            properties: {
              url: { type: "string" },
              location: { type: "string" },
            },
            required: ["url"],
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
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error: any) {
        const errorMsg = error.response?.data?.message || error.message || "Unknown API error";
        return {
          content: [{ type: "text", text: `Xiaoflow API Error: ${errorMsg}` }],
          isError: true,
        };
      }
    });
  }
}

/**
 * Optimized transport bridge for raw TransformStream
 */
class HonoSseTransport {
  private writer?: WritableStreamDefaultWriter<any>;
  private encoder?: TextEncoder;
  public onmessage?: (message: any) => void;

  constructor(private sessionId: string) {}

  setWriter(writer: WritableStreamDefaultWriter<any>, encoder: TextEncoder) {
    this.writer = writer;
    this.encoder = encoder;
  }

  async send(message: any) {
    if (this.writer && this.encoder) {
      const data = `event: message\ndata: ${JSON.stringify(message)}\n\n`;
      await this.writer.write(this.encoder.encode(data));
    }
  }

  async close() {}
}

/**
 * Main Worker Orchestrator
 */
const getCorsHeaders = (cOrReq: any) => {
  // Defensive header extraction for Hono Context vs standard Request
  let origin: string | null = null;
  if (cOrReq instanceof Request) {
    origin = cOrReq.headers.get("Origin");
  } else if (cOrReq && cOrReq.req && typeof cOrReq.req.header === "function") {
    origin = cOrReq.req.header("Origin");
  }

  const isAllowed = origin && (origin.endsWith("claude.ai") || origin.endsWith("cursor.com") || origin.endsWith("cursor.ai") || origin.endsWith("adore.workers.dev") || origin.endsWith("xiaoflow.com"));
  
  // SECURE CORS: Wildcard "*" + Credentials "true" is an invalid state rejected by modern browsers/IDEs.
  const allowedOrigin = isAllowed ? origin : "*";
  const allowCredentials = isAllowed ? "true" : "false";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-mcp-session-id",
    "Access-Control-Expose-Headers": "Content-Type, x-mcp-session-id",
    "Access-Control-Allow-Credentials": allowCredentials,
  };
};

/**
 * Hono Orchestrator for secondary routes (Health, Diagnostics)
 */
const app = new Hono<{ Bindings: { MCP_SESSION: DurableObjectNamespace } }>();

app.get("/", async (c) => {
    try {
        const id = c.env.MCP_SESSION.newUniqueId();
        const obj = c.env.MCP_SESSION.get(id);
        const res = await obj.fetch(new Request("https://mcp.xiaoflow.com/health"));
        const data: any = await res.json();
        return c.json({
            status: "Xiaoflow MCP is Online",
            worker: "OnlineV2",
            durableObject: "Active",
            sessionId: data.sessionId,
            instructions: "Connect to /sse?key=YOUR_KEY",
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

        // 1. Handle Core MCP Routes (/sse and /messages) directly to bypass Hono middleware
        if (pathname === "/sse" || pathname === "/messages") {
            const sessionId = url.searchParams.get("sessionId");
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

        // 2. Pass everything else to the Hono app (Health checks, etc.)
        return app.fetch(request, env, ctx);
    }
};
