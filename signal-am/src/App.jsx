import { useState, useEffect, useRef } from "react";

const CLAUDE_API = "https://api.anthropic.com/v1/messages";

// ─────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────
const C = {
  bg: "#080a0f",
  surface: "#0f1117",
  surfaceHigh: "#161b25",
  surfaceMid: "#12161e",
  border: "#1c2235",
  borderLight: "#242a3a",
  accent: "#e8c84a",
  accentDim: "rgba(232,200,74,0.10)",
  accentGlow: "rgba(232,200,74,0.04)",
  green: "#3ecf8e",
  greenDim: "rgba(62,207,142,0.10)",
  red: "#f96b6b",
  redDim: "rgba(249,107,107,0.10)",
  blue: "#5b8af5",
  blueDim: "rgba(91,138,245,0.10)",
  purple: "#a78bfa",
  purpleDim: "rgba(167,139,250,0.10)",
  orange: "#fb923c",
  orangeDim: "rgba(251,146,60,0.10)",
  muted: "#3d4a5c",
  text: "#dde4f0",
  textDim: "#7a8ba0",
  textFaint: "#4a5568",
};

const injectStyles = () => {
  const s = document.createElement("style");
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    body { background: #080a0f; overflow-x: hidden; }
    ::-webkit-scrollbar { width: 0; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
    @keyframes slideUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
    @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    @keyframes floatDot { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
    @keyframes ripple { 0%{transform:scale(0.8);opacity:1} 100%{transform:scale(2.4);opacity:0} }
    .slide-up { animation: slideUp 0.35s cubic-bezier(.22,.68,0,1.2) forwards; }
    .pulse-dot { animation: pulse 2s ease-in-out infinite; }
    .saju-ring { animation: spin 20s linear infinite; }
    input:focus { outline: none; }
    button:active { transform: scale(0.97); }
  `;
  document.head.appendChild(s);
};

// ─────────────────────────────────────────────
// API HELPERS
// ─────────────────────────────────────────────
async function callClaude(systemPrompt, userMsg, useSearch = true) {
  const body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: "user", content: userMsg }],
  };
  if (useSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];

  const res = await fetch(CLAUDE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

const BRIEFING_SYSTEM = `You are a sharp Korean financial analyst. Use web search to get current data.
Return ONLY valid JSON (no markdown):
{
  "market": {
    "sentiment": "공포|탐욕|중립",
    "sentimentScore": <0-100>,
    "vix": "<val>",
    "dollar": "<DXY>",
    "sp500Change": "<% today>",
    "nasdaqChange": "<% today>",
    "summary": "<2 sentence Korean overview>"
  },
  "stocks": [{
    "ticker": "",
    "name": "",
    "price": "",
    "change": "",
    "changeDir": "up|down|flat",
    "signal": "매수|관망|주의|매도",
    "analystTarget": "",
    "upside": "<% upside to target>",
    "keyPoint": "<1 sentence Korean>",
    "risk": "<main risk Korean>",
    "earningDate": "<YYYY-MM-DD or null>",
    "earningDaysLeft": <number or null>
  }],
  "watchlist": [{"ticker":"","name":"","reason":"<Korean>","theme":"","change":"","changeDir":"up|down|flat"}],
  "geopolitical": {
    "riskLevel": "낮음|보통|높음|매우높음",
    "events": [{"title":"<Korean>","impact":"<Korean>","direction":"positive|negative|neutral"}]
  },
  "actionItems": [{"priority":"high|medium|low","text":"<Korean>"}],
  "portfolioSuggestion": "<2-3 sentence Korean>"
}`;

const SAJU_SYSTEM = `You are a saju (사주명리) master who integrates Korean Four Pillars of Destiny with modern stock market timing. 
Given a birth date and current date, analyze the heavenly stems (천간) and earthly branches (지지) to provide investment timing guidance.
Return ONLY valid JSON (no markdown):
{
  "sajuSummary": "<2 sentence explanation of current saju cycle in Korean>",
  "currentEnergy": "상승기|안정기|조심기|전환기",
  "energyScore": <0-100>,
  "weeklyOutlook": [
    {"day":"월","energy":"강|중|약","action":"매수|관망|매도|조심","reason":"<short Korean>"}
  ],
  "monthTiming": "<best timing this month in Korean>",
  "avoidDates": ["<date reason Korean>"],
  "favorableDates": ["<date reason Korean>"],
  "stockAlignment": [
    {"ticker":"","alignment":"높음|중간|낮음","reason":"<Korean>"}
  ],
  "overallAdvice": "<2-3 sentence Korean advice combining saju and market>"
}`;

const EARNINGS_SYSTEM = `Search the web for upcoming earnings dates and analyst estimates for the given tickers.
Return ONLY valid JSON (no markdown):
{
  "earnings": [{
    "ticker": "",
    "name": "",
    "date": "<YYYY-MM-DD>",
    "daysLeft": <number>,
    "time": "장전|장후|미정",
    "epsEstimate": "<value>",
    "epsPrev": "<prev quarter>",
    "revenueEstimate": "<value>",
    "analystSentiment": "강력매수|매수|중립|매도",
    "keyWatch": "<what to watch Korean>",
    "historicalBeat": "<beat rate % Korean>"
  }]
}`;

// ─────────────────────────────────────────────
// SHARED UI COMPONENTS
// ─────────────────────────────────────────────
const Pill = ({ text, color = C.accent, bg = C.accentDim, size = 10 }) => (
  <span style={{
    display: "inline-flex", alignItems: "center",
    padding: "3px 9px", borderRadius: 20,
    fontSize: size, fontWeight: 700, letterSpacing: "0.06em",
    color, background: bg, fontFamily: "JetBrains Mono, monospace",
    whiteSpace: "nowrap",
  }}>{text}</span>
);

const SectionLabel = ({ children }) => (
  <div style={{
    fontSize: 9, letterSpacing: "0.28em", color: C.muted,
    textTransform: "uppercase", marginBottom: 12,
    fontFamily: "JetBrains Mono, monospace",
    display: "flex", alignItems: "center", gap: 8,
  }}>
    <div style={{ width: 16, height: 1, background: C.muted }} />
    {children}
  </div>
);

const Card = ({ children, style = {}, glow }) => (
  <div style={{
    background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: 14, padding: "14px 16px", marginBottom: 10,
    boxShadow: glow ? `0 0 20px ${glow}` : "none",
    ...style,
  }}>{children}</div>
);

const Divider = () => <div style={{ height: 1, background: C.border, margin: "10px 0" }} />;

const Spinner = ({ size = 36, color = C.accent }) => (
  <div style={{
    width: size, height: size,
    border: `2px solid ${C.border}`,
    borderTop: `2px solid ${color}`,
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
  }} />
);

const signalConfig = {
  "매수": { color: C.green, bg: C.greenDim },
  "관망": { color: C.accent, bg: C.accentDim },
  "주의": { color: C.orange, bg: C.orangeDim },
  "매도": { color: C.red, bg: C.redDim },
};

const riskConfig = {
  "낮음": { color: C.green, bg: C.greenDim },
  "보통": { color: C.accent, bg: C.accentDim },
  "높음": { color: C.orange, bg: C.orangeDim },
  "매우높음": { color: C.red, bg: C.redDim },
};

// ─────────────────────────────────────────────
// BRIEFING TAB
// ─────────────────────────────────────────────
function BriefingTab({ tickers, data, loading, onLoad, error }) {
  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 20px", gap: 16 }}>
      <Spinner size={44} />
      <div style={{ color: C.textDim, fontSize: 11, letterSpacing: "0.15em", textAlign: "center", lineHeight: 1.8 }}>
        웹 검색 중...<br />최신 시장 데이터 수집 & 분석
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        {["GOOGL", "NVDA", "VIX", "CNN F&G"].map((s, i) => (
          <div key={i} style={{
            fontSize: 8, padding: "3px 7px", borderRadius: 10,
            background: C.surface, border: `1px solid ${C.border}`,
            color: C.muted, letterSpacing: "0.1em",
            animation: `pulse 1.5s ${i * 0.3}s ease-in-out infinite`,
          }}>{s}</div>
        ))}
      </div>
    </div>
  );

  if (!data) return (
    <div style={{ padding: "0 0 20px" }}>
      <Card style={{ background: `linear-gradient(135deg, ${C.surface} 0%, ${C.surfaceHigh} 100%)` }}>
        <div style={{ fontSize: 22, marginBottom: 8 }}>📡</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: "Syne, sans-serif", marginBottom: 6 }}>
          오늘의 브리핑 준비 완료
        </div>
        <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.7, marginBottom: 16 }}>
          AI가 실시간으로 웹을 검색해서<br />
          <span style={{ color: C.accent }}>구글·엔비디아</span> 맞춤 분석을 만들어줘.
        </div>
        <button onClick={onLoad} style={{
          width: "100%", padding: "14px", background: C.accent, color: C.bg,
          border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700,
          cursor: "pointer", fontFamily: "Syne, sans-serif", letterSpacing: "0.04em",
        }}>브리핑 생성하기</button>
      </Card>

      <SectionLabel>포함 항목</SectionLabel>
      {[
        ["◈", "실시간 주가 + 등락 분석"],
        ["◈", "공포·탐욕 / VIX / 달러인덱스"],
        ["◈", "애널리스트 목표가 & 괴리율"],
        ["◈", "어닝 카운트다운"],
        ["◈", "지정학 리스크 영향"],
        ["◈", "오늘의 액션 아이템"],
        ["◈", "눈여겨볼 종목 추천"],
      ].map(([icon, text], i) => (
        <div key={i} style={{
          fontSize: 12, color: C.textDim, padding: "9px 4px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex", gap: 10, alignItems: "center",
        }}>
          <span style={{ color: C.accent, fontSize: 8 }}>{icon}</span> {text}
        </div>
      ))}
      {error && <div style={{ marginTop: 16, padding: "12px", background: C.redDim, border: `1px solid ${C.red}30`, borderRadius: 10, fontSize: 11, color: C.red, lineHeight: 1.6 }}>{error}</div>}
    </div>
  );

  const m = data.market;
  const sentimentColor = m.sentimentScore < 30 ? C.red : m.sentimentScore < 55 ? C.accent : C.green;

  return (
    <div className="slide-up">
      {/* Market */}
      <SectionLabel>시장 온도</SectionLabel>
      <Card glow={`${sentimentColor}15`} style={{ background: C.surfaceHigh }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.1em", marginBottom: 4 }}>공포 · 탐욕 지수</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: sentimentColor, fontFamily: "Syne, sans-serif", lineHeight: 1 }}>
              {m.sentimentScore}
            </div>
          </div>
          <Pill text={m.sentiment} color={sentimentColor} bg={`${sentimentColor}18`} size={11} />
        </div>
        <div style={{ height: 6, borderRadius: 3, background: C.border, overflow: "hidden", marginBottom: 14 }}>
          <div style={{ width: `${m.sentimentScore}%`, height: "100%", background: `linear-gradient(90deg, ${C.red}, ${C.accent}, ${C.green})`, transition: "width 1.2s ease", borderRadius: 3 }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
          {[["VIX", m.vix], ["DXY", m.dollar], ["S&P500", m.sp500Change], ["NASDAQ", m.nasdaqChange]].map(([label, val]) => (
            <div key={label} style={{ background: C.bg, borderRadius: 8, padding: "8px 10px", border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 8, color: C.muted, letterSpacing: "0.08em", marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: "JetBrains Mono, monospace" }}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 12, lineHeight: 1.7 }}>{m.summary}</div>
      </Card>

      {/* Stocks */}
      <SectionLabel>보유 종목</SectionLabel>
      {data.stocks?.map((s, i) => {
        const sc = signalConfig[s.signal] || { color: C.muted, bg: C.surfaceHigh };
        const dirColor = s.changeDir === "up" ? C.green : s.changeDir === "down" ? C.red : C.muted;
        return (
          <Card key={i} style={{ border: `1px solid ${dirColor}25` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: C.text }}>{s.ticker}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{s.name}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>${s.price}</div>
                <div style={{ fontSize: 11, color: dirColor, fontWeight: 600 }}>
                  {s.changeDir === "up" ? "▲" : s.changeDir === "down" ? "▼" : "—"} {s.change}
                </div>
              </div>
            </div>
            <Divider />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: C.muted }}>
                목표가 <span style={{ color: C.text, fontFamily: "JetBrains Mono, monospace" }}>${s.analystTarget}</span>
                {s.upside && <span style={{ color: C.green, marginLeft: 6 }}>+{s.upside}</span>}
              </div>
              <Pill text={s.signal} color={sc.color} bg={sc.bg} />
            </div>
            {s.earningDaysLeft !== null && s.earningDaysLeft !== undefined && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "7px 10px", background: C.accentDim, borderRadius: 8 }}>
                <div className="pulse-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, flexShrink: 0 }} />
                <div style={{ fontSize: 10, color: C.accent }}>
                  어닝 <span style={{ fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>D-{s.earningDaysLeft}</span>
                  {s.earningDate && <span style={{ color: C.textDim, marginLeft: 6 }}>({s.earningDate})</span>}
                </div>
              </div>
            )}
            <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.6 }}>{s.keyPoint}</div>
            {s.risk && (
              <div style={{ fontSize: 10, color: C.red, marginTop: 8, padding: "6px 10px", background: C.redDim, borderRadius: 8 }}>
                ⚠ {s.risk}
              </div>
            )}
          </Card>
        );
      })}

      {/* Action Items */}
      <SectionLabel>오늘의 액션</SectionLabel>
      {data.actionItems?.map((a, i) => {
        const pc = a.priority === "high" ? [C.red, C.redDim] : a.priority === "medium" ? [C.accent, C.accentDim] : [C.muted, C.surfaceHigh];
        return (
          <div key={i} style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "10px 12px", background: pc[1],
            border: `1px solid ${pc[0]}25`, borderRadius: 10, marginBottom: 8,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: pc[0], flexShrink: 0, marginTop: 4 }} />
            <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>{a.text}</div>
          </div>
        );
      })}

      {/* Geopolitical */}
      <SectionLabel>정세 리스크</SectionLabel>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: C.textDim }}>글로벌 리스크 레벨</span>
          {data.geopolitical && (() => {
            const rc = riskConfig[data.geopolitical.riskLevel] || { color: C.muted, bg: C.surfaceHigh };
            return <Pill text={data.geopolitical.riskLevel} color={rc.color} bg={rc.bg} />;
          })()}
        </div>
        {data.geopolitical?.events?.map((e, i) => {
          const dc = e.direction === "positive" ? C.green : e.direction === "negative" ? C.red : C.muted;
          return (
            <div key={i} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: i < data.geopolitical.events.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: dc, flexShrink: 0, marginTop: 4 }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.text, marginBottom: 3 }}>{e.title}</div>
                <div style={{ fontSize: 10, color: C.textDim, lineHeight: 1.5 }}>{e.impact}</div>
              </div>
            </div>
          );
        })}
      </Card>

      {/* Portfolio suggestion */}
      <SectionLabel>포트폴리오 조언</SectionLabel>
      <Card style={{ background: C.accentGlow, border: `1px solid ${C.accent}20` }}>
        <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.8 }}>{data.portfolioSuggestion}</div>
      </Card>

      <button onClick={onLoad} style={{
        width: "100%", padding: "12px", background: "transparent",
        border: `1px solid ${C.border}`, borderRadius: 10, color: C.muted,
        fontSize: 11, cursor: "pointer", fontFamily: "JetBrains Mono, monospace",
        letterSpacing: "0.08em", marginTop: 4,
      }}>↻ 다시 분석</button>
    </div>
  );
}

// ─────────────────────────────────────────────
// EARNINGS TAB
// ─────────────────────────────────────────────
function EarningsTab({ tickers }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const result = await callClaude(
        EARNINGS_SYSTEM,
        `Search for upcoming earnings dates, EPS estimates, revenue estimates, and analyst sentiment for: ${tickers.join(", ")}. Today's date context matters. Return JSON only.`
      );
      setData(result);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const sentimentColors = {
    "강력매수": [C.green, C.greenDim],
    "매수": [C.blue, C.blueDim],
    "중립": [C.accent, C.accentDim],
    "매도": [C.red, C.redDim],
  };

  return (
    <div className="slide-up">
      <SectionLabel>어닝 카운트다운</SectionLabel>
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "50px 20px", gap: 14 }}>
          <Spinner />
          <div style={{ color: C.textDim, fontSize: 11, letterSpacing: "0.1em" }}>어닝 날짜 조회 중...</div>
        </div>
      )}
      {!loading && data?.earnings?.map((e, i) => {
        const sc = sentimentColors[e.analystSentiment] || [C.muted, C.surfaceHigh];
        const urgent = e.daysLeft <= 7;
        return (
          <Card key={i} glow={urgent ? `${C.accent}20` : undefined} style={{ border: urgent ? `1px solid ${C.accent}35` : undefined }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{e.ticker}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{e.name}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{
                  fontSize: e.daysLeft <= 3 ? 28 : e.daysLeft <= 7 ? 24 : 20,
                  fontWeight: 800, fontFamily: "Syne, sans-serif",
                  color: e.daysLeft <= 3 ? C.red : e.daysLeft <= 7 ? C.accent : C.text,
                  lineHeight: 1,
                }}>D-{e.daysLeft}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{e.date} {e.time}</div>
              </div>
            </div>

            {/* Countdown bar */}
            <div style={{ height: 3, borderRadius: 2, background: C.border, overflow: "hidden", marginBottom: 12 }}>
              <div style={{
                width: `${Math.max(5, 100 - (e.daysLeft / 90) * 100)}%`,
                height: "100%",
                background: e.daysLeft <= 3 ? C.red : e.daysLeft <= 7 ? C.accent : C.blue,
                borderRadius: 2,
              }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              {[["EPS 예상", e.epsEstimate], ["이전 EPS", e.epsPrev], ["매출 예상", e.revenueEstimate], ["어닝 비트율", e.historicalBeat]].map(([label, val]) => (
                <div key={label} style={{ background: C.bg, borderRadius: 8, padding: "8px 10px", border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 8, color: C.muted, letterSpacing: "0.08em", marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, fontFamily: "JetBrains Mono, monospace", color: C.text }}>{val}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: C.muted }}>애널리스트 컨센서스</span>
              <Pill text={e.analystSentiment} color={sc[0]} bg={sc[1]} />
            </div>
            <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.6, padding: "8px 10px", background: C.surfaceHigh, borderRadius: 8 }}>
              👁 {e.keyWatch}
            </div>
          </Card>
        );
      })}
      {!loading && error && (
        <div style={{ padding: "12px", background: C.redDim, border: `1px solid ${C.red}30`, borderRadius: 10, fontSize: 11, color: C.red }}>{error}</div>
      )}
      {!loading && <button onClick={load} style={{ width: "100%", padding: "12px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 10, color: C.muted, fontSize: 11, cursor: "pointer", fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.08em" }}>↻ 새로고침</button>}
    </div>
  );
}

