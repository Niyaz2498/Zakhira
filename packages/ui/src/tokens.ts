// Design tokens — "Ink & Amber" (dark) and "Sage & Brass" (light)
// Values locked in DESIGN.md §6.

export const dark = {
  bgPage: "#101115",
  bgSurface: "#16171c",
  bgCard: "#1e2026",
  bgInput: "#181a1f",
  border: "#26282f",
  borderStrong: "#3a3e48",
  accent: "#d9a441",
  accentOn: "#16171c",
  textPrimary: "#e8e6e2",
  textSecondary: "#a4a8b0",
  textTertiary: "#86837c",
  tierMain: "#d9a441",
  tierSide: "#b8bcc0",
  tierExplore: "#bd7d4a",
  // State colors
  stateTodo: "#94a3b8",
  stateInProgress: "#3b82f6",
  stateBlocked: "#f59e0b",
  stateCompleted: "#22c55e",
  stateScrapped: "#6b7280",
} as const;

export const light = {
  bgPage: "#e8ede6",
  bgSurface: "#f1f4ef",
  bgCard: "#fbfcfa",
  bgInput: "#ffffff",
  border: "#dde4da",
  borderStrong: "#c3ccc0",
  accent: "#a48a36",
  accentOn: "#ffffff",
  textPrimary: "#272d28",
  textSecondary: "#5c635c",
  textTertiary: "#7d857d",
  tierMain: "#a48a36",
  tierSide: "#98a098",
  tierExplore: "#9c6f45",
  // State colors
  stateTodo: "#64748b",
  stateInProgress: "#2563eb",
  stateBlocked: "#d97706",
  stateCompleted: "#16a34a",
  stateScrapped: "#9a9a94",
} as const;

export type ColorTokens = typeof dark;
export type Theme = "dark" | "light";

export function getTokens(theme: Theme): ColorTokens {
  return theme === "dark" ? dark : light;
}
