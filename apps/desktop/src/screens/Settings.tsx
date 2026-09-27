import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useTheme } from "../theme/ThemeContext";
import { useStore } from "../store/useStore";
import { setDisplayName } from "../store";
import type { ColorTokens } from "@zakhira/ui";
import { getVersion } from "@tauri-apps/api/app";
import { useUpdater, checkForUpdate, installUpdate } from "../updater";

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
  const updater = useUpdater();
  const [appVersion, setAppVersion] = useState("—");

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch((err) => console.warn("[settings] version lookup failed:", err));
  }, []);

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

        {/* Updates */}
        <section style={section}>
          <SectionTitle label="Updates" tokens={tokens} />
          <div style={row}>
            <span style={{ color: tokens.textPrimary }}>Version</span>
            <span style={{ color: tokens.textTertiary, fontSize: 12 }}>
              {appVersion}
            </span>
          </div>
          <div style={lastRow}>
            <span style={{ color: tokens.textPrimary }}>
              {updater.status === "available" || updater.status === "downloading"
                ? `Update to v${updater.version}`
                : "Check for updates"}
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {updater.checkedAndCurrent && updater.status === "idle" && (
                <span style={{ color: tokens.textTertiary, fontSize: 12 }}>
                  Up to date
                </span>
              )}
              <button
                onClick={
                  updater.status === "available" ? installUpdate : checkForUpdate
                }
                disabled={
                  updater.status === "checking" || updater.status === "downloading"
                }
                style={{
                  padding: "6px 14px",
                  border: `1px solid ${tokens.border}`,
                  borderRadius: 8,
                  color:
                    updater.status === "available"
                      ? tokens.accentOn
                      : tokens.textPrimary,
                  backgroundColor:
                    updater.status === "available"
                      ? tokens.accent
                      : tokens.bgSurface,
                  fontSize: 13,
                  fontWeight: updater.status === "available" ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                {updater.status === "checking"
                  ? "Checking…"
                  : updater.status === "downloading"
                    ? updater.progress !== null
                      ? `${updater.progress}%`
                      : "Downloading…"
                    : updater.status === "ready"
                      ? "Restarting…"
                      : updater.status === "available"
                        ? "Restart to update"
                        : "Check now"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
