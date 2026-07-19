import React, { createContext, useContext, useState, useEffect } from "react";
import { getTokens, type ColorTokens, type Theme } from "@zakhira/ui";
import { Store } from "@tauri-apps/plugin-store";

let _store: Store | null = null;
async function getStore() {
  if (!_store) _store = await Store.load("settings.json");
  return _store;
}

interface ThemeContextValue {
  theme: Theme;
  tokens: ColorTokens;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    getStore().then(async (s) => {
      const stored = await s.get<string>("theme");
      if (stored === "light" || stored === "dark") setTheme(stored);
    });
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    getStore().then((s) => s.set("theme", next).then(() => s.save()));
  };

  // Apply CSS vars to document
  useEffect(() => {
    const t = getTokens(theme);
    const root = document.documentElement;
    Object.entries(t).forEach(([k, v]) => {
      root.style.setProperty(`--${k.replace(/([A-Z])/g, "-$1").toLowerCase()}`, v);
    });
    root.setAttribute("data-theme", theme);
    document.body.style.backgroundColor = t.bgPage;
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, tokens: getTokens(theme), toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
