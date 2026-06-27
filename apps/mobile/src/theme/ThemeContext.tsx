import React, { createContext, useContext, useState, useEffect } from "react";
import { useColorScheme } from "react-native";
import { getTokens, type ColorTokens, type Theme } from "@zakhira/ui";
import * as SecureStore from "expo-secure-store";

const THEME_KEY = "zakhira_theme";

interface ThemeContextValue {
  theme: Theme;
  tokens: ColorTokens;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [theme, setTheme] = useState<Theme>(systemScheme === "light" ? "light" : "dark");

  useEffect(() => {
    SecureStore.getItemAsync(THEME_KEY).then((stored) => {
      if (stored === "light" || stored === "dark") setTheme(stored);
    });
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    SecureStore.setItemAsync(THEME_KEY, next);
  };

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
