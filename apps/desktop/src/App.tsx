import { useEffect, useState } from "react";
import { ThemeProvider, useTheme } from "./theme/ThemeContext";
import { loadFromStore, sync } from "./store";
import { useStore } from "./store/useStore";
import { Dashboard } from "./screens/Dashboard";
import { Operations } from "./screens/Operations";
import { RemindersScreen } from "./screens/Reminders";
import { Settings } from "./screens/Settings";
import { Setup } from "./screens/Setup";
import { TaskHistory } from "./screens/TaskHistory";

type Screen = "dashboard" | "operations" | "reminders" | "history" | "settings";

function Shell() {
  const { tokens, theme, toggleTheme } = useTheme();
  const store = useStore();
  const [screen, setScreen] = useState<Screen>("dashboard");

  useEffect(() => {
    loadFromStore();
    sync();
    const interval = setInterval(() => sync(), 60_000);
    return () => clearInterval(interval);
  }, []);

  if (!store.apiKey) return <Setup />;

  const navItems: { key: Screen; label: string; icon: string }[] = [
    { key: "dashboard", label: "Dashboard", icon: "⊞" },
    { key: "operations", label: "Operations", icon: "⊛" },
    { key: "reminders", label: "Reminders", icon: "◷" },
    { key: "history", label: "Task History", icon: "⊟" },
    { key: "settings", label: "Settings", icon: "⚙" },
  ];

  return (
    <div style={{ display: "flex", height: "100%", backgroundColor: tokens.bgPage }}>
      {/* Sidebar */}
      <nav
        style={{
          width: 220,
          backgroundColor: tokens.bgSurface,
          borderRight: `1px solid ${tokens.border}`,
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        {/* Wordmark */}
        <div
          style={{
            padding: "20px 16px 16px",
            borderBottom: `1px solid ${tokens.border}`,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, color: tokens.accent }}>Zakhira</div>
          <div style={{ fontSize: 12, color: tokens.textTertiary, marginTop: 2 }}>
            Welcome back
          </div>
        </div>

        {/* Nav items */}
        <div style={{ padding: "8px 8px", flex: 1 }}>
          {navItems.map((item) => {
            const active = screen === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setScreen(item.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "9px 10px",
                  borderRadius: 8,
                  marginBottom: 2,
                  backgroundColor: active ? tokens.accent + "22" : "transparent",
                  color: active ? tokens.accent : tokens.textSecondary,
                  fontWeight: active ? 600 : 400,
                  fontSize: 14,
                  textAlign: "left",
                  transition: "background 0.12s",
                }}
              >
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Theme toggle */}
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${tokens.border}` }}>
          <button
            onClick={toggleTheme}
            style={{
              color: tokens.textTertiary,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {theme === "dark" ? "☀ Light mode" : "🌙 Dark mode"}
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {screen === "dashboard" && <Dashboard />}
        {screen === "operations" && <Operations />}
        {screen === "reminders" && <RemindersScreen />}
        {screen === "history" && <TaskHistory />}
        {screen === "settings" && <Settings />}
      </main>
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <Shell />
    </ThemeProvider>
  );
}