// ─────────────────────────────────────────────
// SAJU TAB
// ─────────────────────────────────────────────
function SajuTab({ tickers }) {
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [step, setStep] = useState("input"); // input | result

  async function analyze() {
    if (!birthDate) return;
    setLoading(true); setError(null);
    try {
      const today = new Date().toISOString().split("T")[0];
      const result = await callClaude(
        SAJU_SYSTEM,
        `생년월일: ${birthDate}, 생시: ${birthTime || "미입력"}, 오늘 날짜: ${today}, 보유 종목: ${tickers.join(", ")}. 
        이 사주에 기반한 현재 투자 타이밍 분석과 이번 주 일별 에너지를 분석해줘. JSON만 반환해.`,
        false
      );
      setData(result);
      setStep("result");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  const energyColors = {
    "상승기": [C.green, C.greenDim],
    "안정기": [C.blue, C.blueDim],
    "조심기": [C.orange, C.orangeDim],
    "전환기": [C.purple, C.purpleDim],
  };

  const dayActionColors = {
    "매수": C.green, "관망": C.accent, "매도": C.red, "조심": C.orange,
  };

  const energyBarW = {
    "강": "90%", "중": "55%", "약": "25%",
  };

  // Decorative saju ring
  const SajuRing = () => (
    <div style={{ position: "relative", width: 180, height: 180, margin: "0 auto 24px" }}>
      <svg className="saju-ring" width="180" height="180" viewBox="0 0 180 180" style={{ position: "absolute", top: 0, left: 0 }}>
        <circle cx="90" cy="90" r="80" fill="none" stroke={C.border} strokeWidth="1" strokeDasharray="4 6" />
        <circle cx="90" cy="90" r="60" fill="none" stroke={C.accent + "30"} strokeWidth="1" strokeDasharray="2 8" />
      </svg>
      {["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛"].map((c, i) => {
        const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const x = 90 + 70 * Math.cos(angle);
        const y = 90 + 70 * Math.sin(angle);
        return (
          <div key={i} style={{
            position: "absolute", left: x, top: y,
            transform: "translate(-50%, -50%)",
            fontSize: 11, color: C.accent + "80",
            fontFamily: "serif",
          }}>{c}</div>
        );
      })}
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 28, fontFamily: "serif", color: C.accent }}>命</div>
        <div style={{ fontSize: 8, color: C.muted, letterSpacing: "0.15em", marginTop: 2 }}>사주분석</div>
      </div>
    </div>
  );

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px", gap: 16 }}>
      <SajuRing />
      <Spinner color={C.purple} />
      <div style={{ color: C.textDim, fontSize: 11, letterSpacing: "0.12em", textAlign: "center", lineHeight: 1.8 }}>
        사주 분석 중...<br />천간지지 해석 & 투자 타이밍 계산
      </div>
    </div>
  );

  if (step === "input") return (
    <div className="slide-up">
      <SajuRing />
      <SectionLabel>생년월일 입력</SectionLabel>
      <Card>
        <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.7, marginBottom: 16 }}>
          사주팔자(四柱八字)와 현재 운세를 결합해 <span style={{ color: C.purple }}>최적의 매매 타이밍</span>을 분석해줄게.
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, color: C.muted, letterSpacing: "0.15em", marginBottom: 6 }}>생년월일</div>
          <input
            type="date" value={birthDate}
            onChange={e => setBirthDate(e.target.value)}
            style={{
              width: "100%", background: C.surfaceHigh, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "10px 12px", color: C.text,
              fontSize: 13, fontFamily: "JetBrains Mono, monospace",
              colorScheme: "dark",
            }}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, color: C.muted, letterSpacing: "0.15em", marginBottom: 6 }}>생시 (선택)</div>
          <select value={birthTime} onChange={e => setBirthTime(e.target.value)} style={{
            width: "100%", background: C.surfaceHigh, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "10px 12px", color: birthTime ? C.text : C.muted,
            fontSize: 13, fontFamily: "JetBrains Mono, monospace",
          }}>
            <option value="">모름</option>
            {["자시(23-01)", "축시(01-03)", "인시(03-05)", "묘시(05-07)", "진시(07-09)", "사시(09-11)", "오시(11-13)", "미시(13-15)", "신시(15-17)", "유시(17-19)", "술시(19-21)", "해시(21-23)"].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <button onClick={analyze} disabled={!birthDate} style={{
          width: "100%", padding: "14px", background: birthDate ? C.purple : C.surfaceHigh,
          color: birthDate ? C.bg : C.muted, border: "none", borderRadius: 10,
          fontSize: 13, fontWeight: 700, cursor: birthDate ? "pointer" : "not-allowed",
          fontFamily: "Syne, sans-serif", letterSpacing: "0.04em",
          transition: "all 0.2s",
        }}>사주 투자 타이밍 분석</button>
      </Card>
      {error && <div style={{ padding: "12px", background: C.redDim, borderRadius: 10, fontSize: 11, color: C.red, marginTop: 8 }}>{error}</div>}
    </div>
  );

  if (!data) return null;

  const ec = energyColors[data.currentEnergy] || [C.muted, C.surfaceHigh];

  return (
    <div className="slide-up">
      {/* Energy Overview */}
      <SectionLabel>현재 운세 에너지</SectionLabel>
      <Card glow={`${ec[0]}15`} style={{ border: `1px solid ${ec[0]}30` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 9, color: C.muted, letterSpacing: "0.1em", marginBottom: 4 }}>현재 사이클</div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "Syne, sans-serif", color: ec[0] }}>{data.currentEnergy}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 32, fontWeight: 800, fontFamily: "Syne, sans-serif", color: ec[0] }}>{data.energyScore}</div>
            <div style={{ fontSize: 9, color: C.muted }}>에너지 지수</div>
          </div>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: C.border, overflow: "hidden", marginBottom: 12 }}>
          <div style={{ width: `${data.energyScore}%`, height: "100%", background: ec[0], transition: "width 1s ease" }} />
        </div>
        <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.7 }}>{data.sajuSummary}</div>
      </Card>

      {/* Weekly */}
      <SectionLabel>이번 주 일별 에너지</SectionLabel>
      <Card>
        {data.weeklyOutlook?.map((d, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "9px 0", borderBottom: i < data.weeklyOutlook.length - 1 ? `1px solid ${C.border}` : "none",
          }}>
            <div style={{ width: 24, fontSize: 11, fontWeight: 700, color: C.text, flexShrink: 0 }}>{d.day}</div>
            <div style={{ flex: 1, height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: energyBarW[d.energy] || "50%", height: "100%", background: dayActionColors[d.action] || C.muted, borderRadius: 2, transition: "width 0.8s ease" }} />
            </div>
            <Pill text={d.action} color={dayActionColors[d.action] || C.muted} bg={`${dayActionColors[d.action] || C.muted}18`} size={9} />
            <div style={{ fontSize: 9, color: C.textDim, maxWidth: 100, lineHeight: 1.4 }}>{d.reason}</div>
          </div>
        ))}
      </Card>

      {/* Favorable / Avoid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <Card style={{ margin: 0 }}>
          <div style={{ fontSize: 9, color: C.green, letterSpacing: "0.1em", marginBottom: 8 }}>✦ 길일</div>
          {data.favorableDates?.map((d, i) => (
            <div key={i} style={{ fontSize: 10, color: C.textDim, lineHeight: 1.5, marginBottom: 4 }}>• {d}</div>
          ))}
        </Card>
        <Card style={{ margin: 0 }}>
          <div style={{ fontSize: 9, color: C.red, letterSpacing: "0.1em", marginBottom: 8 }}>✦ 흉일</div>
          {data.avoidDates?.map((d, i) => (
            <div key={i} style={{ fontSize: 10, color: C.textDim, lineHeight: 1.5, marginBottom: 4 }}>• {d}</div>
          ))}
        </Card>
      </div>

      {/* Stock alignment */}
      <SectionLabel>종목 운세 궁합</SectionLabel>
      <Card>
        {data.stockAlignment?.map((s, i) => {
          const ac = s.alignment === "높음" ? [C.green, C.greenDim] : s.alignment === "중간" ? [C.accent, C.accentDim] : [C.red, C.redDim];
          return (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "9px 0", borderBottom: i < data.stockAlignment.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{s.ticker}</div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 3, maxWidth: 220, lineHeight: 1.4 }}>{s.reason}</div>
              </div>
              <Pill text={s.alignment} color={ac[0]} bg={ac[1]} />
            </div>
          );
        })}
      </Card>

      {/* Overall advice */}
      <SectionLabel>종합 조언</SectionLabel>
      <Card style={{ background: `linear-gradient(135deg, ${C.purpleDim} 0%, ${C.accentDim} 100%)`, border: `1px solid ${C.purple}25` }}>
        <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.8 }}>{data.overallAdvice}</div>
      </Card>

      <button onClick={() => { setStep("input"); setData(null); }} style={{
        width: "100%", padding: "12px", background: "transparent",
        border: `1px solid ${C.border}`, borderRadius: 10, color: C.muted,
        fontSize: 11, cursor: "pointer", fontFamily: "JetBrains Mono, monospace",
        letterSpacing: "0.08em",
      }}>← 다시 입력</button>
    </div>
  );
}

