function toSlug(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "overview";
}

export function buildSparkline(history?: Array<{ v: number }>): string {
  if (!history || history.length === 0) return "";
  const values = history.map(h => h.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return "▅".repeat(Math.min(values.length, 12));
  const chars = [" ", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  return values.map(v => {
    const idx = Math.min(chars.length - 1, Math.max(0, Math.floor(((v - min) / (max - min)) * (chars.length - 1))));
    return chars[idx];
  }).join("");
}

export function buildChartUrl(title: string, history?: Array<{ y: number; m: number; v: number }>): string {
  if (!history || history.length < 2) return "";
  const labels = history.map(h => `${h.y % 100}/${String(h.m).padStart(2, "0")}`);
  const data = history.map(h => h.v);
  const chartConfig = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Monthly Search Volume",
          data,
          borderColor: "#2563EB",
          backgroundColor: "rgba(37, 99, 235, 0.15)",
          borderWidth: 3,
          pointRadius: 4,
          pointBackgroundColor: "#2563EB",
          fill: true,
          tension: 0.35,
        },
      ],
    },
    options: {
      title: {
        display: true,
        text: `XiaoFlow • ${title} 48-Month Search Volume Trend`,
        fontColor: "#0F172A",
        fontSize: 13,
      },
      legend: { display: false },
      scales: {
        yAxes: [
          {
            ticks: {
              beginAtZero: false,
              fontColor: "#64748B",
              fontSize: 11,
              callback: (val: number) =>
                val >= 1000000
                  ? `${(val / 1000000).toFixed(1)}M`
                  : val >= 1000
                  ? `${(val / 1000).toFixed(0)}K`
                  : val,
            },
            gridLines: { color: "rgba(226, 232, 240, 0.8)" },
          },
        ],
        xAxes: [
          {
            ticks: { fontColor: "#64748B", fontSize: 11 },
            gridLines: { display: false },
          },
        ],
      },
    },
  };

  return `https://quickchart.io/chart?w=640&h=260&bkg=white&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;
}

export function formatXiaoFlowReport(data: any, toolName: string): string {
  if (!data || typeof data !== "object") {
    return JSON.stringify(data);
  }

  if (toolName === "get_quota" || data.type !== undefined && (data.remaining !== undefined || data.credits !== undefined)) {
    const type = (data.type || "standard").toUpperCase();
    const remaining = Number(data.remaining ?? data.credits ?? 0).toLocaleString();
    const used = Number(data.used ?? 0).toLocaleString();
    const limit = Number(data.limit ?? 0).toLocaleString();

    return `## 💳 XiaoFlow 账户额度与计算单元 (CU) 查询\n\n` +
      `| 账户属性 | 当前状态与配额 |\n` +
      `| :--- | :--- |\n` +
      `| 👤 **账户类型** | **${type}** |\n` +
      `| ⚡ **剩余积分 (Remaining Credits)** | **${remaining} CU** |\n` +
      `| 📊 **已消耗额度 (Used Credits)** | **${used} CU** |\n` +
      `| 🔄 **每日限额 (Daily Limit)** | **${limit} CU** |\n\n` +
      `> 💡 **计费规则**: 每次 Google Ads 关键词全量指标查询消耗 1 计算单元 (CU)。\n` +
      `> 🔗 [👉 前往 XiaoFlow 个人中心充值或升级套餐](https://www.xiaoflow.com/pricing)\n`;
  }

  let keywords: any[] = [];
  if (Array.isArray(data.data)) {
    keywords = data.data;
  } else if (Array.isArray(data.results)) {
    keywords = data.results;
  } else if (Array.isArray(data)) {
    keywords = data;
  } else if (data.keyword || data.k) {
    keywords = [data];
  }

  if (keywords.length === 0) {
    if (data.task_id || data.taskId) {
      const tid = data.task_id || data.taskId;
      const status = data.status || "pending";
      const progress = data.progress ?? 0;
      const count = data.keywords_count ?? data.found_keywords_count ?? 0;
      const seeds = Array.isArray(data.seeds) ? data.seeds.join(", ") : (data.seed || "—");

      return `## 🚀 XiaoFlow 关键词拓词挖掘任务 (#${tid})\n\n` +
        `| 任务属性 | 状态与进度 |\n` +
        `| :--- | :--- |\n` +
        `| 📋 **任务编号** | \`#${tid}\` |\n` +
        `| 🌱 **种子关键词** | **${seeds}** |\n` +
        `| ⚡ **执行状态** | **${status.toUpperCase()}** (${progress}%) |\n` +
        `| 🔍 **已发现关键词** | **${count}** 个 |\n\n` +
        `> 🔄 **轮询状态**: 调用 \`get_keyword_expansion_status(task_id=${tid})\` 可获取实时拓展进度与全量关键词数据。\n` +
        `> 🔗 [👉 前往 XiaoFlow 发现中心实时查看与导出](https://www.xiaoflow.com/user/discovery)\n`;
    }
    return JSON.stringify(data, null, 2);
  }

  const primary = keywords[0];
  const primaryName = primary.keyword || primary.k || "Keyword";
  const primarySlug = toSlug(primary.keyword || primary.k || primary.slug || primary.s || primaryName);
  const primaryVol = (primary.search_volume ?? primary.v ?? 0).toLocaleString();
  const primaryLow = primary.top_of_page_bid_low ?? primary.l ?? 0;
  const primaryHigh = primary.top_of_page_bid_high ?? primary.h ?? 0;
  const primaryComp = primary.competition ?? primary.co ?? "HIGH";
  const primaryCompIdx = primary.competition_index ?? primary.i ?? 100;
  const primaryYoY = primary.yoy_growth_percent ?? primary.y ?? 0;
  const primaryHistory = primary.history ?? primary.t ?? [];

  let report = `## 📊 XiaoFlow 数据分析看板: **${primaryName}**\n\n`;

  // Always put Chart at top
  if (primaryHistory.length >= 2) {
    const chartUrl = buildChartUrl(primaryName, primaryHistory);
    if (chartUrl) {
      report += `### 📈 48 个月搜索量历史趋势图\n`;
      report += `![${primaryName} Search Volume Trend](${chartUrl})\n\n`;
    }
  }

  report += `### 📋 核心商业与投放指标\n`;
  report += `| 指标 (Metric) | 核心数值 (Value) | 行业参考 / 评估 (Benchmark) |\n`;
  report += `| :--- | :--- | :--- |\n`;
  report += `| 🔍 **月均搜索量 (Monthly Volume)** | **${primaryVol}** /月 | 核心高频搜索需求 |\n`;
  report += `| 💵 **CPC 竞价区间 (Bid Range)** | **$${Number(primaryLow).toFixed(2)} - $${Number(primaryHigh).toFixed(2)}** | Google Ads 商业出价 |\n`;
  report += `| 🎯 **竞争度指数 (Competition)** | **${primaryComp} (${primaryCompIdx}/100)** | 投放竞争程度评估 |\n`;
  report += `| 📈 **年同比趋势 (YoY Growth)** | **${primaryYoY > 0 ? "+" : ""}${primaryYoY}%** | ${primaryYoY >= 0 ? "🔥 需求呈上升态势" : "📉 周期性平稳波动"} |\n\n`;

  if (keywords.length > 1) {
    report += `### 🎯 相关关键词与长尾商机推荐 (Top ${Math.min(keywords.length, 12)})\n\n`;
    report += `| 关键词 (Keyword) | 月搜索量 | CPC 出价区间 | 竞争度 | 12M趋势 | 意图 |\n`;
    report += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

    keywords.slice(0, 12).forEach((kw: any) => {
      const name = kw.keyword || kw.k || "";
      const vol = (kw.search_volume ?? kw.v ?? 0).toLocaleString();
      const low = Number(kw.top_of_page_bid_low ?? kw.l ?? 0).toFixed(2);
      const high = Number(kw.top_of_page_bid_high ?? kw.h ?? 0).toFixed(2);
      const comp = kw.competition ?? kw.co ?? "HIGH";
      const intent = kw.intent ?? kw.it ?? "info";
      const spark = buildSparkline(kw.history ?? kw.t);
      const intentTag = intent === "commercial" || intent === "transactional" ? "🛒 商业" : "🔍 信息";

      report += `| **${name}** | \`${vol}\` | $${low} - $${high} | ${comp} | \`${spark || "—"}\` | ${intentTag} |\n`;
    });
    report += `\n`;
  }

  report += `> 💡 **数据来源**: XiaoFlow Enterprise Google Ads Intelligence API\n`;
  report += `> 🔗 [👉 在 XiaoFlow 官网查看【${primaryName}】全量关联词与深度趋势分析](https://www.xiaoflow.com/keywords/${primarySlug})\n`;

  return report;
}
