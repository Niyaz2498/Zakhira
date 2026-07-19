import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
import { useTheme } from "../theme/ThemeContext";
import { useStore } from "../store/useStore";
import { getClient, setDisplayName } from "../store";
import type { ApiKey } from "@zakhira/core";
import type { ColorTokens } from "@zakhira/ui";

function SectionTitle({ label, tokens }: { label: string; tokens: ColorTokens }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: tokens.textSecondary,
        marginBottom: 12,
      }}
    >
      {label}
    </div>
  );
}

export function Settings() {
  const { tokens, theme, toggleTheme } = useTheme();
  const store = useStore();
  const [nameInput, setNameInput] = useState(store.displayName ?? "");
  const [nameSaved, setNameSaved] = useState(false);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [keysLoaded, setKeysLoaded] = useState(false);

  useEffect(() => {
    const client = getClient();
    if (!client) { setKeysLoaded(true); return; }
    client.listApiKeys().then((res) => {
      if (res.ok) setApiKeys(res.data);
      setKeysLoaded(true);
    }).catch(() => setKeysLoaded(true));
  }, []);

  async function handleRevoke(id: string, name: string) {
    if (!confirm(`Revoke key "${name}"? This cannot be undone.`)) return;
    const client = getClient();
    if (!client) return;
    const res = await client.revokeApiKey(id);
    if (res.ok) setApiKeys((prev) => prev.filter((k) => k.id !== id));
  }

  const section: CSSProperties = {
    backgroundColor: tokens.bgCard,
    border: `1px solid ${tokens.border}`,
    borderRadius: 12,
    padding: "16px 18px",
    marginBottom: 20,
  };

  const row: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 0",
    borderBottom: `1px solid ${tokens.border}`,
  };

  const lastRow: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 0",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          padding: "14px 24px",
          borderBottom: `1px solid ${tokens.border}`,
          backgroundColor: tokens.bgSurface,
          flexShrink: 0,
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, color: tokens.textPrimary }}>Settings</h1>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "24px", maxWidth: 560 }}>
        {/* Profile */}
        <section style={section}>
          <SectionTitle label="Profile" tokens={tokens} />
          <div style={lastRow}>
            <span style={{ color: tokens.textPrimary }}>Display Name</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                value={nameInput}
                onChange={(e) => { setNameInput(e.target.value); setNameSaved(false); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setDisplayName(nameInput);
                    setNameSaved(true);
                    setTimeout(() => setNameSaved(false), 2000);
                  }
                }}
                placeholder="e.g. Niyaz"
                style={{
                  padding: "6px 10px", borderRadius: 7, border: `1px solid ${tokens.border}`,
                  backgroundColor: tokens.bgInput, color: tokens.textPrimary, fontSize: 13,
                  width: 160, outline: "none",
                }}
              />
              <button
                onClick={() => {
                  setDisplayName(nameInput);
                  setNameSaved(true);
                  setTimeout(() => setNameSaved(false), 2000);
                }}
                style={{
                  padding: "6px 12px", borderRadius: 7,
                  backgroundColor: nameSaved ? tokens.stateCompleted : tokens.accent,
                  color: nameSaved ? "#fff" : tokens.accentOn,
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                {nameSaved ? "Saved ✓" : "Save"}
              </button>
            </div>
          </div>
        </section>

        {/* Appearance */}
        <section style={section}>
          <SectionTitle label="Appearance" tokens={tokens} />
          <div style={lastRow}>
            <span style={{ color: tokens.textPrimary }}>Theme</span>
            <button
              onClick={toggleTheme}
              style={{
                padding: "6px 14px",
                border: `1px solid ${tokens.border}`,
                borderRadius: 8,
                color: tokens.textPrimary,
                backgroundColor: tokens.bgSurface,
                fontSize: 13,
              }}
            >
              {theme === "dark" ? "🌙 Dark" : "☀ Light"}
            </button>
          </div>
        </section>

        {/* Sync */}
        <section style={section}>
          <SectionTitle label="Sync" tokens={tokens} />
          <div style={row}>
            <span style={{ color: tokens.textPrimary }}>Server</span>
            <span style={{ color: tokens.textTertiary, fontSize: 12 }}>{store.apiUrl}</span>
          </div>
          <div style={lastRow}>
            <span style={{ color: tokens.textPrimary }}>Last synced</span>
            <span style={{ color: tokens.textTertiary, fontSize: 12 }}>
              {store.lastSyncedAt
                ? new Date(store.lastSyncedAt).toLocaleTimeString()
                : "Never"}
            </span>
          </div>
        </section>

        {/* API Keys */}
        <section style={section}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <SectionTitle label="API Keys" tokens={tokens} />
            <button
              style={{ color: tokens.accent, fontSize: 13, fontWeight: 500 }}
            >
              + New key
            </button>
          </div>
          {!keysLoaded && (
            <div style={{ color: tokens.textTertiary, fontSize: 13 }}>Loading…</div>
          )}
          {keysLoaded && apiKeys.length === 0 && (
            <div style={{ color: tokens.textTertiary, fontSize: 13 }}>No API keys yet.</div>
          )}
          {apiKeys.map((k, i) => (
            <div
              key={k.id}
              style={i < apiKeys.length - 1 ? row : lastRow}
            >
              <div>
                <div style={{ fontSize: 14, color: tokens.textPrimary, fontWeight: 500 }}>
                  {k.name}
                </div>
                <div style={{ fontSize: 12, color: tokens.textTertiary }}>
                  {k.scope === "all"
                    ? "Full access"
                    : `Scoped (${k.operationIds?.length ?? 0} operations)`}
                </div>
              </div>
              <button
                onClick={() => handleRevoke(k.id, k.name)}
                style={{ color: "#e05555", fontSize: 13 }}
              >
                Revoke
              </button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
