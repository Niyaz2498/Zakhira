import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider } from "../src/theme/ThemeContext";
import { loadFromSecureStore, sync, subscribe } from "../src/store";
import { reconcileTimerAlerts } from "../src/notifications";
import { AppState } from "react-native";

export default function RootLayout() {
  useEffect(() => {
    loadFromSecureStore().then(() => sync());

    // Keep hourly "timer still running" alerts in step with the tasks. Driven
    // off store changes rather than the timer buttons, so a timer started or
    // stopped on another device is picked up on the next sync too.
    const unsubscribe = subscribe((store) => {
      reconcileTimerAlerts(store.tasks);
    });

    // Sync on foreground
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });
    return () => {
      sub.remove();
      unsubscribe();
    };
  }, []);

  return (
    <ThemeProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
