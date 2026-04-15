# Xiaoflow MCP Server

Integrate Xiaoflow's powerful SEO and keyword analysis tools directly into your AI agents (like Claude Desktop) using the Model Context Protocol (MCP).

## Features

- **Keyword Discovery**: Generate high-potential keyword ideas from seeds.
- **URL Analysis**: Analyze any website to see its ranking keywords.
- **Domain Stats**: Get traffic and search volume overview for any domain.
- **Trend Data**: Fetch historical search volume performance.

## Deployment to Cloudflare Workers

You can host this MCP server on Cloudflare Workers for remote access from any AI agent.

### 1. Prerequisites
- A Cloudflare account and `wrangler` CLI installed.
- A custom domain (e.g., `mcp.xiaoflow.com`) added to your Cloudflare account.

### 2. Configure Domain
Update `wrangler.toml` if you want to use a different domain than `mcp.xiaoflow.com`:
```toml
route = { pattern = "your-domain.com/*", custom_domain = true }
```

### 3. Set API Key Secret
The `XIAOFLOW_API_KEY` should be set as a Cloudflare secret:
```bash
wrangler secret put XIAOFLOW_API_KEY
```

### 4. Deploy
```bash
npm run deploy
```

## Integration with AI Agents

### Local (Claude Desktop)
Add this to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "xiaoflow-local": {
      "command": "node",
      "args": ["/path/to/mcp/build/index.js"],
      "env": {
        "XIAOFLOW_API_KEY": "..."
      }
    }
  }
}
```

### Remote (SSE)
To connect to your globally deployed server:
```json
{
  "mcpServers": {
    "xiaoflow-remote": {
      "url": "https://mcp.xiaoflow.com/sse"
    }
  }
}
```

## Tools
...

### `discover_keywords`
- `keyword` (string, required): Seed keyword.
- `location` (string, optional): GeoTarget ID.
- `language` (string, optional): Language ID.

### `analyze_url`
- `url` (string, required): Website URL.

### `get_domain_stats`
- `domain` (string, required): Domain name.

### `get_keyword_details`
- `slug` (string, required): Keyword slug.
- `time_range` (string, optional): "12m", "24m", or "48m".
