# MCP servers (xiaoflow.com repo)

本仓库内自带的 MCP 源码放在 **`mcp/`**（子目录 = 可选的本地辅助包）。

**用户侧**：Etsy / 关键词等能力一律通过产品上 **[MCP](https://www.xiaoflow.com/en/mcp)**（如 `/zh-CN/mcp`）里与 **keywords 相同的方式** 接入——**SSE 远端桥**（`…/sse?key=…`）+ **`npx mcp-remote …`**（或 Cursor 一键安装）。

| 包 | 说明 |
|----|------|
| [`user-xiaoflow-etsy/`](./user-xiaoflow-etsy/README.md) | 仓库内可选用 stdio 实现（开发与高级场景）；产品上**不推荐**单独再配一层 GitHub/stdio Etsy 代理 — 请与 keyword MCP **同一套 SSE 流程**。 |

远端 **`user-xiaoflow`** 若在单独仓库部署，仍按 Cursor 中的 **SSE** 配置即可。

### API 映射（v1.3）

| MCP 工具 | HTTP |
|----------|------|
| `discover_keywords` | `GET /api/keywords` |
| `analyze_url`（`site`） | `GET /api/websites?site=&brand=0\|1` |
| `analyze_url`（`url`） | `GET /api/keywords` |
| `get_domain_stats` | `GET /api/websites/:domain?brand=0\|1` |
| `list_domain_keywords` | `GET /api/websites/:domain/keywords?brand=0\|1` |

`brand=0` 为站点域名关键词视图；`brand=1` 为品牌（keyword+url seed）视图。指标与 `t` 趋势均来自 MySQL。

构建部署：`cd mcp && npm run build && npm run deploy`
