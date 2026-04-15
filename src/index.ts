#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { cors } from "hono/cors";
import { DurableObject } from "cloudflare:workers";

/**
 * Durable Object that maintains a single stateful MCP server session.
 * This ensures that follow-up /messages POSTs hit the same instance as the /sse GET.
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
    const app = new Hono<{ Bindings: any }>();

    // Enable CORS for all DO requests
    app.use("*", cors());

    // SSE Handshake
    app.get("/sse", async (c) => {
      const apiKey = c.req.query("key") || this.env.XIAOFLOW_API_KEY;
      const sessionId = this.ctx.id.toString();
      
      this.transport = new HonoSseTransport(sessionId);
      this.server = this.createServerInstance(apiKey);

      return streamSSE(c, async (stream) => {
        this.transport?.setStream(stream);
        
        await stream.writeSSE({
          event: "endpoint",
          data: `${url.protocol}//${url.host}/messages?sessionId=${sessionId}`,
        });

        if (this.server && this.transport) {
          await this.server.connect(this.transport as any);
        }

        // Keep-alive loop
        while (true) {
          await stream.sleep(20000);
          await stream.writeSSE({ comment: "keep-alive" });
        }
      });
    });

    // Message Input (POST from Cursor)
    app.post("/messages", async (c) => {
      if (!this.transport || !this.server) {
        return c.text("Session not initialized in this instance", 410);
      }

      const message = await c.req.json();
      this.transport.onmessage?.(message);
      return c.text("OK");
    });

    return app.fetch(request);
  }

  private createServerInstance(apiKey: string) {
    const server = new Server(
      { name: "xiaoflow-mcp-server", version: "1.1.0" },
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
    server.onerror = (error) => console.error("[DO MCP Session Error]", error);
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
      console.log(`[DO Toolbox] ${name}`, args);

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
            const response = await axiosInstance.get(`/api/keywords/${slug}`, { params });
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
 * Simple transport bridge for Hono streaming
 */
class HonoSseTransport {
  private stream?: any;
  public onmessage?: (message: any) => void;

  constructor(private sessionId: string) {}

  setStream(stream: any) { this.stream = stream; }

  async send(message: any) {
    if (this.stream) {
      await this.stream.writeSSE({
        event: "message",
        data: JSON.stringify(message),
      });
    }
  }

  async close() {}
}

/**
 * Main Worker Orchestrator
 */
const app = new Hono<{ Bindings: { MCP_SESSION: DurableObjectNamespace } }>();

// Global CORS Fix
app.use("*", cors());

app.get("/", (c) => c.text("Xiaoflow MCP (Stateful) is running."));

app.get("/sse", async (c) => {
  // Always create a new DO instance for a new SSE handshake
  const id = c.env.MCP_SESSION.newUniqueId();
  const obj = c.env.MCP_SESSION.get(id);
  return obj.fetch(c.req.raw);
});

app.post("/messages", async (c) => {
  const sessionId = c.req.query("sessionId");
  if (!sessionId) return c.text("Missing sessionId", 400);

  try {
    const id = c.env.MCP_SESSION.idFromString(sessionId);
    const obj = c.env.MCP_SESSION.get(id);
    return obj.fetch(c.req.raw);
  } catch (e) {
    return c.text("Invalid sessionId format", 400);
  }
});

export default app;
