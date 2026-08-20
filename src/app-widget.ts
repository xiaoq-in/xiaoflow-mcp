export const MCP_APP_HTML_WIDGET = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>XiaoFlow Keyword Intelligence</title>
  <style>
    :root {
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      --bg: #ffffff;
      --panel: #ffffff;
      --border: #e2e8f0;
      --ink: #0f172a;
      --muted: #64748b;
      --brand: #2563eb;
      --brand-bg: #eff6ff;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #09090b;
        --panel: #121215;
        --border: #27272a;
        --ink: #f4f4f5;
        --muted: #a1a1aa;
        --brand: #3b82f6;
        --brand-bg: #1e293b;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font);
      background-color: var(--bg);
      color: var(--ink);
      padding: 14px;
      line-height: 1.4;
      font-size: 13px;
      -webkit-font-smoothing: antialiased;
    }
    .container {
      max-width: 960px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .brand-link {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
      color: inherit;
      transition: opacity 0.15s;
    }
    .brand-link:hover { opacity: 0.85; }
    .logo-box {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: linear-gradient(135deg, #2563eb, #7c3aed);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 15px;
      box-shadow: 0 2px 6px rgba(37,99,235,0.25);
    }
    .title-box h2 {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--ink);
    }
    .title-box p {
      font-size: 11px;
      color: var(--muted);
    }
    .btn-link {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 12px;
      font-weight: 600;
      color: var(--brand);
      text-decoration: none;
      padding: 6px 12px;
      border-radius: 6px;
      background: var(--brand-bg);
      transition: opacity 0.15s;
    }
    .btn-link:hover { opacity: 0.85; }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
    }
    @media (max-width: 600px) {
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
    }
    .kpi-card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .kpi-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
    }
    .kpi-val {
      font-size: 18px;
      font-weight: 800;
      color: var(--ink);
      letter-spacing: -0.02em;
    }
    .kpi-val.mono { font-family: var(--mono); }
    .kpi-tag {
      font-size: 10px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
      width: fit-content;
      margin-top: 2px;
    }
    .tag-blue { background: #eff6ff; color: #2563eb; }
    .tag-green { background: #f0fdf4; color: #16a34a; }
    .tag-amber { background: #fffbeb; color: #d97706; }
    .tag-purple { background: #faf5ff; color: #9333ea; }
    .chart-card {
      padding: 14px 16px;
    }
    .chart-title {
      font-size: 12px;
      font-weight: 700;
      color: var(--ink);
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .chart-wrapper {
      position: relative;
      width: 100%;
      height: 170px;
    }
    .trend-svg {
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .table-card {
      padding: 0;
      overflow: hidden;
    }
    .table-head-bar {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .table-head-bar h3 {
      font-size: 12px;
      font-weight: 700;
    }
    .table-head-bar span {
      font-size: 11px;
      color: var(--muted);
    }
    .table-scroll {
      max-height: 400px;
      overflow-y: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 12px;
    }
    th {
      position: sticky;
      top: 0;
      background: var(--panel);
      padding: 8px 12px;
      font-weight: 700;
      color: var(--muted);
      border-bottom: 1px solid var(--border);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      z-index: 2;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
      transition: background 0.15s, color 0.15s;
    }
    th:hover {
      background: rgba(0,0,0,0.03);
      color: var(--ink);
    }
    .th-content {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .sort-icon {
      font-size: 10px;
      opacity: 0.4;
      transition: opacity 0.15s;
    }
    th.active-sort .sort-icon {
      opacity: 1;
      color: var(--brand);
      font-weight: 800;
    }
    th.active-sort {
      color: var(--brand);
    }
    td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: rgba(0,0,0,0.02); }
    .td-kw { font-weight: 700; color: var(--ink); }
    .kw-table-link {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: var(--brand);
      text-decoration: none;
      font-weight: 700;
      transition: color 0.15s;
    }
    .kw-table-link:hover {
      text-decoration: underline;
      color: #1d4ed8;
    }
    .kw-ext-icon {
      opacity: 0.5;
      transition: opacity 0.15s;
    }
    .kw-table-link:hover .kw-ext-icon {
      opacity: 1;
    }
    .td-vol { font-family: var(--mono); font-weight: 700; color: var(--brand); }
    .td-num { font-family: var(--mono); color: var(--muted); }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 9px;
      font-weight: 700;
    }
    .table-footer-bar {
      padding: 12px 16px;
      border-top: 1px solid var(--border);
      background: var(--brand-bg);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
    }
    .table-footer-info {
      font-size: 11px;
      font-weight: 600;
      color: var(--muted);
    }
    .btn-footer-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 700;
      color: var(--brand);
      text-decoration: none;
      padding: 6px 14px;
      border-radius: 6px;
      background: #ffffff;
      border: 1px solid var(--border);
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
      transition: all 0.15s;
    }
    .btn-footer-link:hover {
      background: var(--brand);
      color: #ffffff;
      border-color: var(--brand);
    }
  </style>
</head>
<body>
  <div class="container" id="app">
    <div class="card header">
      <a href="https://www.xiaoflow.com" target="_blank" class="brand-link" title="Visit XiaoFlow.com">
        <div class="logo-box">X</div>
        <div class="title-box">
          <h2 id="kw-title">XiaoFlow Intelligence</h2>
          <p id="kw-sub">Google Keyword Planner Intelligence &bull; 48M Analytics</p>
        </div>
      </a>
      <a id="btn-web-link" href="https://www.xiaoflow.com" target="_blank" class="btn-link">
        <span>View Full Analysis</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </a>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Monthly Volume</div>
        <div class="kpi-val" id="kpi-volume">-</div>
        <span class="kpi-tag tag-blue">Search Demand</span>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">CPC Bid Range</div>
        <div class="kpi-val mono" id="kpi-cpc">-</div>
        <span class="kpi-tag tag-green">Google Ads</span>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Competition</div>
        <div class="kpi-val" id="kpi-comp">-</div>
        <span class="kpi-tag tag-amber" id="kpi-comp-badge">Index</span>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">YoY Growth</div>
        <div class="kpi-val" id="kpi-yoy">-</div>
        <span class="kpi-tag tag-purple">48M Trend</span>
      </div>
    </div>

    <div class="card chart-card">
      <div class="chart-title">
        <span>48-Month Search Volume History</span>
        <span id="chart-range" style="font-size: 11px; color: var(--muted); font-weight: 500;"></span>
      </div>
      <div class="chart-wrapper" id="chart-container">
        <svg class="trend-svg" id="trend-svg" preserveAspectRatio="none" viewBox="0 0 800 200"></svg>
      </div>
    </div>

    <div class="card table-card">
      <div class="table-head-bar">
        <h3>Related Keyword Opportunities</h3>
        <span id="table-count">0 keywords</span>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th onclick="handleSort('k')" id="th-k">
                <div class="th-content"><span>Keyword</span><span class="sort-icon">⇅</span></div>
              </th>
              <th onclick="handleSort('v')" id="th-v" class="active-sort">
                <div class="th-content"><span>Search Volume</span><span class="sort-icon">▼</span></div>
              </th>
              <th onclick="handleSort('l')" id="th-l">
                <div class="th-content"><span>Low Bid</span><span class="sort-icon">⇅</span></div>
              </th>
              <th onclick="handleSort('h')" id="th-h">
                <div class="th-content"><span>High Bid</span><span class="sort-icon">⇅</span></div>
              </th>
              <th onclick="handleSort('i')" id="th-i">
                <div class="th-content"><span>Competition</span><span class="sort-icon">⇅</span></div>
              </th>
              <th onclick="handleSort('y')" id="th-y">
                <div class="th-content"><span>YoY Change</span><span class="sort-icon">⇅</span></div>
              </th>
              <th onclick="handleSort('it')" id="th-it">
                <div class="th-content"><span>Intent</span><span class="sort-icon">⇅</span></div>
              </th>
            </tr>
          </thead>
          <tbody id="kw-tbody"></tbody>
        </table>
      </div>
      <div class="table-footer-bar">
        <span class="table-footer-info" id="footer-count-text">Showing Top 100 high-intent keyword opportunities</span>
        <a id="btn-view-all" href="https://www.xiaoflow.com" target="_blank" class="btn-footer-link">
          <span>View All Related Keywords on XiaoFlow</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </a>
      </div>
    </div>
  </div>

  <script>
    var currentSortKey = "v";
    var currentSortDir = "desc";
    var cachedData = [];

    function toSlug(s) {
      if (!s) return "overview";
      return String(s)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "overview";
    }

    function parseData(raw) {
      if (!raw) {
        if (typeof window !== "undefined" && window.__INITIAL_DATA__) return parseData(window.__INITIAL_DATA__);
        return [];
      }
      if (typeof raw === "string") {
        try {
          var p = JSON.parse(raw);
          var res = parseData(p);
          if (res && res.length > 0) return res;
        } catch (e) {}
        return [];
      }
      if (Array.isArray(raw)) return raw;
      if (raw.structuredContent) {
        var r1 = parseData(raw.structuredContent);
        if (r1 && r1.length > 0) return r1;
      }
      if (raw.results) {
        var r2 = parseData(raw.results);
        if (r2 && r2.length > 0) return r2;
      }
      if (raw.data) {
        var r3 = parseData(raw.data);
        if (r3 && r3.length > 0) return r3;
      }
      if (raw.params) {
        var r4 = parseData(raw.params.data || raw.params);
        if (r4 && r4.length > 0) return r4;
      }
      if (raw.toolResult) {
        var r5 = parseData(raw.toolResult);
        if (r5 && r5.length > 0) return r5;
      }
      if (raw.toolOutput) {
        var r6 = parseData(raw.toolOutput);
        if (r6 && r6.length > 0) return r6;
      }
      if (raw.result) {
        var r7 = parseData(raw.result);
        if (r7 && r7.length > 0) return r7;
      }
      if (raw.payload) {
        var r8 = parseData(raw.payload);
        if (r8 && r8.length > 0) return r8;
      }
      if (raw.content && Array.isArray(raw.content)) {
        for (var i = 0; i < raw.content.length; i++) {
          var item = raw.content[i];
          if (item && item.text) {
            var parsed = parseData(item.text);
            if (parsed && parsed.length > 0) return parsed;
          }
        }
      }
      if (raw.k || raw.keyword || raw.v || raw.search_volume) return [raw];
      return [];
    }

    function handleSort(key) {
      if (currentSortKey === key) {
        currentSortDir = currentSortDir === "desc" ? "asc" : "desc";
      } else {
        currentSortKey = key;
        currentSortDir = (key === "k" || key === "it") ? "asc" : "desc";
      }
      updateSortHeaderIcons();
      renderTableRows();
    }

    function updateSortHeaderIcons() {
      var keys = ["k", "v", "l", "h", "i", "y", "it"];
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var th = document.getElementById("th-" + k);
        if (th) {
          var icon = th.querySelector(".sort-icon");
          if (k === currentSortKey) {
            th.classList.add("active-sort");
            if (icon) icon.textContent = currentSortDir === "asc" ? "▲" : "▼";
          } else {
            th.classList.remove("active-sort");
            if (icon) icon.textContent = "⇅";
          }
        }
      }
    }

    function renderTableRows() {
      var tbody = document.getElementById("kw-tbody");
      if (!tbody || !cachedData || cachedData.length === 0) return;

      var topList = cachedData.slice(0, 100);

      // Sort items
      topList.sort(function(a, b) {
        var valA = getSortValue(a, currentSortKey);
        var valB = getSortValue(b, currentSortKey);
        if (typeof valA === "string") {
          return currentSortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return currentSortDir === "asc" ? (valA - valB) : (valB - valA);
      });

      tbody.innerHTML = "";
      for (var j = 0; j < topList.length; j++) {
        var kw = topList[j];
        var kName = kw.k || kw.keyword || "";
        var kwSlug = toSlug(kw.k || kw.keyword || kName);
        var kVol = Number(kw.v ?? kw.search_volume ?? kw.avg_monthly_searches ?? 0).toLocaleString();
        var kLow = Number(kw.l ?? kw.top_of_page_bid_low ?? 0).toFixed(2);
        var kHigh = Number(kw.h ?? kw.top_of_page_bid_high ?? 0).toFixed(2);
        var kComp = String(kw.co ?? kw.competition ?? "HIGH");
        var kCompIdx = Number(kw.i ?? kw.competition_index ?? 0);
        var kYoy = Number(kw.y ?? kw.yoy_change ?? kw.yoy_growth_percent ?? 0);
        var kIntent = String(kw.it ?? kw.intent ?? "commercial");

        var compText = kComp + (kCompIdx > 0 ? " (" + kCompIdx + ")" : "");
        var yoyText = (kYoy > 0 ? "+" : "") + kYoy + "%";

        var tr = document.createElement("tr");
        tr.innerHTML = '<td class="td-kw">' +
          '<a href="https://www.xiaoflow.com/keywords/' + kwSlug + '" target="_blank" class="kw-table-link">' +
            '<span>' + kName + '</span>' +
            '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="kw-ext-icon"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>' +
          '</a>' +
        '</td>' +
        '<td class="td-vol">' + kVol + '</td>' +
        '<td class="td-num">$' + kLow + '</td>' +
        '<td class="td-num">$' + kHigh + '</td>' +
        '<td><span class="badge" style="background:#f1f5f9; color:#334155;">' + compText + '</span></td>' +
        '<td class="td-num" style="font-weight:600; color:' + (kYoy > 0 ? "#16a34a" : (kYoy < 0 ? "#dc2626" : "var(--muted)")) + '">' + yoyText + '</td>' +
        '<td><span class="badge tag-blue">' + kIntent + '</span></td>';
        tbody.appendChild(tr);
      }
    }

    function getSortValue(item, key) {
      if (key === "k") return String(item.k || item.keyword || "").toLowerCase();
      if (key === "v") return Number(item.v ?? item.search_volume ?? item.avg_monthly_searches ?? 0);
      if (key === "l") return Number(item.l ?? item.top_of_page_bid_low ?? 0);
      if (key === "h") return Number(item.h ?? item.top_of_page_bid_high ?? 0);
      if (key === "i") return Number(item.i ?? item.competition_index ?? 0);
      if (key === "y") return Number(item.y ?? item.yoy_change ?? item.yoy_growth_percent ?? 0);
      if (key === "it") return String(item.it ?? item.intent ?? "").toLowerCase();
      return 0;
    }

    function renderDashboard(input) {
      try {
        var data = parseData(input);
        if (!data || !Array.isArray(data) || data.length === 0) return;
        cachedData = data;

        var main = data[0] || {};
        var kwName = main.k || main.keyword || "Keyword Overview";
        var vol = Number(main.v ?? main.search_volume ?? main.avg_monthly_searches ?? 0);
        var low = Number(main.l ?? main.top_of_page_bid_low ?? 0);
        var high = Number(main.h ?? main.top_of_page_bid_high ?? 0);
        var comp = String(main.co ?? main.competition ?? "HIGH");
        var compIdx = Number(main.i ?? main.competition_index ?? 88);
        var yoy = Number(main.y ?? main.yoy_change ?? 0);
        var history = main.t || main.history || [];

        var elTitle = document.getElementById("kw-title");
        if (elTitle) elTitle.textContent = kwName;

        var slug = toSlug(main.k || main.keyword || kwName);
        var detailUrl = "https://www.xiaoflow.com/keywords/" + slug;

        var elLink = document.getElementById("btn-web-link");
        if (elLink) elLink.href = detailUrl;

        var elViewAll = document.getElementById("btn-view-all");
        if (elViewAll) elViewAll.href = detailUrl;

        var elVol = document.getElementById("kpi-volume");
        if (elVol) elVol.textContent = vol.toLocaleString();

        var elCpc = document.getElementById("kpi-cpc");
        if (elCpc) elCpc.textContent = "$" + low.toFixed(2) + " - $" + high.toFixed(2);

        var elComp = document.getElementById("kpi-comp");
        if (elComp) elComp.textContent = comp;

        var elBadge = document.getElementById("kpi-comp-badge");
        if (elBadge) elBadge.textContent = compIdx + "/100 Index";

        var elYoy = document.getElementById("kpi-yoy");
        if (elYoy) elYoy.textContent = (yoy > 0 ? "+" : "") + yoy + "%";

        renderSvgChart(history);

        var elCount = document.getElementById("table-count");
        if (elCount) elCount.textContent = Math.min(data.length, 100) + " keywords";

        var elFooterText = document.getElementById("footer-count-text");
        if (elFooterText) elFooterText.textContent = "Showing Top " + Math.min(data.length, 100) + " high-intent keyword opportunities";

        renderTableRows();
      } catch (err) {
        console.error("XiaoFlow Widget Render Error:", err);
      }
    }

    function renderSvgChart(history) {
      try {
        var svg = document.getElementById("trend-svg");
        if (!svg) return;
        if (!history || history.length < 2) {
          svg.innerHTML = '<text x="400" y="100" text-anchor="middle" fill="#94a3b8" font-size="12">Search volume trend data unavailable</text>';
          return;
        }

        var W = 800, H = 200, padT = 20, padB = 30, padL = 45, padR = 20;
        var plotW = W - padL - padR;
        var plotH = H - padT - padB;

        var vals = [];
        for (var i = 0; i < history.length; i++) {
          vals.push(Number(history[i].v ?? history[i].search_volume ?? 0));
        }
        var minV = Math.min.apply(null, vals) * 0.9;
        var maxV = Math.max.apply(null, vals.concat([100])) * 1.08;

        var points = [];
        for (var k = 0; k < history.length; k++) {
          var x = padL + (k / (history.length - 1)) * plotW;
          var val = Number(history[k].v ?? history[k].search_volume ?? 0);
          var y = padT + (1 - (val - minV) / (maxV - minV)) * plotH;
          var dateStr = (history[k].y ? String(history[k].y).slice(-2) : "25") + "/" + String(history[k].m || 1).padStart(2, "0");
          points.push({ x: x, y: y, val: val, date: dateStr });
        }

        var pathD = "M " + points[0].x + " " + points[0].y;
        for (var m = 0; m < points.length - 1; m++) {
          var p0 = points[m];
          var p1 = points[m + 1];
          var mx = (p0.x + p1.x) / 2;
          pathD += " C " + mx + " " + p0.y + ", " + mx + " " + p1.y + ", " + p1.x + " " + p1.y;
        }

        var fillD = pathD + " L " + points[points.length - 1].x + " " + (H - padB) + " L " + points[0].x + " " + (H - padB) + " Z";

        var gridSvg = "";
        for (var g = 0; g <= 3; g++) {
          var gy = padT + (g / 3) * plotH;
          var gVal = Math.round(maxV - (g / 3) * (maxV - minV));
          gridSvg += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4"/>';
          gridSvg += '<text x="' + (padL - 8) + '" y="' + (gy + 4) + '" text-anchor="end" fill="#94a3b8" font-size="10" font-family="monospace">' + (gVal >= 1000 ? (gVal/1000).toFixed(0) + "k" : gVal) + '</text>';
        }

        var labelsSvg = "";
        var step = Math.max(1, Math.floor(points.length / 8));
        for (var n = 0; n < points.length; n++) {
          if (n % step === 0 || n === points.length - 1) {
            labelsSvg += '<text x="' + points[n].x + '" y="' + (H - 10) + '" text-anchor="middle" fill="#64748b" font-size="10" font-family="monospace">' + points[n].date + '</text>';
          }
        }

        var dotsSvg = "";
        for (var d = 0; d < points.length; d++) {
          dotsSvg += '<circle cx="' + points[d].x + '" cy="' + points[d].y + '" r="3.5" fill="#2563eb" stroke="#ffffff" stroke-width="2"><title>' + points[d].date + ": " + points[d].val.toLocaleString() + '</title></circle>';
        }

        svg.innerHTML = '<defs>' +
          '<linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#2563eb" stop-opacity="0.22"/>' +
            '<stop offset="100%" stop-color="#2563eb" stop-opacity="0.01"/>' +
          '</linearGradient>' +
        '</defs>' +
        gridSvg +
        '<path d="' + fillD + '" fill="url(#chartGrad)"/>' +
        '<path d="' + pathD + '" fill="none" stroke="#2563eb" stroke-width="3" stroke-linecap="round"/>' +
        dotsSvg +
        labelsSvg;

        if (points.length > 0) {
          var elRange = document.getElementById("chart-range");
          if (elRange) elRange.textContent = points[0].date + " - " + points[points.length - 1].date;
        }
      } catch (err) {
        console.error("XiaoFlow Chart Render Error:", err);
      }
    }

    // Message & event listeners
    window.addEventListener("message", function(e) {
      if (!e) return;
      var d = e.data;
      if (!d) return;
      if (typeof d === "string") {
        try { d = JSON.parse(d); } catch (err) {}
      }
      renderDashboard(d);
    });

    function checkGlobals() {
      try {
        if (typeof window !== "undefined") {
          if (window.__INITIAL_DATA__) renderDashboard(window.__INITIAL_DATA__);
          if (window.openai) {
            if (typeof window.openai.onData === "function") {
              window.openai.onData(function(data) { renderDashboard(data); });
            }
            if (typeof window.openai.onToolResult === "function") {
              window.openai.onToolResult(function(data) { renderDashboard(data); });
            }
            if (typeof window.openai.subscribe === "function") {
              window.openai.subscribe(function(data) { renderDashboard(data); });
            }
            if (window.openai.toolResult) renderDashboard(window.openai.toolResult);
            if (window.openai.toolOutput) renderDashboard(window.openai.toolOutput);
            if (window.openai.data) renderDashboard(window.openai.data);
          }
        }
      } catch (e) {}
    }

    checkGlobals();
    var pollCount = 0;
    var interval = setInterval(function() {
      checkGlobals();
      if (pollCount++ > 40) {
        clearInterval(interval);
      }
    }, 200);

    // Handshake
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "ready" }, "*");
        window.parent.postMessage({ type: "openai:ready" }, "*");
        window.parent.postMessage({ jsonrpc: "2.0", method: "ui/ready" }, "*");
        window.parent.postMessage({ jsonrpc: "2.0", method: "ui/notifications/ready" }, "*");
      }
    } catch (err) {}
  </script>
</body>
</html>`;