// ─────────────────────────────────────────────
// WATCHLIST TAB
// ─────────────────────────────────────────────
function WatchlistTab({ data }) {
  if (!data?.watchlist?.length) return (
    <div style={{ textAlign: "center", padding: "60px 20px" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
      <div style={{ color: C.textDim, fontSize: 12 }}>브리핑을 먼저 생성하면<br />관심 종목이 표시돼.</div>
    </div>
  );

  const themeColors = {
    "AI": [C.blue, C.blueDim], "반도체": [C.purple, C.purpleDim],
    "클라우드": [C.green, C.greenDim], "에너지": [C.orange, C.orangeDim],
  };

  return (
    <div className="slide-up">
      <SectionLabel>눈여겨볼 종목</SectionLabel>
      {data.watchlist.map((w, i) => {
        const tc = themeColors[w.theme] || [C.accent, C.accentDim];
        const dirColor = w.changeDir === "up" ? C.green : w.changeDir === "down" ? C.red : C.muted;
        return (
          <Card key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{w.ticker}</div>
                <Pill text={w.theme} color={tc[0]} bg={tc[1]} size={9} />
              </div>
              {w.change && (
                <div style={{ fontSize: 12, color: dirColor, fontWeight: 600, fontFamily: "JetBrains Mono, monospace" }}>
                  {w.changeDir === "up" ? "▲" : w.changeDir === "down" ? "▼" : "—"} {w.change}
                </div>
              )}
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>{w.name}</div>
            <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.6 }}>{w.reason}</div>
          </Card>
        );
      })}

      {data.portfolioSuggestion && (
        <>
          <SectionLabel>포트폴리오 제안</SectionLabel>
          <Card style={{ background: C.accentGlow, border: `1px solid ${C.accent}20` }}>
            <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.8 }}>{data.portfolioSuggestion}</div>
          </Card>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// SETTINGS TAB
// ─────────────────────────────────────────────
function SettingsTab({ tickers, setTickers, onApply }) {
  const [input, setInput] = useState(tickers.join(", "));
  const [alerts, setAlerts] = useState([
    { ticker: "GOOGL", type: "목표가", value: "200", active: true },
    { ticker: "NVDA", type: "급등락", value: "3%", active: true },
  ]);

  return (
    <div className="slide-up">
      <SectionLabel>관심 종목</SectionLabel>
      <Card>
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.1em", marginBottom: 8 }}>콤마로 구분</div>
        <input value={input} onChange={e => setInput(e.target.value)}
          style={{
            width: "100%", background: C.bg, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "10px 12px", color: C.text,
            fontSize: 13, fontFamily: "JetBrains Mono, monospace",
            marginBottom: 10,
          }}
          placeholder="GOOGL, NVDA, MSFT..."
        />
        <button onClick={() => { setTickers(input.split(/[,\s]+/).filter(Boolean)); onApply(); }} style={{
          width: "100%", padding: "12px", background: C.accent, color: C.bg,
          border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700,
          cursor: "pointer", fontFamily: "Syne, sans-serif",
        }}>적용 & 브리핑 새로 생성</button>
      </Card>

      <SectionLabel>알림 설정</SectionLabel>
      {alerts.map((a, i) => (
        <Card key={i}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{a.ticker}</span>
                <Pill text={a.type} color={C.blue} bg={C.blueDim} size={9} />
              </div>
              <div style={{ fontSize: 10, color: C.textDim }}>기준값: <span style={{ color: C.text }}>{a.value}</span></div>
            </div>
            <div
              onClick={() => setAlerts(alerts.map((al, j) => j === i ? { ...al, active: !al.active } : al))}
              style={{
                width: 40, height: 22, borderRadius: 11,
                background: a.active ? C.green : C.border,
                position: "relative", cursor: "pointer", transition: "background 0.2s",
              }}
            >
              <div style={{
                position: "absolute", top: 3, left: a.active ? 21 : 3,
                width: 16, height: 16, borderRadius: "50%",
                background: C.bg, transition: "left 0.2s",
              }} />
            </div>
          </div>
        </Card>
      ))}

      <SectionLabel>앱 정보</SectionLabel>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: C.muted }}>버전</span>
          <span style={{ fontSize: 11, color: C.text, fontFamily: "JetBrains Mono, monospace" }}>SIGNAL AM v1.0</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: C.muted }}>데이터 소스</span>
          <span style={{ fontSize: 11, color: C.text }}>Claude AI + 웹검색</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, color: C.muted }}>면책 고지</span>
          <span style={{ fontSize: 11, color: C.red }}>투자 참고용</span>
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("briefing");
  const [tickers, setTickers] = useState(["GOOGL", "NVDA"]);
  const [briefingData, setBriefingData] = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState(null);

  useEffect(() => { injectStyles(); }, []);

  const now = new Date();
  const dateStr = now.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
  const timeStr = now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

  async function loadBriefing() {
    setBriefingLoading(true); setBriefingError(null);
    try {
      const result = await callClaude(BRIEFING_SYSTEM, `오늘 날짜 기준으로 ${tickers.join(", ")} 포트폴리오 모닝 브리핑 JSON만 반환해줘.`);
      setBriefingData(result);
      setTab("briefing");
    } catch (e) { setBriefingError(e.message); }
    finally { setBriefingLoading(false); }
  }

  const navItems = [
    { id: "briefing", icon: "◈", label: "브리핑" },
    { id: "earnings", icon: "◷", label: "어닝" },
    { id: "watchlist", icon: "⊕", label: "관심" },
    { id: "saju", icon: "命", label: "사주" },
    { id: "settings", icon: "◎", label: "설정" },
  ];

  const tabContent = () => {
    switch (tab) {
      case "briefing": return <BriefingTab tickers={tickers} data={briefingData} loading={briefingLoading} onLoad={loadBriefing} error={briefingError} />;
      case "earnings": return <EarningsTab tickers={tickers} />;
      case "watchlist": return <WatchlistTab data={briefingData} />;
      case "saju": return <SajuTab tickers={tickers} />;
      case "settings": return <SettingsTab tickers={tickers} setTickers={setTickers} onApply={loadBriefing} />;
      default: return null;
    }
  };

  return (
    <div style={{
      background: C.bg, minHeight: "100vh", maxWidth: 430, margin: "0 auto",
      fontFamily: "JetBrains Mono, monospace", color: C.text, position: "relative",
    }}>
      {/* BG grid */}
      <div style={{
        position: "fixed", top: 0, left: "50%", transform: "translateX(-50%)",
        width: 430, height: "100vh", pointerEvents: "none", zIndex: 0,
        backgroundImage: `linear-gradient(${C.border} 1px, transparent 1px), linear-gradient(90deg, ${C.border} 1px, transparent 1px)`,
        backgroundSize: "40px 40px", opacity: 0.3,
      }} />

      {/* Header */}
      <div style={{
        padding: "18px 20px 14px", borderBottom: `1px solid ${C.border}`,
        position: "relative", zIndex: 1,
        background: `${C.bg}ee`, backdropFilter: "blur(10px)",
        position: "sticky", top: 0,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: "0.3em", color: C.accent, fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>
              ◆ SIGNAL AM
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "Syne, sans-serif", letterSpacing: "-0.02em" }}>
              {tab === "briefing" ? "모닝 브리핑" : tab === "earnings" ? "어닝 캘린더" : tab === "watchlist" ? "관심 종목" : tab === "saju" ? "사주 타이밍" : "설정"}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: C.text, fontFamily: "JetBrains Mono, monospace" }}>{timeStr}</div>
            <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{dateStr}</div>
          </div>
        </div>

        {/* Ticker chips */}
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {tickers.map(t => (
            <div key={t} style={{
              padding: "3px 9px", background: C.surfaceHigh, border: `1px solid ${C.border}`,
              borderRadius: 20, fontSize: 9, color: C.textDim,
              fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.08em",
            }}>{t}</div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "18px 16px 100px", position: "relative", zIndex: 1 }}>
        {tabContent()}
      </div>

      {/* Nav bar */}
      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 430,
        background: `${C.surface}f0`, backdropFilter: "blur(16px)",
        borderTop: `1px solid ${C.border}`,
        display: "flex", justifyContent: "space-around",
        padding: "10px 0 22px", zIndex: 100,
      }}>
        {navItems.map(n => (
          <div key={n.id} onClick={() => setTab(n.id)} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            cursor: "pointer", opacity: tab === n.id ? 1 : 0.35,
            transition: "opacity 0.2s", minWidth: 48,
          }}>
            <div style={{
              fontSize: n.id === "saju" ? 16 : 18,
              color: tab === n.id ? C.accent : C.textDim,
              fontFamily: n.id === "saju" ? "serif" : "inherit",
              lineHeight: 1,
            }}>{n.icon}</div>
            <div style={{
              fontSize: 8, letterSpacing: "0.1em",
              color: tab === n.id ? C.accent : C.muted,
              textTransform: "uppercase", fontFamily: "JetBrains Mono, monospace",
            }}>{n.label}</div>
            {tab === n.id && (
              <div style={{ width: 3, height: 3, borderRadius: "50%", background: C.accent }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
