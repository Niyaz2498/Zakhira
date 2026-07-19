import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider } from "../src/theme/ThemeContext";
import { loadFromSecureStore, sync } from "../src/store";
import { AppState } from "react-native";

export default function RootLayout() {
  useEffect(() => {
    loadFromSecureStore().then(() => sync());

    // Sync on foreground
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });
    return () => sub.remove();
  }, []);

  return (
    <ThemeProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
