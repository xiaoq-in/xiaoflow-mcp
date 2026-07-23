#!/usr/bin/env node
import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

function brandQueryParam(brand: unknown): 0 | 1 {
  if (brand === 1 || brand === "1" || brand === true) return 1;
  return 0;
}

function apiQueryParams(args: Record<string, unknown>): Record<string, unknown> {
  const { brand, domain, site, keywords, ...rest } = args;
  const params: Record<string, unknown> = { ...rest };
  if (brand !== undefined) params.brand = brandQueryParam(brand);
  return params;
}

function normalizeDomainInput(raw: string): string {
  const s = raw.trim();
  try {
    if (s.includes("://")) return new URL(s).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    // Fall through to plain domain normalization.
  }
  return s.replace(/^www\./i, "").toLowerCase();
}

function createXiaoflowServer(apiKey: string, apiUrl: string): Server {
  const server = new Server(
    { name: "xiaoflow-mcp-server", version: "1.3.0" },
    { capabilities: { tools: {} } }
  );

  const axiosInstance = axios.create({
    baseURL: apiUrl,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    params: {
      expanded: "true",
      limit: 1000,
    },
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "discover_keywords",
        description: "Generate keyword ideas from keyword, URL, or domain seeds (Google Ads discovery).",
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
              description: "List of keywords to analyze.",
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
          const response = await axiosInstance.get("/api/v1/keywords", {
            params: apiQueryParams(toolArgs),
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
          const response = await axiosInstance.get(
            `/api/v1/keywords/${encodeURIComponent(String(slug))}/history`,
            { params: apiQueryParams(rest) }
          );
          return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
        }
        case "bulk_keyword_lookup": {
          const response = await axiosInstance.post("/api/v1/keywords/bulk", toolArgs);
          return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
        }
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    } catch (error: any) {
      if (error instanceof McpError) throw error;
      const errorMsg =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        "Unknown API error";
      return {
        content: [{ type: "text", text: `XiaoFlow API Error: ${errorMsg}` }],
        isError: true,
      };
    }
  });

  return server;
}

async function main() {
  const apiKey = process.env.XIAOFLOW_API_KEY || process.env.XIAOFLOW_MCP_API_KEY || "";
  const apiUrl = process.env.XIAOFLOW_API_URL || "https://api.xiaoflow.com";

  if (!apiKey) {
    console.error(
      "XIAOFLOW_API_KEY is not set. Create one at https://www.xiaoflow.com/user/api-keys or use login authorization to obtain a token."
    );
  }

  const server = createXiaoflowServer(apiKey, apiUrl);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Failed to start XiaoFlow MCP server:", error);
  process.exit(1);
});
