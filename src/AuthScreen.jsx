import { useState } from "react";

const API = "http://localhost:5000/api";

export const getToken   = () => localStorage.getItem("cc_token");
export const setToken   = t  => localStorage.setItem("cc_token", t);
export const clearToken = () => localStorage.removeItem("cc_token");

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export default function AuthScreen({ onLogin }) {
  const [mode, setMode]     = useState("login");
  const [username, setUser] = useState("");
  const [password, setPass] = useState("");
  const [email, setEmail]   = useState("");
  const [role, setRole]     = useState("user");
  const [error, setError]   = useState("");
  const [loading, setLoad]  = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(""); setLoad(true);
    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const body = mode === "login"
        ? { username, password }
        : { username, password, email, role };
      const data = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setToken(data.token);
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoad(false);
    }
  }

  return (
    <div style={{
      background: "#020917", minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Courier New', monospace",
    }}>
      <div style={{ width: "100%", maxWidth: 420, padding: "0 20px" }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 31, fontWeight: 700, color: "#0ea5e9", letterSpacing: "0.1em" }}>
            ◈ CLOUDCARBON
          </div>
          <div style={{ fontSize: 13, color: "#475569", letterSpacing: "0.2em", marginTop: 6 }}>
            SUSTAINABLE CLOUD INFRASTRUCTURE TERMINAL
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: "#060e1a", border: "1px solid #1e3a5f",
          borderRadius: 8, padding: "32px 28px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          position: "relative", overflow: "hidden",
        }}>
          {/* Top accent */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 2,
            background: "linear-gradient(90deg, transparent, #0ea5e9, #22c55e, transparent)",
          }}/>

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid #1e3a5f", marginBottom: 28 }}>
            {["login", "register"].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(""); }} style={{
                flex: 1, background: "none", border: "none",
                color: mode === m ? "#0ea5e9" : "#475569",
                fontFamily: "'Courier New', monospace",
                fontSize: 13, letterSpacing: "0.15em",
                textTransform: "uppercase", padding: "8px 0",
                cursor: "pointer",
                borderBottom: `2px solid ${mode === m ? "#0ea5e9" : "transparent"}`,
                marginBottom: -1, transition: "color 0.2s",
              }}>
                {m === "login" ? "Sign In" : "Register"}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase", color: "#475569", marginBottom: 5, display: "block" }}>
                Username
              </label>
              <input
                value={username} onChange={e => setUser(e.target.value)}
                placeholder="Enter username" required
                style={{ width: "100%", background: "#0b1a2e", border: "1px solid #1e3a5f", color: "#e2e8f0", padding: "10px 14px", borderRadius: 4, fontFamily: "'Courier New', monospace", fontSize: 15, outline: "none" }}
              />
            </div>

            {mode === "register" && (
              <>
                <div>
                  <label style={{ fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase", color: "#475569", marginBottom: 5, display: "block" }}>
                    Email (optional)
                  </label>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    style={{ width: "100%", background: "#0b1a2e", border: "1px solid #1e3a5f", color: "#e2e8f0", padding: "10px 14px", borderRadius: 4, fontFamily: "'Courier New', monospace", fontSize: 15, outline: "none" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase", color: "#475569", marginBottom: 5, display: "block" }}>
                    Account Role
                  </label>
                  <select
                    value={role} onChange={e => setRole(e.target.value)}
                    style={{ width: "100%", background: "#0b1a2e", border: "1px solid #1e3a5f", color: "#e2e8f0", padding: "10px 14px", borderRadius: 4, fontFamily: "'Courier New', monospace", fontSize: 15, outline: "none" }}
                  >
                    <option value="user">Normal User</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <label style={{ fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase", color: "#475569", marginBottom: 5, display: "block" }}>
                Password
              </label>
              <input
                type="password" value={password} onChange={e => setPass(e.target.value)}
                placeholder={mode === "register" ? "Min 6 characters" : "Enter password"}
                required
                style={{ width: "100%", background: "#0b1a2e", border: "1px solid #1e3a5f", color: "#e2e8f0", padding: "10px 14px", borderRadius: 4, fontFamily: "'Courier New', monospace", fontSize: 15, outline: "none" }}
              />
            </div>

            {error && (
              <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 4, padding: "10px 14px", fontSize: 14, color: "#ef4444" }}>
                ⚠ {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              background: loading ? "#1e3a5f" : "#0ea5e9",
              border: "none", color: loading ? "#475569" : "#000",
              fontWeight: 700, fontSize: 15, padding: "12px",
              borderRadius: 4, cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "'Courier New', monospace",
              letterSpacing: "0.05em", marginTop: 4,
            }}>
              {loading ? "Please wait..." : mode === "login" ? "SIGN IN →" : "CREATE ACCOUNT →"}
            </button>
          </form>

          {/* Demo credentials */}
          {mode === "login" && (
            <div style={{ marginTop: 20, padding: "12px 14px", background: "#0b1a2e", borderRadius: 4 }}>
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 4, letterSpacing: "0.1em" }}>
                DEMO CREDENTIALS
              </div>
              <div style={{ fontSize: 13, color: "#64748b" }}>
                Username: <span style={{ color: "#e2e8f0" }}>demo</span>
                &nbsp;·&nbsp;
                Password: <span style={{ color: "#e2e8f0" }}>demo123</span>
              </div>
            </div>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "#475569", letterSpacing: "0.1em" }}>
          HOSTED ON AWS EC2 · SUSTAINABLE CLOUD INITIATIVE
        </div>
      </div>
    </div>
  );
}