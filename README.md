# XiaoFlow MCP Server (`xiaoflow-mcp-server`)

Official Model Context Protocol (MCP) server for **XiaoFlow AI SEO Tools** and **Etsy Market Intelligence**.

Connect Large Language Models (LLMs) such as Claude Desktop, Cursor, Windsurf, and VS Code directly to XiaoFlow's search engine optimization, keyword discovery, domain analytics, and marketplace intelligence.

---

## ✨ Features & Capabilities

- 🔍 **Keyword Discovery**: Generate high-intent search keywords and SEO ideas from keyword, URL, or domain seeds.
- 📊 **Domain Analytics**: Analyze domain-level search performance, organic traffic metrics, and keyword distributions.
- 🏷️ **Etsy Market Intelligence**: Perform deep search across Etsy shops, product listings, and market trends.
- 🛒 **Listing & Product Analysis**: Extract listing performance metrics, sales estimates, and product opportunity scores.
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

### 2. Connect via Remote SSE Endpoint

Connect directly via SSE (Server-Sent Events) in your favorite MCP client:

```text
https://mcp.xiaoflow.com/sse?key=YOUR_API_KEY
```

---

## 💻 Client Integration Guides

### Cursor Setup

Add XiaoFlow MCP to your Cursor settings (`Features -> MCP Servers -> Add new MCP server`):

- **Name**: `xiaoflow`
- **Type**: `sse`
- **URL**: `https://mcp.xiaoflow.com/sse?key=YOUR_API_KEY`

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

### Windsurf & VS Code Setup

For Remote SSE connection:

```json
{
  "mcpServers": {
    "xiaoflow": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.xiaoflow.com/sse?key=YOUR_API_KEY"]
    }
  }
}
```

---

## 🛠️ Available MCP Tools

| MCP Tool | Description | Key Input Parameters |
| :--- | :--- | :--- |
| `discover_keywords` | Discover keyword ideas and search volume data | `keyword`, `url`, `site`, `location`, `language` |
| `analyze_url` | Analyze page or domain search visibility | `url`, `site`, `brand`, `location`, `language` |
| `get_domain_stats` | Overview search metrics & traffic trends for a domain | `domain`, `brand` (required: `0`=domain, `1`=brand) |
| `list_domain_keywords` | Retrieve paginated list of domain keywords | `domain`, `brand`, `page`, `page_size` |
| `get_keyword_details` | Historical volume and trend breakdown for a keyword | `slug`, `time_range`, `location`, `language` |
| `bulk_keyword_lookup` | Retrieve volume and CPC metrics for up to 1,000 keywords | `keywords` (array of strings) |

---

## 🔑 Authentication

Obtain your API key from the [XiaoFlow MCP Dashboard](https://www.xiaoflow.com/mcp).

Supported authentication methods:
1. **Query Parameter**: Append `?key=YOUR_API_KEY` to the SSE URL.
2. **Authorization Header**: Send `Authorization: Bearer YOUR_API_KEY`.
3. **Environment Variable**: Set `XIAOFLOW_API_KEY` when running via `npx`.
4. **Web Login OAuth**: Authorize directly by logging into your [XiaoFlow.com](https://www.xiaoflow.com/mcp) account.

---

## 📄 License

MIT © [XiaoFlow](https://www.xiaoflow.com)
