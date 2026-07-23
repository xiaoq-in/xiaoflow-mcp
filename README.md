# XiaoFlow MCP Server (`xiaoflow-mcp-server`)

[![xiaoflow-mcp MCP server](https://glama.ai/mcp/servers/xiaoq-in/xiaoflow-mcp/badges/score.svg)](https://glama.ai/mcp/servers/xiaoq-in/xiaoflow-mcp)
[![xiaoflow-mcp MCP server](https://glama.ai/mcp/servers/xiaoq-in/xiaoflow-mcp/badges/card.svg)](https://glama.ai/mcp/servers/xiaoq-in/xiaoflow-mcp)

Official Model Context Protocol (MCP) server for **XiaoFlow AI SEO and keyword intelligence tools**.

Connect Large Language Models (LLMs) such as Claude Desktop, Cursor, Windsurf, and VS Code directly to XiaoFlow's search engine optimization, keyword discovery, and domain analytics.

## Official listings

- [npm — `xiaoflow-mcp-server`](https://www.npmjs.com/package/xiaoflow-mcp-server)
- [Smithery — `xiaoflow/xiaoflow-mcp`](https://smithery.ai/servers/xiaoflow/xiaoflow-mcp)
- [Glama — `xiaoq-in/xiaoflow-mcp`](https://glama.ai/mcp/servers/xiaoq-in/xiaoflow-mcp)
- [GitHub — `xiaoq-in/xiaoflow-mcp`](https://github.com/xiaoq-in/xiaoflow-mcp)
- [Full setup guide and prompt templates](https://www.xiaoflow.com/mcp)

---

## ✨ Features & Capabilities

- 🔍 **Keyword Discovery**: Generate high-intent search keywords and SEO ideas from keyword, URL, or domain seeds.
- 📊 **Domain Analytics**: Analyze domain-level search performance, organic traffic metrics, and keyword distributions.
- 📈 **Search Trend Analysis**: Compare keyword demand, competition, CPC, and historical trends.
- 🔒 **Flexible Authentication**: Supports API Key authentication via query parameters (`?key=`), Bearer tokens, environment variables, or Web OAuth login.

---

## ⚡ Quick Start

### 1. Run via `npx` (stdio)

Run the server directly using `npx`:

```bash
npx -y xiaoflow-mcp-server
```

Pass your XiaoFlow API key via environment variable:

```bash
XIAOFLOW_API_KEY="YOUR_API_KEY" npx -y xiaoflow-mcp-server
```

---

### 2. Connect via Streamable HTTP with web login (recommended)

Use the canonical remote endpoint in clients that support remote MCP. The client
discovers XiaoFlow OAuth automatically and opens the browser for login and consent:

```text
https://mcp.xiaoflow.com/mcp
```

Legacy clients can still use `https://mcp.xiaoflow.com/sse?key=YOUR_API_KEY`.

---

## 💻 Client Integration Guides

### Cursor Setup

Add XiaoFlow MCP to Cursor:

- **Name**: `xiaoflow`
- **Type**: `http`
- **URL**: `https://mcp.xiaoflow.com/mcp`

Or click **Add to Cursor** directly on the [XiaoFlow MCP Portal](https://www.xiaoflow.com/mcp).

---

### Claude Desktop Setup

Add the following entry to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "xiaoflow": {
      "command": "npx",
      "args": ["-y", "xiaoflow-mcp-server"],
      "env": {
        "XIAOFLOW_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

---

### Windsurf, VS Code, and other remote clients

Use native HTTP configuration where available:

```json
{
  "mcpServers": {
    "xiaoflow": {
      "type": "http",
      "url": "https://mcp.xiaoflow.com/mcp"
    }
  }
}
```

For stdio-only clients, bridge to the OAuth-enabled remote endpoint:

```json
{
  "mcpServers": {
    "xiaoflow": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.xiaoflow.com/mcp"]
    }
  }
}
```

---

## 🛠️ Available MCP Tools

| MCP Tool | Description | Key Input Parameters |
| :--- | :--- | :--- |
| `get_keyword_metrics` | Exact metrics and monthly history for one keyword | `keyword`, `history_months` (1–48), `location`, `language` |
| `get_related_keywords` | Related keywords with metrics/history and unlimited pagination | `seed`, `history_months`, `page`, `page_size` (max 1,000) |
| `bulk_keyword_metrics` | Exact metrics/history for up to 1,000 keywords | `keywords`, `history_months`, `location`, `language` |
| `start_keyword_expansion` | Start round-based expansion from one or more seeds | `seeds`, `max_iterations`, include/exclude rules |
| `get_keyword_expansion_status` | Poll an expansion task and retrieve results | `task_id`, `include_results` |
| `analyze_url` | Analyze page or domain search visibility | `url`, `site`, `brand`, `location`, `language` |
| `get_domain_stats` | Overview search metrics & traffic trends for a domain | `domain`, `brand` (required: `0`=domain, `1`=brand) |
| `list_domain_keywords` | Retrieve paginated list of domain keywords | `domain`, `brand`, `page`, `page_size` |

Legacy aliases remain available for backward compatibility.

---

## 🔑 Authentication

Obtain your API key from the [XiaoFlow MCP Dashboard](https://www.xiaoflow.com/mcp).

Supported authentication methods:

1. **Web Login OAuth (recommended)**: connect to `https://mcp.xiaoflow.com/mcp`; compatible clients discover OAuth, PKCE, and dynamic client registration automatically.
2. **Environment Variable**: set `XIAOFLOW_API_KEY` when running via `npx`.
3. **Authorization Header**: send `Authorization: Bearer YOUR_API_KEY`.
4. **Legacy Query Parameter**: append `?key=YOUR_API_KEY` to the legacy SSE URL.

---

## 📄 License

MIT © [XiaoFlow](https://www.xiaoflow.com)
