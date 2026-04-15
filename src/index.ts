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
import dotenv from "dotenv";

dotenv.config();

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

const API_KEY = process.env.XIAOFLOW_API_KEY;
const API_BASE_URL = process.env.XIAOFLOW_API_URL || "https://api.xiaoflow.com";

// Simple transport bridge for Hono/Fetch environments
class HonoSseTransport {
  private stream?: any;
  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public onmessage?: (message: any) => void;

  constructor(private sessionId: string) {}

  setStream(stream: any) {
    this.stream = stream;
  }

  async send(message: any) {
    if (this.stream) {
      await this.stream.writeSSE({
        event: "message",
        data: JSON.stringify(message),
      });
    }
  }

  async close() {
    this.onclose?.();
  }
}

class XiaoflowMcpServer {
  private server: Server;
  private axiosInstance;
  private transports = new Map<string, HonoSseTransport>();

  constructor() {
    this.server = new Server(
      {
        name: "xiaoflow-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    this.setupHandlers();
    this.server.onerror = (error) => console.error("[MCP Error]", error);
  }

  /**
   * Defines the tools available to the MCP client.
   * Maps to Xiaoflow Core SEO endpoints:
   * - keyword discovery
   * - url analysis
   * - domain stats
   * - keyword history
   */
  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
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

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      console.log(`[MCP Tool Call] ${name}`, args);

      try {
        switch (name) {
          case "discover_keywords":
          case "analyze_url": {
            const response = await this.axiosInstance.get("/api/keywords", { params: args });
            return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
          }
          case "get_domain_stats": {
            const { domain, ...params } = args as any;
            const response = await this.axiosInstance.get(`/api/domains/${domain}`, { params });
            return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
          }
          case "get_keyword_details": {
            const { slug, ...params } = args as any;
            const response = await this.axiosInstance.get(`/api/keywords/${slug}`, { params });
            return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
          }
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error: any) {
        const errorMsg = error.response?.data?.message || error.message || "Unknown API error";
        console.error(`[MCP Tool Error] ${name}:`, errorMsg);
        
        return {
          content: [{ type: "text", text: `Xiaoflow API Error: ${errorMsg}` }],
          isError: true,
        };
      }
    });
  }

  public registerRoutes(app: Hono) {
    app.get("/sse", async (c) => {
      const sessionId = Math.random().toString(36).substring(2);
      const transport = new HonoSseTransport(sessionId);
      this.transports.set(sessionId, transport);

      return streamSSE(c, async (stream) => {
        transport.setStream(stream);
        
        // Initial MCP endpoint announcement
        const url = new URL(c.req.url);
        const baseUrl = `${url.protocol}//${url.host}`;
        await stream.writeSSE({
          event: "endpoint",
          data: `${baseUrl}/messages?sessionId=${sessionId}`,
        });

        await this.server.connect(transport as any);

        stream.onAbort(() => {
          this.transports.delete(sessionId);
          transport.close();
        });

        // Keep-alive loop
        while (this.transports.has(sessionId)) {
          await stream.sleep(20000);
          await stream.writeSSE({ comment: "keep-alive" });
        }
      });
    });

    app.post("/messages", async (c) => {
      const sessionId = c.req.query("sessionId");
      const transport = this.transports.get(sessionId || "");
      if (!transport) return c.text("Session not found", 404);

      const message = await c.req.json();
      transport.onmessage?.(message);
      return c.text("OK");
    });
  }

  async runStdio() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

const serverInstance = new XiaoflowMcpServer();
const app = new Hono();

app.get("/", (c) => c.text("Xiaoflow MCP Server is running"));

// Export for Cloudflare Workers
serverInstance.registerRoutes(app);
export default app;

// Fallback for local execution
if (typeof process !== "undefined" && process.stdout?.isTTY) {
  serverInstance.runStdio().catch(console.error);
}
