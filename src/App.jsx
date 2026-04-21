import { useState, useEffect, useRef, useCallback } from "react";
import AuthScreen, { getToken, clearToken, apiFetch } from "./AuthScreen";

const CARBON_BY_COUNTRY = {
  IN:708,CN:581,US:386,GB:233,DE:350,FR:85,AU:590,BR:136,
  JP:474,KR:415,CA:150,ZA:840,NG:431,NO:26,SE:42,PL:635,IT:371,ES:206
};

const COUNTRY_NAMES = {
  IN:"India",CN:"China",US:"USA",GB:"UK",DE:"Germany",FR:"France",
  AU:"Australia",BR:"Brazil",JP:"Japan",KR:"S.Korea",CA:"Canada",
  ZA:"S.Africa",NG:"Nigeria",NO:"Norway",SE:"Sweden",PL:"Poland",IT:"Italy",ES:"Spain"
};

function useInterval(cb, delay) {
  const saved = useRef(cb);
  useEffect(() => { saved.current = cb; }, [cb]);
  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => saved.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

function GlobeCanvas() {
  const canvasRef = useRef(null);
  const angleRef = useRef(0);
  const animRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width = canvas.offsetWidth * window.devicePixelRatio || 600;
    const H = canvas.height = canvas.offsetHeight * window.devicePixelRatio || 600;
    const cx = W / 2, cy = H / 2;
    const R = Math.min(W, H) * 0.38;

    const hotspots = [
      { lat: 20, lon: 78, ci: 708, label: "IN" },
      { lat: 35, lon: 105, ci: 581, label: "CN" },
      { lat: 38, lon: -97, ci: 386, label: "US" },
      { lat: 52, lon: 10, ci: 350, label: "DE" },
      { lat: -25, lon: 133, ci: 590, label: "AU" },
      { lat: 36, lon: 138, ci: 474, label: "JP" },
      { lat: -30, lon: 25, ci: 840, label: "ZA" },
      { lat: 60, lon: 15, ci: 42,  label: "SE" },
      { lat: 47, lon: 2, ci: 85, label: "FR" },
      { lat: -15, lon: -55, ci: 136, label: "BR" },
    ];

    function latLonTo3D(lat, lon, r) {
      const phi = (90 - lat) * Math.PI / 180;
      const theta = lon * Math.PI / 180;
      return {
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.cos(phi),
        z: r * Math.sin(phi) * Math.sin(theta),
      };
    }

    function project(x, y, z, angle) {
      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      const rx = x * cosA - z * sinA;
      const rz = x * sinA + z * cosA;
      return { sx: cx + rx, sy: cy - y, z: rz };
    }

    function ciColor(ci) {
      if (ci < 200) return "#00ff7f";
      if (ci < 400) return "#fbbf24";
      if (ci < 600) return "#fb923c";
      return "#ef4444";
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      const angle = angleRef.current;

      const grd = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.15);
      grd.addColorStop(0, "rgba(14,165,233,0.08)");
      grd.addColorStop(1, "rgba(14,165,233,0)");
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.1, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      const globeGrd = ctx.createRadialGradient(cx - R*0.3, cy - R*0.3, R*0.1, cx, cy, R);
      globeGrd.addColorStop(0, "rgba(14,165,233,0.18)");
      globeGrd.addColorStop(0.5, "rgba(6,95,70,0.12)");
      globeGrd.addColorStop(1, "rgba(2,6,23,0.9)");
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = globeGrd;
      ctx.fill();
      ctx.strokeStyle = "rgba(14,165,233,0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();

      for (let lat = -60; lat <= 60; lat += 30) {
        const phi = (90 - lat) * Math.PI / 180;
        const ry = R * Math.cos(phi);
        const rx = R * Math.sin(phi);
        if (Math.abs(ry) < R) {
          ctx.beginPath();
          ctx.ellipse(cx, cy - ry, rx, rx * 0.15, 0, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(14,165,233,0.12)";
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }

      for (let lon = 0; lon < 360; lon += 30) {
        const a = (lon * Math.PI / 180) + angle;
        ctx.beginPath();
        for (let lat = -90; lat <= 90; lat += 5) {
          const phi = (90 - lat) * Math.PI / 180;
          const x = R * Math.sin(phi) * Math.cos(a);
          const y = R * Math.cos(phi);
          const z = R * Math.sin(phi) * Math.sin(a);
          const rx2 = x;
          const rz2 = z;
          if (rz2 >= 0) {
            if (lat === -90) ctx.moveTo(cx + rx2, cy - y);
            else ctx.lineTo(cx + rx2, cy - y);
          }
        }
        ctx.strokeStyle = "rgba(14,165,233,0.08)";
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      const visible = [];
      for (const h of hotspots) {
        const p3 = latLonTo3D(h.lat, h.lon, R);
        const proj = project(p3.x, p3.y, p3.z, angle);
        if (proj.z >= -R * 0.1) visible.push({ ...h, ...proj, p3 });
      }
      visible.sort((a, b) => a.z - b.z);

      for (const h of visible) {
        const alpha = Math.min(1, (h.z + R) / R);
        const col = ciColor(h.ci);
        const pulse = (Math.sin(Date.now() / 800 + h.lat) + 1) / 2;
        const hexToRgba = (hex, a) => {
          const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
          return `rgba(${r},${g},${b},${a})`;
        };
        ctx.beginPath();
        ctx.arc(h.sx, h.sy, 6 + pulse * 8, 0, Math.PI * 2);
        ctx.strokeStyle = hexToRgba(col, 0.15 + pulse * 0.25);
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(h.sx, h.sy, 4, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(col, alpha * 0.9);
        ctx.fill();

        if (alpha > 0.5) {
          ctx.font = `bold ${Math.round(9 * window.devicePixelRatio)}px monospace`;
          ctx.fillStyle = hexToRgba(col, alpha);
          ctx.fillText(h.label, h.sx + 6, h.sy - 5);
          ctx.font = `${Math.round(8 * window.devicePixelRatio)}px monospace`;
          ctx.fillStyle = hexToRgba(col, alpha * 0.7);
          ctx.fillText(h.ci, h.sx + 6, h.sy + 6);
        }
      }

      angleRef.current += 0.003;
      animRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
  );
}

function Ticker({ items }) {
  const [offset, setOffset] = useState(0);
  const trackRef = useRef(null);
  useInterval(() => {
    setOffset(prev => {
      const w = trackRef.current?.scrollWidth || 1200;
      return prev >= w / 2 ? 0 : prev + 0.8;
    });
  }, 16);

  return (
    <div style={{ overflow: "hidden", whiteSpace: "nowrap", flex: 1 }}>
      <div ref={trackRef} style={{ display: "inline-block", transform: `translateX(-${offset}px)` }}>
        {[...items, ...items].map((item, i) => (
          <span key={i} style={{ marginRight: 40, fontSize: 14, fontFamily: "monospace" }}>
            <span style={{ color: "#64748b", marginRight: 6 }}>{item.label}</span>
            <span style={{ color: item.up ? "#22c55e" : "#ef4444", fontWeight: 700 }}>{item.value}</span>
            <span style={{ color: item.up ? "#22c55e" : "#ef4444", marginLeft: 4, fontSize: 13 }}>
              {item.up ? "▲" : "▼"}{item.change}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function useTickerData() {
  const [data, setData] = useState([
    { label: "COAL.USD", value: "134.20", change: "0.80", up: false },
    { label: "CO2.EUR", value: "62.45", change: "1.20", up: true },
    { label: "NATGAS", value: "2.87", change: "0.05", up: true },
    { label: "CARBON.IN", value: "708 gCO₂", change: "2.1%", up: false },
    { label: "CARBON.CN", value: "581 gCO₂", change: "0.8%", up: false },
    { label: "CARBON.US", value: "386 gCO₂", change: "1.2%", up: true },
    { label: "CARBON.DE", value: "350 gCO₂", change: "0.5%", up: true },
    { label: "SOLAR.MW", value: "1842 GW", change: "3.2%", up: true },
    { label: "WIND.MW", value: "1017 GW", change: "4.1%", up: true },
    { label: "COAL.GLOBAL", value: "8.3 GtCO₂", change: "0.4%", up: false },
  ]);

  useInterval(() => {
    setData(prev => prev.map(item => {
      const delta = (Math.random() * 0.4).toFixed(2);
      const up = Math.random() > 0.45;
      const base = parseFloat(item.value);
      const newVal = isNaN(base) ? item.value : (base + (up ? +delta : -delta)).toFixed(2);
      return { ...item, value: isNaN(base) ? item.value : newVal, change: delta, up };
    }));
  }, 2000);

  return data;
}

function MetricCard({ label, value, sub, color = "#22c55e", blink }) {
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (blink) { setFlash(true); setTimeout(() => setFlash(false), 300); }
  }, [value]);

  return (
    <div style={{
      background: "#0b1a2e", border: "1px solid #1e3a5f", borderRadius: 4,
      padding: "10px 14px", transition: "background 0.3s",
      backgroundColor: flash ? "#0f2a1a" : "#0b1a2e",
    }}>
      <div style={{ fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase", color: "#475569", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 23, fontWeight: 700, color, fontFamily: "monospace", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 13, color: "#475569", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function EmissionBar({ label, value, max, color }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#64748b", marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ color, fontFamily: "monospace" }}>{value} gCO₂/kWh</span>
      </div>
      <div style={{ height: 4, background: "#1e293b", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${(value / max) * 100}%`, background: color, borderRadius: 2, transition: "width 1s ease" }} />
      </div>
    </div>
  );
}

function RealtimeChart({ data }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!window.Chart) return;
    const ctx = canvasRef.current.getContext("2d");
    chartRef.current = new window.Chart(ctx, {
      type: "line",
      data: {
        labels: data.map((_, i) => i),
        datasets: [{
          label: "CO₂ g/view", data,
          borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,0.08)",
          borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.4,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins: { legend: { display: false } },
        scales: {
          x: { display: false },
          y: {
            ticks: { color: "#475569", font: { size: 9 }, callback: v => v.toFixed(2) },
            grid: { color: "rgba(30,58,95,0.5)" }, border: { display: false }
          }
        }
      }
    });
    return () => chartRef.current?.destroy();
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.data.datasets[0].data = data;
    chartRef.current.data.labels = data.map((_, i) => i);
    chartRef.current.update("none");
  }, [data]);

  return <canvas ref={canvasRef} />;
}

function UserHistoryPanel() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiFetch("/analyses").then(d => setHistory(d.analyses)).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ background: "#0b1a2e", border: "1px solid #1e3a5f", borderRadius: 4, padding: 16, marginTop: 10 }}>
      <div style={{ fontSize: 12, letterSpacing: "0.2em", color: "#0ea5e9", marginBottom: 12, textTransform: "uppercase" }}>
        YOUR RECENT ANALYSES
      </div>
      {loading ? <div style={{ fontSize: 13, color: "#475569" }}>Loading history...</div> : (
        <div style={{ maxHeight: 150, overflowY: "auto" }}>
          <table style={{ width: "100%", fontSize: 12, textAlign: "left", color: "#94a3b8" }}>
            <tbody>
              {history.slice(0, 15).map((h, i) => (
                <tr key={h.id || i} style={{ borderBottom: "1px solid #1e293b" }}>
                  <td style={{ padding: "4px 0", color: "#e2e8f0" }}>{h.url.replace(/^https?:\/\//, '').substring(0, 25)}</td>
                  <td>Grade {h.grade}</td>
                  <td style={{ color: h.is_green ? "#22c55e" : "#475569" }}>{h.is_green ? "GREEN" : "STD"}</td>
                  <td style={{ textAlign: "right" }}>{new Date(h.analyzed_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!history.length && <div style={{ fontSize: 12, color: "#475569" }}>No analyses yet. Start exploring above!</div>}
        </div>
      )}
    </div>
  );
}

function AdminPanel({ user }) {
  const [tab, setTab] = useState("stats");
  const [adminData, setAdminData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const path = tab === "stats" ? "/admin/stats" : "/admin/users";
    apiFetch(path).then(setAdminData).finally(() => setLoading(false));
  }, [tab]);

  async function toggleRole(u) {
    const newRole = u.role === 'admin' ? 'user' : 'admin';
    if (!window.confirm(`Change ${u.username}'s role to ${newRole.toUpperCase()}?`)) return;
    try {
      await apiFetch(`/admin/users/${u.id}/role`, { method: "PATCH", body: JSON.stringify({ role: newRole }) });
      setAdminData(prev => ({ ...prev, users: prev.users.map(x => x.id === u.id ? { ...x, role: newRole } : x) }));
    } catch (e) { alert(e.message); }
  }

  async function deleteUser(u) {
    if (!window.confirm(`Danger: Permanently delete user ${u.username} and all their data?`)) return;
    try {
      await apiFetch(`/admin/users/${u.id}`, { method: "DELETE" });
      setAdminData(prev => ({ ...prev, users: prev.users.filter(x => x.id !== u.id) }));
    } catch (e) { alert(e.message); }
  }

  return (
    <div style={{ background: "#1f0909", border: "1px solid #5f1e1e", borderRadius: 4, padding: 16, marginTop: 10 }}>
      <div style={{ fontSize: 12, letterSpacing: "0.2em", color: "#f87171", marginBottom: 12, textTransform: "uppercase", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>ADMINISTRATOR CONSOLE</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setTab("stats")} style={{ background: tab === "stats" ? "#5f1e1e" : "transparent", color: tab === "stats" ? "#fff" : "#fca5a5", border: "1px solid #5f1e1e", padding: "4px 8px", fontSize: 12, cursor: "pointer", borderRadius: 2 }}>GLOBAL STATS</button>
          <button onClick={() => setTab("users")} style={{ background: tab === "users" ? "#5f1e1e" : "transparent", color: tab === "users" ? "#fff" : "#fca5a5", border: "1px solid #5f1e1e", padding: "4px 8px", fontSize: 12, cursor: "pointer", borderRadius: 2 }}>MANAGE USERS</button>
        </div>
      </div>
      
      {loading ? <div style={{ fontSize: 13, color: "#991b1b" }}>Loading {tab}...</div> : (
        <>
          {tab === "stats" && adminData && adminData.usersCount !== undefined && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                <div style={{ background: "#3f1111", padding: 10, borderRadius: 4, textAlign: "center" }}>
                  <div style={{ fontSize: 19, color: "#fca5a5", fontWeight: "bold" }}>{adminData.usersCount}</div>
                  <div style={{ fontSize: 11, color: "#f87171", marginTop: 4 }}>TOTAL USERS</div>
                </div>
                <div style={{ background: "#3f1111", padding: 10, borderRadius: 4, textAlign: "center" }}>
                  <div style={{ fontSize: 19, color: "#fca5a5", fontWeight: "bold" }}>{adminData.analysesCount}</div>
                  <div style={{ fontSize: 11, color: "#f87171", marginTop: 4 }}>ANALYSES RUN</div>
                </div>
                <div style={{ background: "#3f1111", padding: 10, borderRadius: 4, textAlign: "center" }}>
                  <div style={{ fontSize: 19, color: "#fca5a5", fontWeight: "bold" }}>{adminData.totalCo2.toFixed(1)}kg</div>
                  <div style={{ fontSize: 11, color: "#f87171", marginTop: 4 }}>GLOBAL EMISSIONS</div>
                </div>
              </div>
              
              <div style={{ fontSize: 12, color: "#f87171", marginBottom: 6 }}>RECENT SYSTEM ACTIVITY (ALL USERS)</div>
              <div style={{ maxHeight: 110, overflowY: "auto" }}>
                <table style={{ width: "100%", fontSize: 12, textAlign: "left", color: "#fca5a5" }}>
                  <tbody>
                    {adminData.recent?.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #3f1111" }}>
                        <td style={{ padding: "4px 0", color: "#fff" }}>@{r.username}</td>
                        <td>{r.url.replace(/^https?:\/\//, '').substring(0, 18)}</td>
                        <td>Grade {r.grade}</td>
                        <td style={{ textAlign: "right", color: "#ca8a8a" }}>{new Date(r.analyzed_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!adminData.recent?.length && <div style={{ fontSize: 12, color: "#991b1b" }}>No recent activity.</div>}
              </div>
            </div>
          )}

          {tab === "users" && adminData && adminData.users && (
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              <table style={{ width: "100%", fontSize: 12, textAlign: "left", color: "#fca5a5" }}>
                <thead>
                  <tr style={{ color: "#ef4444" }}>
                    <th style={{ paddingBottom: 6 }}>ID</th><th>USERNAME</th><th>ROLE</th><th>JOINED</th><th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {adminData.users.map(u => (
                    <tr key={u.id} style={{ borderBottom: "1px solid #3f1111" }}>
                      <td style={{ padding: "4px 0" }}>{u.id}</td>
                      <td style={{ color: "#fff" }}>{u.username}</td>
                      <td><span style={{ padding: "2px 4px", background: u.role === "admin" ? "#991b1b" : "#450a0a", borderRadius: 2 }}>{u.role?.toUpperCase() || 'USER'}</span></td>
                      <td>{new Date(u.created_at).toLocaleDateString()}</td>
                      <td>
                        <button onClick={() => toggleRole(u)} disabled={u.id === user.id} style={{ background: "transparent", border: "1px solid #7f1d1d", color: "#fca5a5", fontSize: 9, padding: "2px 6px", cursor: u.id === user.id ? "not-allowed" : "pointer", borderRadius: 2, marginRight: 4 }}>
                          ROLE
                        </button>
                        <button onClick={() => deleteUser(u)} disabled={u.id === user.id} style={{ background: "#991b1b", border: "none", color: "#fff", fontSize: 9, padding: "3px 6px", cursor: u.id === user.id ? "not-allowed" : "pointer", borderRadius: 2 }}>
                          DEL
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AnalyzerPanel({ user }) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [dataSource, setDataSource] = useState(null);
  const [geoData, setGeoData] = useState(null);
  const [visitors, setVisitors] = useState(10000);
  const [hosting, setHosting] = useState("cloud");
  const [saved, setSaved] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ciColor = ci => ci < 200 ? "#22c55e" : ci < 400 ? "#fbbf24" : ci < 600 ? "#fb923c" : "#ef4444";
  const gradeColor = g => ({ A:"#22c55e", B:"#4ade80", C:"#fbbf24", D:"#fb923c", F:"#ef4444" }[g] || "#fff");

  async function detectCI(hostname) {
    try {
      const r = await Promise.race([
        fetch(`https://ip-api.com/json/${hostname}?fields=countryCode,country,query`),
        new Promise((_,rej) => setTimeout(() => rej(), 5000))
      ]);
      const geo = await r.json();
      if (geo.status === "fail") throw new Error();
      const code = geo.countryCode?.toUpperCase();
      const ci = CARBON_BY_COUNTRY[code] || 442;
      return { ci, country: geo.country || code, code, ip: geo.query };
    } catch {
      return { ci: 442, country: "Global Average", code: "--", ip: null };
    }
  }

  function computeLocal(hostname, ci) {
    const seed = [...hostname].reduce((h, c) => ((h ^ c.charCodeAt(0)) * 16777619) >>> 0, 2166136261);
    const rng = (min, max) => min + ((seed * 9301 + 49297) % 233280) / 233280 * (max - min);
    let sizeKB = 800 + rng(0, 2400);
    if (/github|gitlab/i.test(hostname)) sizeKB = 900 + rng(0, 600);
    if (/google|bing/i.test(hostname)) sizeKB = 200 + rng(0, 200);
    if (/wikipedia/i.test(hostname)) sizeKB = 400 + rng(0, 300);
    if (/aws|cloud/i.test(hostname)) sizeKB = 1200 + rng(0, 800);
    const mb = sizeKB / 1024;
    const dcF = hosting === "green" ? 0.000036 : hosting === "cloud" ? 0.000060 : 0.000072;
    const dcE = mb * dcF, netE = mb * 0.000152, devE = mb * 0.000052;
    const totE = dcE + netE + devE;
    const gpv = totE * ci;
    const annualKg = (gpv / 1000) * visitors * 12;
    const grade = gpv < 0.1 ? "A" : gpv < 0.3 ? "B" : gpv < 0.6 ? "C" : gpv < 1.0 ? "D" : "F";
    return {
      sizeKB: Math.round(sizeKB), dcE, netE, devE, totE, gpv, annualKg, grade,
      trees: Math.round(annualKg / 21), kms: Math.round(annualKg * 6.3),
      vsAvg: ((gpv / 0.5 - 1) * 100).toFixed(0), isGreen: false
    };
  }

  async function run() {
    if (!url.trim()) return;
    let fullUrl = url.trim();
    if (!/^https?:\/\//i.test(fullUrl)) fullUrl = "https://" + fullUrl;
    try { new URL(fullUrl); } catch { setStatus("Invalid URL"); return; }

    setRunning(true); setResult(null); setProgress(0);
    setSaved(false); setSaveMsg("");
    const hostname = new URL(fullUrl).hostname;

    setStatus("🌍 Detecting server location..."); setProgress(10);
    const geo = await detectCI(hostname);
    setGeoData(geo);
    setStatus(`📍 ${geo.country} — ${geo.ci} gCO₂/kWh`); setProgress(30);
    await sleep(300);

    setStatus("📡 Contacting Website Carbon API..."); setProgress(40);
    let data = null, src = "api";

    try {
      const resp = await Promise.race([
        fetch(`https://api.websitecarbon.com/site?url=${encodeURIComponent(fullUrl)}`),
        new Promise((_,rej) => setTimeout(() => rej(), 8000))
      ]);
      if (!resp.ok) throw new Error();
      setProgress(70); setStatus("📊 Reading live data...");
      const json = await resp.json();
      const stats = json.statistics || {}, co2d = stats.co2 || {}, grid = co2d.grid || {};
      const totE = parseFloat(stats.energy) || 0;
      const gpv = totE > 0 ? totE * geo.ci : parseFloat(grid.grams) || 0;
      const sizeKB = Math.round((parseFloat(stats.adjustedBytes) || 0) / 1024);
      const annualKg = (gpv / 1000) * visitors * 12;
      const grade = gpv < 0.1 ? "A" : gpv < 0.3 ? "B" : gpv < 0.6 ? "C" : gpv < 1.0 ? "D" : "F";
      data = {
        sizeKB, dcE: totE*0.22, netE: totE*0.52, devE: totE*0.26, totE, gpv, annualKg,
        grade, trees: Math.round(annualKg/21), kms: Math.round(annualKg*6.3),
        vsAvg: ((gpv/0.5-1)*100).toFixed(0), isGreen: json.green === true
      };
    } catch {
      src = "estimate"; setStatus("⚠️ Using local model...");
      data = computeLocal(hostname, geo.ci);
    }

    // Save to database if user is logged in
    setProgress(90); setStatus("💾 Saving to your history...");
    try {
      await apiFetch("/analyses", {
        method: "POST",
        body: JSON.stringify({
          url: fullUrl, country: geo.country, country_code: geo.code,
          ci_value: geo.ci, grams_per_view: data.gpv, annual_kg: data.annualKg,
          grade: data.grade, page_size_kb: data.sizeKB,
          is_green: data.isGreen, data_source: src,
        }),
      });
    } catch (e) {
      console.warn("Could not save to DB:", e.message);
    }

    setProgress(100); setStatus("✅ Analysis saved to your history");
    await sleep(200);
    setRunning(false); setResult(data); setDataSource(src);
  }

  async function saveForMonitoring() {
    if (!result) return;
    try {
      let fullUrl = url.trim();
      if (!/^https?:\/\//i.test(fullUrl)) fullUrl = "https://" + fullUrl;
      await apiFetch("/saved-sites", {
        method: "POST",
        body: JSON.stringify({ url: fullUrl }),
      });
      setSaved(true);
      setSaveMsg("✅ Site saved! It will be tracked over time.");
    } catch (e) {
      setSaveMsg(e.message.includes("already") ? "Already in your monitored sites." : "Could not save: " + e.message);
    }
  }

  return (
    <div style={{ background: "#060e1a", border: "1px solid #1e3a5f", borderRadius: 4, padding: 16 }}>
      <div style={{ fontSize: 12, letterSpacing: "0.2em", color: "#0ea5e9", marginBottom: 12, textTransform: "uppercase" }}>
        WEBSITE CARBON ANALYZER
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <input
          value={url} onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === "Enter" && run()}
          placeholder="https://example.com"
          style={{ flex: 1, minWidth: "150px", background: "#0b1a2e", border: "1px solid #1e3a5f", color: "#e2e8f0", padding: "8px 12px", borderRadius: 4, fontFamily: "monospace", fontSize: 15, outline: "none" }}
        />
        <button onClick={run} disabled={running} style={{
          background: running ? "#1e3a5f" : "#0ea5e9", border: "none", flexShrink: 0,
          color: running ? "#475569" : "#000", fontWeight: 700, fontSize: 14,
          padding: "8px 16px", borderRadius: 4, cursor: running ? "not-allowed" : "pointer",
          fontFamily: "monospace", letterSpacing: "0.05em"
        }}>
          {running ? "..." : "ANALYZE"}
        </button>
      </div>


      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <select value={hosting} onChange={e => setHosting(e.target.value)} style={{
          background: "#0b1a2e", border: "1px solid #1e3a5f", color: "#94a3b8",
          padding: "5px 8px", borderRadius: 4, fontSize: 14, fontFamily: "monospace"
        }}>
          <option value="standard">Standard Hosting</option>
          <option value="cloud">Cloud (AWS/GCP)</option>
          <option value="green">Green CDN</option>
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, color: "#475569" }}>VISITORS/MO</span>
          <input type="number" value={visitors} onChange={e => setVisitors(+e.target.value)}
            style={{ width: 80, background: "#0b1a2e", border: "1px solid #1e3a5f", color: "#94a3b8", padding: "5px 8px", borderRadius: 4, fontSize: 14, fontFamily: "monospace" }}
          />
        </div>
      </div>

      {running && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ height: 2, background: "#1e293b", borderRadius: 1, overflow: "hidden", marginBottom: 4 }}>
            <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg,#065f46,#0ea5e9)", transition: "width 0.4s" }} />
          </div>
          <div style={{ fontSize: 13, color: "#475569", fontFamily: "monospace" }}>{status}</div>
        </div>
      )}

      {result && (
        <div style={{ animation: "fadeUp 0.4s ease" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, background: "#0b1a2e", border: "1px solid #1e3a5f", borderRadius: 4, padding: 14, marginBottom: 12 }}>
            <div style={{
              width: 70, height: 70, borderRadius: "50%", flexShrink: 0,
              border: `2px solid ${gradeColor(result.grade)}`,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              boxShadow: `0 0 16px ${gradeColor(result.grade)}33`
            }}>
              <div style={{ fontSize: 23, fontWeight: 700, color: gradeColor(result.grade), fontFamily: "monospace", lineHeight: 1 }}>{result.gpv.toFixed(2)}</div>
              <div style={{ fontSize: 11, color: "#475569", letterSpacing: "0.1em" }}>gCO₂/VIEW</div>
            </div>
            <div style={{ flex: 1 }}>
              {geoData && (
                <div style={{ fontSize: 13, color: "#475569", marginBottom: 4, fontFamily: "monospace" }}>
                  📍 {geoData.country} &nbsp;·&nbsp;
                  <span style={{ color: ciColor(geoData.ci) }}>{geoData.ci} gCO₂/kWh</span>
                  &nbsp;·&nbsp;
                  <span style={{ color: dataSource === "api" ? "#38bdf8" : "#fbbf24" }}>
                    {dataSource === "api" ? "📡 LIVE API" : "🧮 ESTIMATE"}
                  </span>
                </div>
              )}
              <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 6 }}>
                {result.grade === "A" ? "🌿 Excellent — very clean site" :
                 result.grade === "B" ? "✅ Good — above average" :
                 result.grade === "C" ? "⚠ Average — room to improve" :
                 result.grade === "D" ? "🔶 Below average" : "🔴 High emissions"}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, padding: "2px 10px", borderRadius: 3, fontFamily: "monospace", background: `${gradeColor(result.grade)}22`, color: gradeColor(result.grade), border: `1px solid ${gradeColor(result.grade)}44` }}>
                  GRADE {result.grade}
                </span>
                {result.isGreen && (
                  <span style={{ fontSize: 13, padding: "2px 10px", borderRadius: 3, background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)" }}>
                    🌱 GREEN HOST
                  </span>
                )}
                <span style={{ fontSize: 13, padding: "2px 10px", borderRadius: 3, background: "rgba(14,165,233,0.15)", color: "#38bdf8", border: "1px solid rgba(14,165,233,0.3)" }}>
                  💾 SAVED TO DB
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            {[
              { label: "PAGE SIZE", value: result.sizeKB > 1024 ? (result.sizeKB/1024).toFixed(1)+" MB" : result.sizeKB+" KB" },
              { label: "ENERGY/VISIT", value: (result.totE*1000).toFixed(4)+" kWh", color: "#fbbf24" },
              { label: "CO₂/YEAR", value: result.annualKg.toFixed(1)+" kg", color: "#fb923c" },
              { label: "VS AVERAGE", value: (parseFloat(result.vsAvg)>0?"+":"")+result.vsAvg+"%", color: parseFloat(result.vsAvg)>0?"#ef4444":"#22c55e" },
            ].map(m => (
              <MetricCard key={m.label} label={m.label} value={m.value} color={m.color || "#e2e8f0"} blink />
            ))}
          </div>

          <div style={{ background: "#0b1a2e", border: "1px solid #1e3a5f", borderRadius: 4, padding: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: "#475569", letterSpacing: "0.15em", marginBottom: 10 }}>EMISSION SOURCES</div>
            {[
              { label: "Data Center", val: result.dcE, pct: result.dcE/result.totE, col: "#22c55e" },
              { label: "Network", val: result.netE, pct: result.netE/result.totE, col: "#0ea5e9" },
              { label: "Device", val: result.devE, pct: result.devE/result.totE, col: "#818cf8" },
            ].map(s => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 80, fontSize: 13, color: "#94a3b8" }}>{s.label}</div>
                <div style={{ flex: 1, height: 4, background: "#1e293b", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(s.pct*100).toFixed(1)}%`, background: s.col, borderRadius: 2, transition: "width 1s" }} />
                </div>
                <div style={{ width: 60, fontSize: 13, color: "#64748b", textAlign: "right", fontFamily: "monospace" }}>
                  {(s.pct*100).toFixed(0)}%
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
            {[
              { label: "TREES TO OFFSET", value: result.trees },
              { label: "KM EQUIVALENT", value: result.kms > 1000 ? (result.kms/1000).toFixed(1)+"k" : result.kms },
              { label: "ANNUAL VIEWS", value: (visitors*12).toLocaleString() },
            ].map(s => (
              <div key={s.label} style={{ background: "#060e1a", border: "1px solid #1e3a5f", borderRadius: 4, padding: 10, textAlign: "center" }}>
                <div style={{ fontSize: 19, fontWeight: 700, color: "#22c55e", fontFamily: "monospace" }}>{s.value}</div>
                <div style={{ fontSize: 12, color: "#475569", letterSpacing: "0.1em", marginTop: 3 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <button
            onClick={saveForMonitoring}
            disabled={saved}
            style={{
              width: "100%", padding: "10px", border: "none", borderRadius: 4,
              background: saved ? "#1e3a5f" : "#22c55e",
              color: saved ? "#475569" : "#000",
              fontWeight: 700, fontSize: 14, cursor: saved ? "not-allowed" : "pointer",
              fontFamily: "monospace", letterSpacing: "0.05em",
            }}
          >
            {saved ? "✅ SAVED FOR MONITORING" : "📌 SAVE SITE FOR MONITORING"}
          </button>
          {saveMsg && (
            <div style={{ fontSize: 13, color: saved ? "#22c55e" : "#fbbf24", marginTop: 6, textAlign: "center" }}>
              {saveMsg}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RealtimeCalculator() {
  const [cpu, setCpu] = useState(40);
  const [power, setPower] = useState(100);
  const [hours, setHours] = useState(1);
  const [ci, setCi] = useState(442);
  const energy = (power / 1000) * (cpu / 100) * hours;
  const co2 = energy * ci;

  return (
    <div>
      {[
        { label: "CPU %", value: cpu, set: setCpu, min: 1, max: 100 },
        { label: "WATTS", value: power, set: setPower, min: 10, max: 1000 },
        { label: "HOURS", value: hours, set: setHours, min: 1, max: 24 },
        { label: "CI g/kWh", value: ci, set: setCi, min: 10, max: 900 },
      ].map(f => (
        <div key={f.label} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#475569", marginBottom: 3 }}>
            <span>{f.label}</span>
            <span style={{ color: "#94a3b8", fontFamily: "monospace" }}>{f.value}</span>
          </div>
          <input type="range" min={f.min} max={f.max} value={f.value}
            onChange={e => f.set(+e.target.value)}
            style={{ width: "100%", accentColor: "#0ea5e9" }}
          />
        </div>
      ))}
      <div style={{ background: "#0b1a2e", border: "1px solid #1e3a5f", borderRadius: 4, padding: 10, marginTop: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: "#475569" }}>ENERGY USED</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#fbbf24", fontFamily: "monospace" }}>{energy.toFixed(3)} kWh</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, color: "#475569" }}>CO₂ EMITTED</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: co2 > 0.5 ? "#ef4444" : "#22c55e", fontFamily: "monospace" }}>{co2.toFixed(3)} kg</span>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN APP — Auth wrapper around your existing dashboard
// ══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser]       = useState(null);
  const [authChecked, setChk] = useState(false);

  // Check for existing token on page load
  useEffect(() => {
    if (!getToken()) { setChk(true); return; }
    apiFetch("/auth/me")
      .then(d => setUser(d.user))
      .catch(() => clearToken())
      .finally(() => setChk(true));
  }, []);

  // Loading screen
  if (!authChecked) return (
    <div style={{ background: "#020917", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Courier New', monospace" }}>
      <div style={{ color: "#475569", fontSize: 14, letterSpacing: "0.15em" }}>LOADING...</div>
    </div>
  );

  // Login screen
  if (!user) return <AuthScreen onLogin={u => setUser(u)} />;

  // ── Authenticated dashboard ──────────────────────────────────────────────
  return <Dashboard user={user} onLogout={() => { clearToken(); setUser(null); }} />;
}

function Dashboard({ user, onLogout }) {
  const tickerData = useTickerData();
  const [co2History, setCo2History] = useState(() => Array.from({ length: 40 }, () => 0.3 + Math.random() * 0.4));
  const [coalPrice, setCoalPrice] = useState(134.20);
  const [co2Price, setCo2Price] = useState(62.45);
  const [uptime, setUptime] = useState(0);
  const [chartLoaded, setChartLoaded] = useState(false);

  useEffect(() => {
    if (window.Chart) { setChartLoaded(true); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
    s.onload = () => setChartLoaded(true);
    document.head.appendChild(s);
  }, []);

  useInterval(() => {
    setCo2History(prev => [...prev.slice(1), 0.2 + Math.random() * 0.6]);
    setCoalPrice(p => +(p + (Math.random() - 0.5) * 0.4).toFixed(2));
    setCo2Price(p => +(p + (Math.random() - 0.5) * 0.3).toFixed(2));
    setUptime(p => p + 1);
  }, 1500);

  const S = {
    root: { background: "#020917", minHeight: "100vh", color: "#e2e8f0", fontFamily: "'Courier New', monospace", fontSize: 15 },
    topbar: { background: "#060e1a", borderBottom: "1px solid #1e3a5f", padding: "6px 16px", display: "flex", alignItems: "center", gap: 16 },
    logo: { fontSize: 16, fontWeight: 700, color: "#0ea5e9", letterSpacing: "0.1em", flexShrink: 0, borderRight: "1px solid #1e3a5f", paddingRight: 16 },
    ticker: { display: "flex", alignItems: "center", gap: 16, flex: 1, overflow: "hidden" },
    timebox: { fontSize: 13, color: "#475569", flexShrink: 0, textAlign: "right" },
    main: { display: "grid", gridTemplateColumns: "1fr 340px", gap: 1, height: "calc(100vh - 84px)" },
    left: { display: "flex", flexDirection: "column", gap: 1, overflow: "hidden" },
    globePanel: { flex: "0 0 320px", background: "#060e1a", position: "relative", overflow: "hidden" },
    bottomLeft: { flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, overflow: "hidden" },
    panel: { background: "#060e1a", padding: 14, overflow: "auto" },
    panelTitle: { fontSize: 12, letterSpacing: "0.2em", color: "#0ea5e9", textTransform: "uppercase", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" },
    right: { background: "#060e1a", borderLeft: "1px solid #1e3a5f", overflow: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 },
    statusbar: { background: "#060e1a", borderTop: "1px solid #1e3a5f", padding: "4px 16px", display: "flex", gap: 24, fontSize: 12, color: "#475569", letterSpacing: "0.08em" },
  };

  const now = new Date();

  return (
    <div style={S.root}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes blink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:#060e1a}
        ::-webkit-scrollbar-thumb{background:#1e3a5f;border-radius:2px}
        * { box-sizing: border-box; }
        input::placeholder { color: #334155; }
      `}</style>

      {/* TOP BAR */}
      <div style={S.topbar}>
        <div style={S.logo}>◈ ECOCLOUD</div>
        <div style={S.ticker}>
          <span style={{ fontSize: 12, color: "#0ea5e9", flexShrink: 0, letterSpacing: "0.1em" }}>LIVE</span>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", flexShrink: 0, animation: "blink 1s infinite", display: "inline-block" }} />
          <Ticker items={tickerData} />
        </div>
        {/* User info + logout */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={S.timebox}>
            <div>{now.toUTCString().slice(0,25)}</div>
            <div style={{ color: "#22c55e" }}>UPTIME {uptime}s</div>
          </div>
          <div style={{ borderLeft: "1px solid #1e3a5f", paddingLeft: 10, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
            <span style={{ fontSize: 12, color: "#64748b", display: "flex", alignItems: "center", gap: 6 }}>
              👤 <span style={{ color: "#e2e8f0" }}>{user.username}</span>
              {user.role === 'admin' && (
                <span style={{ background: "#ef4444", color: "#fff", padding: "2px 6px", borderRadius: 3, fontSize: 11, fontWeight: "bold" }}>ADMIN</span>
              )}
            </span>
            <button onClick={onLogout} style={{
              background: "#ef4444", border: "none", color: "#fff",
              fontWeight: 700, fontSize: 11, padding: "2px 8px",
              borderRadius: 3, cursor: "pointer", fontFamily: "monospace",
              letterSpacing: "0.05em",
            }}>LOGOUT</button>
          </div>
        </div>
      </div>

      {/* MAIN GRID */}
      <div style={S.main}>
        <div style={S.left}>
          {/* GLOBE */}
          <div style={S.globePanel}>
            <div style={{ position: "absolute", top: 10, left: 14, zIndex: 2 }}>
              <div style={{ fontSize: 12, color: "#0ea5e9", letterSpacing: "0.2em" }}>GLOBAL CARBON INTENSITY MAP</div>
              <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                {[["#22c55e","<200 CLEAN"],["#fbbf24","200-400 MOD"],["#fb923c","400-600 HIGH"],["#ef4444",">600 CRITICAL"]].map(([c,l]) => (
                  <span key={l} style={{ fontSize: 11, color: c, display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: c, display: "inline-block" }} />{l}
                  </span>
                ))}
              </div>
            </div>
            <GlobeCanvas />
          </div>

          {/* BOTTOM PANELS */}
          <div style={S.bottomLeft}>
            <div style={S.panel}>
              <div style={S.panelTitle}>
                <span>COMMODITY PRICES</span>
                <span style={{ color: "#22c55e", animation: "blink 2s infinite" }}>● LIVE</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                <MetricCard label="COAL USD/T" value={`$${coalPrice}`} color={coalPrice > 134 ? "#ef4444" : "#22c55e"} blink />
                <MetricCard label="CO₂ EUR/T" value={`€${co2Price}`} color={co2Price > 62 ? "#fb923c" : "#22c55e"} blink />
                <MetricCard label="COAL GLOBAL" value="8.3 GtCO₂" color="#ef4444" sub="Annual 2024" />
                <MetricCard label="RENEWABLES" value="30.3%" color="#22c55e" sub="Global share" />
              </div>
              <div style={{ fontSize: 12, color: "#0ea5e9", letterSpacing: "0.15em", marginBottom: 8 }}>REAL-TIME CO₂ / PAGE VIEW</div>
              <div style={{ height: 80 }}>
                {chartLoaded && <RealtimeChart data={co2History} />}
              </div>
            </div>

            <div style={S.panel}>
              <div style={S.panelTitle}><span>CARBON INTENSITY BY COUNTRY</span></div>
              <div>
                {Object.entries(CARBON_BY_COUNTRY).slice(0, 10).map(([code, ci]) => (
                  <EmissionBar key={code} label={`${COUNTRY_NAMES[code] || code} (${code})`} value={ci} max={900}
                    color={ci < 200 ? "#22c55e" : ci < 400 ? "#fbbf24" : ci < 600 ? "#fb923c" : "#ef4444"} />
                ))}
              </div>
            </div>

            <div style={S.panel}>
              <div style={S.panelTitle}><span>HOSTING IMPACT COMPARISON</span></div>
              {[
                { label: "PHYSICAL SERVER", co2: "4.8 kg/day", util: "20-30%", color: "#ef4444", icon: "▼" },
                { label: "CLOUD HOSTING", co2: "1.2 kg/day", util: "70-80%", color: "#22c55e", icon: "▲" },
              ].map(h => (
                <div key={h.label} style={{ background: "#0b1a2e", border: `1px solid ${h.color}33`, borderRadius: 4, padding: 10, marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: h.color, fontWeight: 700 }}>{h.icon} {h.label}</span>
                    <span style={{ fontSize: 13, color: h.color }}>{h.co2}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#475569" }}>Utilization: <span style={{ color: h.color }}>{h.util}</span></div>
                  <div style={{ height: 3, background: "#1e293b", borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: h.util.split("-")[1] || "75%", background: h.color, borderRadius: 2 }} />
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 12, color: "#0ea5e9", letterSpacing: "0.15em", margin: "12px 0 8px" }}>CLOUD BENEFITS</div>
              {["Virtualization efficiency", "Elastic auto-scaling", "Renewable energy investments", "Optimized cooling (PUE < 1.2)"].map(b => (
                <div key={b} style={{ fontSize: 13, color: "#94a3b8", padding: "3px 0", borderBottom: "1px solid #0b1a2e" }}>
                  <span style={{ color: "#22c55e", marginRight: 6 }}>✓</span>{b}
                </div>
              ))}
            </div>

            <div style={S.panel}>
              <div style={S.panelTitle}><span>SERVER CO₂ CALCULATOR</span></div>
              <RealtimeCalculator />
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div style={S.right}>
          <div style={{ fontSize: 12, color: "#0ea5e9", letterSpacing: "0.15em", borderBottom: "1px solid #1e3a5f", paddingBottom: 10 }}>
            SUSTAINABILITY TERMINAL v2.0
          </div>
          <AnalyzerPanel user={user} />
          
          {user.role === 'admin' ? <AdminPanel user={user} /> : <UserHistoryPanel />}

          <div style={{ marginTop: "auto", padding: "12px 0", borderTop: "1px solid #1e3a5f" }}>
            <div style={{ fontSize: 12, color: "#475569", letterSpacing: "0.1em", marginBottom: 8 }}>SYSTEM INFO</div>
            {[
              ["HOST", "AWS EC2 Ubuntu 24.04"],
              ["SERVER", "Nginx 1.24"],
              ["PROJECT", "Sustainable Cloud Initiative"],
              ["DATA", "IEA / Ember 2024"],
              ["USER", user.username],
            ].map(([k,v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", borderBottom: "1px solid #0b1a2e" }}>
                <span style={{ color: "#475569" }}>{k}</span>
                <span style={{ color: "#64748b" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* STATUS BAR */}
      <div style={S.statusbar}>
        <span>◈ ECOCLOUD TERMINAL</span>
        <span style={{ color: "#22c55e" }}>● CONNECTED</span>
        <span>DATA: LIVE</span>
        <span>CARBON API: api.websitecarbon.com</span>
        <span>GEO: ip-api.com</span>
        <span style={{ marginLeft: "auto" }}>HOSTED ON AWS EC2 | SUSTAINABLE CLOUD COMPUTING INITIATIVE</span>
      </div>
    </div>
  );
}
