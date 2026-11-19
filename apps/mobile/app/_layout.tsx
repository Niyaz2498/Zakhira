import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider } from "../src/theme/ThemeContext";
import { loadPersistedState, sync, subscribe, getStore } from "../src/store";
import { reconcileTimerAlerts } from "../src/notifications";
import { AppState } from "react-native";

/**
 * How often to retry while writes are waiting to go out.
 *
 * This is the app noticing that the connection came back. It stands in for a
 * connectivity listener on purpose — the only question that matters is whether
 * a request succeeds, and asking costs less than a native module that reports
 * the radio's opinion. The interval runs only while something is queued, so an
 * app with nothing to send is doing nothing at all.
 */
const RETRY_INTERVAL_MS = 30_000;

export default function RootLayout() {
  useEffect(() => {
    loadPersistedState().then(() => sync());

    // Keep hourly "timer still running" alerts in step with the tasks. Driven
    // off store changes rather than the timer buttons, so a timer started or
    // stopped on another device is picked up on the next sync too.
    const unsubscribe = subscribe((store) => {
      reconcileTimerAlerts(store.tasks);
    });

    // Sync on foreground, taking the chance to prune anything deleted
    // elsewhere while the app was away.
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") sync({ full: true });
    });

    const retry = setInterval(() => {
      if (getStore().pending.length > 0) void sync();
    }, RETRY_INTERVAL_MS);

    return () => {
      sub.remove();
      unsubscribe();
      clearInterval(retry);
    };
  }, []);

  return (
    <ThemeProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
