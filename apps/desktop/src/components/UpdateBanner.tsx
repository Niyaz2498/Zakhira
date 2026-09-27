import { useTheme } from "../theme/ThemeContext";
import { useUpdater, installUpdate, dismissUpdate } from "../updater";

/**
 * Non-blocking strip shown above the main content when an update is waiting.
 * Renders nothing at all when there is no update, so it costs no layout in the
 * normal case.
 */
export function UpdateBanner() {
  const { tokens } = useTheme();
  const { status, version, progress, dismissed } = useUpdater();

  const active = status === "available" || status === "downloading" || status === "ready";
  if (!active || dismissed) return null;

  const busy = status === "downloading" || status === "ready";

  const label =
    status === "ready"
      ? "Restarting…"
      : status === "downloading"
        ? progress !== null
          ? `Downloading ${progress}%`
          : "Downloading…"
        : "Restart to update";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "9px 24px",
        backgroundColor: tokens.accent + "1a",
        borderBottom: `1px solid ${tokens.border}`,
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 14 }}>⬆</span>
      <span style={{ fontSize: 13, color: tokens.textPrimary, flex: 1 }}>
        Update available{version ? ` — v${version}` : ""}
      </span>

      <button
        onClick={installUpdate}
        disabled={busy}
        style={{
          padding: "5px 12px",
          borderRadius: 7,
          backgroundColor: tokens.accent,
          color: tokens.accentOn,
          fontSize: 12,
          fontWeight: 600,
          cursor: busy ? "default" : "pointer",
          opacity: busy ? 0.7 : 1,
        }}
      >
        {label}
      </button>

      <button
        onClick={dismissUpdate}
        title="Dismiss until next launch"
        style={{
          color: tokens.textTertiary,
          fontSize: 14,
          padding: "0 4px",
          cursor: "pointer",
        }}
      >
        ✕
      </button>
    </div>
  );
}
