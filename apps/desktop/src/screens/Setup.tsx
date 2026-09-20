import { useState } from "react";
import type { CSSProperties } from "react";
import { useTheme } from "../theme/ThemeContext";
import { saveToken, sync } from "../store";
import { ZakhiraClient } from "@zakhira/core";
import type { ColorTokens } from "@zakhira/ui";

export function Setup() {
  const { tokens } = useTheme();
  const url = import.meta.env.VITE_API_URL ?? "https://zakhira-backend.zakhira.workers.dev";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    setError(null);
    if (!username.trim() || !password || !url.trim()) {
      setError("Username, password, and server URL are all required.");
      return;
    }
    setLoading(true);
    try {
      const client = new ZakhiraClient(url.trim(), "");
      const res = await client.login(username.trim(), password);
      if (!res.ok) {
        setError(res.error ?? "Invalid username or password.");
        setLoading(false);
        return;
      }
      saveToken(res.data.token, url.trim());
      sync().catch(console.error);
    } catch (e) {
      setError(`Could not reach the server. Check the URL.\n${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        backgroundColor: tokens.bgPage,
      }}
    >
      <div
        style={{
          width: 400,
          backgroundColor: tokens.bgCard,
          border: `1px solid ${tokens.border}`,
          borderRadius: 16,
          padding: 32,
        }}
      >
        <h1 style={{ color: tokens.accent, fontSize: 28, fontWeight: 700, marginBottom: 4 }}>
          Zakhira
        </h1>
        <p style={{ color: tokens.textTertiary, fontSize: 13, marginBottom: 32 }}>
          Sign in to get started.
        </p>

        <label style={{ display: "block", marginBottom: 16 }}>
          <span style={{ display: "block", fontSize: 11, color: tokens.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            Username
          </span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={inputStyle(tokens)}
            placeholder="your username"
            autoComplete="username"
          />
        </label>

        <label style={{ display: "block", marginBottom: 24 }}>
          <span style={{ display: "block", fontSize: 11, color: tokens.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleConnect()}
            style={inputStyle(tokens)}
            placeholder="your password"
            autoComplete="current-password"
          />
        </label>

        {error && (
          <div style={{ color: "#e05555", fontSize: 13, marginBottom: 16 }}>{error}</div>
        )}

        <button
          onClick={handleConnect}
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px",
            backgroundColor: tokens.accent,
            color: tokens.accentOn,
            fontWeight: 600,
            fontSize: 15,
            borderRadius: 10,
            opacity: loading ? 0.6 : 1,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </div>
    </div>
  );
}

function inputStyle(tokens: ColorTokens): CSSProperties {
  return {
    display: "block",
    width: "100%",
    padding: "10px 12px",
    backgroundColor: tokens.bgInput,
    border: `1px solid ${tokens.border}`,
    borderRadius: 8,
    color: tokens.textPrimary,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  };
}
