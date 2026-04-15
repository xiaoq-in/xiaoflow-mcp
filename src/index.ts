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
    const pathname = url.pathname;
    const method = request.method;

    console.log(`[DO ${this.ctx.id}] ${method} ${pathname}`);

    // CORS Headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    };

    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // SSE Handshake
    if (pathname === "/sse" && method === "GET") {
      const apiKey = url.searchParams.get("key") || this.env.XIAOFLOW_API_KEY;
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
          const endpointData = `event: endpoint\ndata: ${finalBaseUrl}/messages?sessionId=${sessionId}\n\n`;
          await writer.write(encoder.encode(endpointData));

          if (this.server && this.transport) {
            await this.server.connect(this.transport as any);
          }

          // Keep-alive loop
          while (true) {
            await new Promise(resolve => setTimeout(resolve, 20000));
            await writer.write(encoder.encode(": keep-alive\n\n"));
          }
        } catch (e) {
          console.error("[DO Stream Error]", e);
        } finally {
          await writer.close();
        }
      };

      // Start the stream task without awaiting it to keep the fetch active
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

    // Message Input (POST from Cursor)
    if (pathname === "/messages" && method === "POST") {
      if (!this.transport || !this.server) {
        return new Response("Session not initialized", { status: 410, headers: corsHeaders });
      }

      try {
        const message = await request.json();
        this.transport.onmessage?.(message);
        return new Response("OK", { headers: corsHeaders });
      } catch (e) {
        return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }

  private createServerInstance(apiKey: string) {
    const server = new Server(
      { name: "xiaoflow-mcp-server", version: "1.2.0" },
      { capabilities: { tools: {} } }
    );

    const axiosInstance = axios.create({
      baseURL: this.env.XIAOFLOW_API_URL || "https://api.xiaoflow.com",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
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
const app = new Hono<{ Bindings: { MCP_SESSION: DurableObjectNamespace } }>();

app.use("*", cors());

app.get("/", (c) => c.text("Xiaoflow MCP (DO Optimized) is running."));

// Forwarding logic
const forwardToDo = async (c: any) => {
  const url = new URL(c.req.url);
  let sessionId = url.searchParams.get("sessionId");
  
  let id;
  if (sessionId) {
    id = c.env.MCP_SESSION.idFromString(sessionId);
  } else {
    id = c.env.MCP_SESSION.newUniqueId();
  }

  const obj = c.env.MCP_SESSION.get(id);
  
  // Extract public base URL and pass via header
  const baseUrl = `${url.protocol}//${url.host}`;
  const newRequest = new Request(c.req.raw);
  newRequest.headers.set("X-External-Base-Url", baseUrl);
  
  return obj.fetch(newRequest);
};

app.get("/sse", forwardToDo);
app.post("/messages", forwardToDo);

export default app;
