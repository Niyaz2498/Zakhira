import { useState } from "react";
import type { CSSProperties } from "react";
import { useTheme } from "../theme/ThemeContext";
import { saveCredentials, sync } from "../store";
import { ZakhiraClient } from "@zakhira/core";
import type { ColorTokens } from "@zakhira/ui";

export function Setup() {
  const { tokens } = useTheme();
  const [url, setUrl] = useState("http://localhost:8787");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    setError(null);
    if (!apiKey.trim() || !url.trim()) {
      setError("Both URL and API key are required.");
      return;
    }
    setLoading(true);

    // Step 1: verify the connection and key
    let connectionOk = false;
    try {
      const client = new ZakhiraClient(url.trim(), apiKey.trim());
      const res = await client.listOperations();
      if (!res.ok) {
        setError(res.error ?? "Invalid API key.");
        setLoading(false);
        return;
      }
      connectionOk = true;
    } catch (e) {
      setError(`Could not reach the server. Check the URL.\n${e instanceof Error ? e.message : String(e)}`);
      setLoading(false);
      return;
    }

    // Step 2: persist credentials and kick off initial sync
    if (connectionOk) {
      saveCredentials(apiKey.trim(), url.trim()); // sync, updates store immediately
      sync().catch(console.error);
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
          Connect to your backend to get started.
        </p>

        <label style={{ display: "block", marginBottom: 16 }}>
          <span style={{ display: "block", fontSize: 11, color: tokens.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            Server URL
          </span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={inputStyle(tokens)}
            placeholder="http://localhost:8787"
          />
        </label>

        <label style={{ display: "block", marginBottom: 24 }}>
          <span style={{ display: "block", fontSize: 11, color: tokens.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            API Key
          </span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            style={{ ...inputStyle(tokens), fontFamily: "'JetBrains Mono', monospace" }}
            placeholder="Paste your key"
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
          {loading ? "Connecting…" : "Connect"}
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
  };
}
